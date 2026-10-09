const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA_DIR = "C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\2813b07c-c0f6-49b3-ad62-8dca3048b4e0\\scratch\\chrome-diag-profile";
const PORT = 9333;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (msg) => {
        const payload = JSON.parse(msg.data);
        if (payload.id && this.callbacks.has(payload.id)) {
          const cb = this.callbacks.get(payload.id);
          this.callbacks.delete(payload.id);
          if (payload.error) cb.reject(payload.error);
          else cb.resolve(payload.result);
        } else if (payload.method) {
          this.events.push(payload);
          if (payload.method === 'Runtime.consoleAPICalled') {
            console.log(`[Browser Console ${payload.params.type}]`, payload.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' '));
          } else if (payload.method === 'Log.entryAdded') {
            console.log(`[Browser Log]`, payload.params.entry.text);
          } else if (payload.method === 'Network.requestWillBeSent') {
            console.log(`[Browser Network Request] ${payload.params.request.method} ${payload.params.request.url}`);
          } else if (payload.method === 'Network.responseReceived') {
            console.log(`[Browser Network Response] ${payload.params.response.status} ${payload.params.response.url}`);
          } else if (payload.method === 'Network.loadingFailed') {
            console.log(`[Browser Network Failed] ${payload.params.errorText} for ${payload.params.requestId}`);
          }
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function testUrl(targetUrl, email, password) {
  console.log(`\n==================================================`);
  console.log(`TESTING: ${targetUrl}`);
  console.log(`==================================================`);

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA_DIR}_${Date.now()}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let connected = false;
  for (let i = 0; i < 20; i++) {
    await delay(500);
    try {
      await httpGet(`http://127.0.0.1:${PORT}/json/version`);
      connected = true;
      break;
    } catch (e) {}
  }
  if (!connected) {
    chromeProcess.kill();
    throw new Error('Could not connect to Chrome debugging port');
  }

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page');
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  await cdp.send('Page.navigate', { url: targetUrl });
  
  // Wait for email input to be present in DOM
  let inputsFound = false;
  for (let i = 0; i < 30; i++) {
    await delay(500);
    const hasInput = await cdp.eval('!!document.querySelector("input[type=\\"email\\"]")');
    if (hasInput) {
      inputsFound = true;
      break;
    }
  }

  const title = await cdp.eval('document.title');
  const html = await cdp.eval('document.body.innerText');
  console.log('Page Title:', title);
  console.log('Page Text Preview:\n', html);

  if (!inputsFound) {
    console.error('TIMED OUT waiting for email input!');
    await cdp.close();
    chromeProcess.kill();
    return;
  }

  // Perform login
  console.log(`Attempting login with ${email} ...`);
  const filled = await cdp.eval(`
    (() => {
      localStorage.clear();
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      if (!emailInput || !passInput) return 'Inputs not found';
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(emailInput, '${email}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(passInput, '${password}');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      const submitBtn = document.querySelector('button[type="submit"]');
      if (!submitBtn) return 'Submit button not found';
      submitBtn.click();
      return 'Clicked submit';
    })()
  `);
  console.log('Form submission result:', filled);

  await delay(4000);

  const errorAlert = await cdp.eval(`
    (() => {
      const alert = document.querySelector('.alert');
      return alert ? alert.innerText : 'NO_ALERT';
    })()
  `);
  const currentPath = await cdp.eval('window.location.pathname');
  const token = await cdp.eval('localStorage.getItem("esa_token")');

  console.log('Current URL Path:', currentPath);
  console.log('Alert text on page:', errorAlert);
  console.log('localStorage esa_token:', token ? `${token.substring(0, 20)}...` : 'null');

  await cdp.close();
  chromeProcess.kill();
}

async function main() {
  try {
    await testUrl('http://localhost:5173/login', 'superadmin@esa.dev', 'Password123!');
  } catch (err) {
    console.error('Test error:', err);
  }
}

main();
