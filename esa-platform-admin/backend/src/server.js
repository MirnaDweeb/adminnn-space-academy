require('dotenv').config();
const createApp = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

let server;

async function start() {
  try {
    await connectDB();
    const app = createApp();

    server = app.listen(PORT, () => {
      console.log(`[server] Egyptian Space Agency Academy API running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[server] Error: Port ${PORT} is already in use.`);
      } else {
        console.error('[server] Server error:', err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

function handleShutdown(signal) {
  if (server) {
    server.close(() => {
      if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2');
      } else {
        process.exit(0);
      }
    });
  } else if (signal === 'SIGUSR2') {
    process.kill(process.pid, 'SIGUSR2');
  } else {
    process.exit(0);
  }
}

process.once('SIGUSR2', () => handleShutdown('SIGUSR2'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

start();
