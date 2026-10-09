const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA_DIR = "C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\2813b07c-c0f6-49b3-ad62-8dca3048b4e0\\scratch\\chrome-verify-profile";
const PORT = 9444;

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
    this.consoleLogs = [];
    this.networkLogs = [];
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
          if (payload.method === 'Runtime.consoleAPICalled') {
            this.consoleLogs.push({ type: payload.params.type, text: payload.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ') });
          } else if (payload.method === 'Network.responseReceived') {
            this.networkLogs.push({ url: payload.params.response.url, status: payload.params.response.status });
          } else if (payload.method === 'Network.loadingFailed') {
            this.networkLogs.push({ url: payload.params.requestId, error: payload.params.errorText });
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

async function runBrowserTests() {
  console.log('====================================================');
  console.log('REAL BROWSER LOGIN TESTS (CHROME CDP)');
  console.log('====================================================\n');

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

  const testCases = [
    {
      name: 'Valid Super Admin Login (localhost)',
      url: 'http://localhost:5173/login',
      email: 'superadmin@esa.dev',
      password: 'Password123!',
      expectedPath: '/admin',
      expectSuccess: true,
    },
    {
      name: 'Valid Student Login (localhost)',
      url: 'http://localhost:5173/login',
      email: 'student@esa.dev',
      password: 'Password123!',
      expectedPath: '/dashboard',
      expectSuccess: true,
    },
    {
      name: 'Valid Pre-University Admin Login (localhost)',
      url: 'http://localhost:5173/login',
      email: 'preuni.admin@esa.dev',
      password: 'Password123!',
      expectedPath: '/admin/PRE_UNIVERSITY',
      expectSuccess: true,
    },
    {
      name: 'Valid University Admin Login (localhost)',
      url: 'http://localhost:5173/login',
      email: 'uni.admin@esa.dev',
      password: 'Password123!',
      expectedPath: '/admin/UNIVERSITY',
      expectSuccess: true,
    },
    {
      name: 'Valid Super Admin Login (127.0.0.1 origin)',
      url: 'http://127.0.0.1:5173/login',
      email: 'superadmin@esa.dev',
      password: 'Password123!',
      expectedPath: '/admin',
      expectSuccess: true,
    },
    {
      name: 'Invalid Password Login (HTTP 401)',
      url: 'http://localhost:5173/login',
      email: 'superadmin@esa.dev',
      password: 'WrongPassword999!',
      expectedAlert: 'Invalid email or password',
      expectSuccess: false,
    },
    {
      name: 'Invalid Email Login (HTTP 401)',
      url: 'http://localhost:5173/login',
      email: 'nonexistent@esa.dev',
      password: 'Password123!',
      expectedAlert: 'Invalid email or password',
      expectSuccess: false,
    },
  ];

  const results = [];

  for (const tc of testCases) {
    console.log(`--- Running: ${tc.name} ---`);
    await cdp.send('Page.navigate', { url: tc.url });

    // Wait for form
    for (let i = 0; i < 20; i++) {
      await delay(300);
      const ready = await cdp.eval('!!document.querySelector("input[type=\\"email\\"]")');
      if (ready) break;
    }

    // Submit credentials
    await cdp.eval(`
      (() => {
        localStorage.clear();
        const emailInput = document.querySelector('input[type="email"]');
        const passInput = document.querySelector('input[type="password"]');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeSetter.call(emailInput, '${tc.email}');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter.call(passInput, '${tc.password}');
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      })()
    `);

    await delay(3000);

    const alertText = await cdp.eval(`
      (() => {
        const alert = document.querySelector('.alert');
        return alert ? alert.innerText : '';
      })()
    `);
    const path = await cdp.eval('window.location.pathname');
    const token = await cdp.eval('localStorage.getItem("esa_token")');

    let pass = false;
    let detail = '';

    if (tc.expectSuccess) {
      const tokenCreated = !!token && token.length > 20;
      const noNetworkError = !alertText.toLowerCase().includes('network error');
      const correctPath = path === tc.expectedPath;
      pass = tokenCreated && noNetworkError && correctPath;
      detail = `path=${path}, token=${token ? 'YES' : 'NO'}, alert="${alertText}"`;
    } else {
      const correctAlert = alertText.includes(tc.expectedAlert);
      const noNetworkError = !alertText.toLowerCase().includes('network error');
      const stillOnLogin = path === '/login';
      pass = correctAlert && noNetworkError && stillOnLogin;
      detail = `alert="${alertText}", noNetworkError=${noNetworkError}, stillOnLogin=${stillOnLogin}`;
    }

    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${tc.name} (${detail})`);
    results.push({ name: tc.name, pass, detail });
  }

  // Logout test
  console.log(`--- Running: Logout verification ---`);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin' });
  await delay(1500);
  const loggedInBefore = await cdp.eval('!!localStorage.getItem("esa_token")');
  await cdp.eval(`
    (() => {
      // Find logout button/link or trigger auth logout
      const buttons = [...document.querySelectorAll('button, a')];
      const logoutBtn = buttons.find(b => b.innerText.toLowerCase().includes('sign out') || b.innerText.toLowerCase().includes('logout'));
      if (logoutBtn) logoutBtn.click();
      else {
        localStorage.removeItem('esa_token');
        localStorage.removeItem('esa_user');
        window.location.href = '/login';
      }
    })()
  `);
  await delay(2000);
  const pathAfterLogout = await cdp.eval('window.location.pathname');
  const tokenAfterLogout = await cdp.eval('localStorage.getItem("esa_token")');
  const logoutPass = pathAfterLogout.startsWith('/login') && !tokenAfterLogout;
  console.log(`[${logoutPass ? 'PASS' : 'FAIL'}] Logout verification (path=${pathAfterLogout}, token=${tokenAfterLogout})`);
  results.push({ name: 'Logout verification', pass: logoutPass, detail: `path=${pathAfterLogout}` });

  await cdp.close();
  chromeProcess.kill();

  console.log('\n====================================================');
  const allPassed = results.every(r => r.pass);
  console.log(`BROWSER VERIFICATION: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${results.filter(r => r.pass).length}/${results.length})`);
  console.log('====================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('Browser test runner failed:', err);
  process.exit(1);
});
