require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const createApp = require('./app');
const connectDB = require('./config/db');
const { assertPaymobConfig } = require('./services/paymobService');

const PORT = process.env.PORT || 5000;

let server;
let isShuttingDown = false;

function getPortDiagnostics(port) {
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        timeout: 1500,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = output.split('\n').map((l) => l.trim());
      const listeningLine = lines.find((l) => l.toUpperCase().includes('LISTENING'));
      if (listeningLine) {
        const tokens = listeningLine.split(/\s+/);
        const pid = tokens[tokens.length - 1];
        if (pid && !isNaN(Number(pid))) {
          return `Process ID (PID) ${pid} is currently listening on port ${port}.`;
        }
      }
    } catch (_) {
      // Diagnostic inspection failed or timed out; fallback to general guidance
    }
  }
  return `Another process is currently listening on port ${port}.`;
}

async function cleanupResources() {
  try {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[server] MongoDB connection closed.');
    }
  } catch (dbErr) {
    console.error('[server] Error closing database connection:', dbErr.message);
  }
}

async function start() {
  try {
    // Fail fast in production if Paymob credentials are missing or invalid.
    // This must run before connectDB/app.listen so the process exits with a
    // clear, non-secret error message rather than starting in an unsafe state.
    assertPaymobConfig();

    await connectDB();
    const app = createApp();

    server = http.createServer(app);

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        const diag = getPortDiagnostics(PORT);
        console.error('\n========================================================');
        console.error(`[server] ERROR: Port ${PORT} is already in use.`);
        console.error(`[server] ${diag}`);
        console.error('[server] Actionable steps to resolve:');
        console.error(`[server]   1. Identify occupying process on Windows:`);
        console.error(`[server]      netstat -ano | findstr :${PORT}`);
        console.error(`[server]      Get-NetTCPConnection -LocalPort ${PORT} | Select-Object OwningProcess`);
        console.error(`[server]   2. Terminate the duplicate backend process or orphaned node process.`);
        console.error(`[server]   3. Ensure you do not have multiple terminals running 'npm run dev' simultaneously.`);
        console.error('========================================================\n');
      } else {
        console.error('[server] Server error:', err.message);
      }

      await cleanupResources();
      process.exit(1);
    });

    server.listen(PORT, () => {
      console.log(`[server] Egyptian Space Agency Academy API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    await cleanupResources();
    process.exit(1);
  }
}

async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[server] Received ${signal}. Initiating graceful shutdown...`);

  // Force exit safety timeout (5 seconds)
  const forceExitTimeout = setTimeout(() => {
    console.error('[server] Graceful shutdown timed out (5s). Forcing process exit.');
    process.exit(1);
  }, 5000);
  forceExitTimeout.unref();

  try {
    if (server && server.listening) {
      // Close idle keep-alive connections so server.close does not hang on active sockets
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }

      await new Promise((resolve) => {
        server.close((err) => {
          if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
            console.error('[server] Error closing HTTP server:', err.message);
          } else {
            console.log('[server] HTTP server closed.');
          }
          resolve();
        });
      });
    }

    await cleanupResources();
  } catch (err) {
    console.error('[server] Error during graceful shutdown:', err.message);
  } finally {
    clearTimeout(forceExitTimeout);
    // On Windows, process.kill with SIGUSR2 throws Unknown signal: SIGUSR2.
    // Exit cleanly with code 0 so nodemon can restart without hanging or crashing.
    if (signal === 'SIGUSR2' && process.platform !== 'win32') {
      process.kill(process.pid, 'SIGUSR2');
    } else {
      process.exit(0);
    }
  }
}

process.once('SIGUSR2', () => handleShutdown('SIGUSR2'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

start();
