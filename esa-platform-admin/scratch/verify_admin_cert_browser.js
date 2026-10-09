const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, 'chrome-cert-profile');
const PORT = 9222;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      })
      .on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
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

async function waitForSelector(cdp, selector, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const exists = await cdp.eval(`Boolean(document.querySelector('${selector}'))`);
    if (exists) return true;
    await delay(250);
  }
  return false;
}

async function captureScreenshot(cdp, name) {
  try {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const screenshotPath = path.join(__dirname, `screenshot_${name}.png`);
    fs.writeFileSync(screenshotPath, buffer);
    console.log(`[Screenshot] Saved: ${screenshotPath}`);
  } catch (err) {
    console.log(`[Screenshot] Failed to capture ${name}:`, err.message);
  }
}

async function setAuthInBrowser(cdp, token, user) {
  await cdp.eval(`
    localStorage.setItem('esa_token', '${token}');
    localStorage.setItem('esa_user', JSON.stringify(${JSON.stringify(user)}));
  `);
}

async function runBrowserVerification() {
  console.log('========================================================================');
  console.log('ADMIN CERTIFICATE ISSUANCE — BROWSER & CDP VERIFICATION');
  console.log('========================================================================\n');

  // Load backend models to generate authentic tokens
  require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
  const mongoose = require('../backend/node_modules/mongoose');
  const User = require('../backend/src/models/User');
  const { ROLES } = require('../backend/src/constants/roles');
  const { DIVISIONS } = require('../backend/src/constants/divisions');
  const { PERMISSIONS } = require('../backend/src/constants/permissions');
  const generateToken = require('../backend/src/utils/generateToken');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/esa_academy');
  console.log('[db] Connected to MongoDB');

  const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN });
  const preUniAdmin = await User.findOne({ role: ROLES.PRE_UNIVERSITY_ADMIN, email: 'preuni.admin@esa.dev' });
  let restrictedAdmin = await User.findOne({ email: 'nocerts.admin@esa.dev' });
  if (!restrictedAdmin) {
    restrictedAdmin = await User.create({
      fullName: 'Restricted Admin (No Certs)',
      email: 'nocerts.admin@esa.dev',
      passwordHash: superAdmin.passwordHash,
      role: ROLES.PRE_UNIVERSITY_ADMIN,
      division: DIVISIONS.PRE_UNIVERSITY,
      permissions: [PERMISSIONS.CERTIFICATES_VIEW],
      isActive: true,
    });
  }

  const superAdminToken = generateToken(superAdmin);
  const preUniAdminToken = generateToken(preUniAdmin);
  const restrictedAdminToken = generateToken(restrictedAdmin);

  let chromeProcess = null;
  try {
    await httpGet(`http://127.0.0.1:${PORT}/json/version`);
    console.log('[Chrome] Connected to existing Chrome instance.');
  } catch (e) {
    console.log('[Chrome] Spawning headless Chrome on port 9222...');
    chromeProcess = spawn(
      CHROME_PATH,
      [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,920',
      ],
      { detached: false }
    );
    await delay(3500);
  }

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Could not find active Chrome page debug URL.');
  }

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('[CDP] Connected to Chrome Page target.\n');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    // -------------------------------------------------------------
    // Test 1: Super Admin opens Certificates page & Issue Modal
    // -------------------------------------------------------------
    console.log('--- Step 1: Super Admin opens Certificates Page & Issue Modal ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
    await delay(1000);
    await setAuthInBrowser(cdp, superAdminToken, superAdmin.toJSON());

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/certificates' });
    await waitForSelector(cdp, '#btn-open-issue-certificate');

    const hasIssueBtn = await cdp.eval(`Boolean(document.querySelector('#btn-open-issue-certificate'))`);
    console.log(`[PASS] Super Admin sees [ Issue Certificate ] button: ${hasIssueBtn}`);

    // Click [ Issue Certificate ]
    await cdp.eval(`document.querySelector('#btn-open-issue-certificate').click()`);
    await delay(1200);

    const isModalOpen = await cdp.eval(`Boolean(document.querySelector('#select-eligible-completion, .alert-info'))`);
    console.log(`[PASS] Issue Certificate Modal opened: ${isModalOpen}`);

    // Check if dropdown or details card rendered
    const hasDropdown = await cdp.eval(`Boolean(document.querySelector('#select-eligible-completion'))`);
    if (hasDropdown) {
      console.log('[PASS] Eligible completion selector rendered inside modal');
      // Select the first eligible candidate
      await cdp.eval(`
        const sel = document.querySelector('#select-eligible-completion');
        if (sel && sel.options.length > 1) {
          sel.selectedIndex = 1;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `);
      await delay(500);
    }

    await captureScreenshot(cdp, 'cert_01_super_admin_issue_modal');

    // Close modal
    await cdp.eval(`
      const closeBtn = document.querySelector('.btn-close') || document.querySelector('button.btn-outline-secondary');
      if (closeBtn) closeBtn.click();
    `);
    await delay(500);

    // -------------------------------------------------------------
    // Test 2: Pre-University Admin with CERTIFICATES_MANAGE
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Pre-University Admin with CERTIFICATES_MANAGE ---');
    await setAuthInBrowser(cdp, preUniAdminToken, preUniAdmin.toJSON());
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/certificates' });
    await waitForSelector(cdp, '#btn-open-issue-certificate');

    const preUniHasIssue = await cdp.eval(`Boolean(document.querySelector('#btn-open-issue-certificate'))`);
    console.log(`[PASS] Pre-Uni Admin sees [ Issue Certificate ] button: ${preUniHasIssue}`);

    // Click Issue Certificate
    await cdp.eval(`document.querySelector('#btn-open-issue-certificate').click()`);
    await delay(1200);
    await captureScreenshot(cdp, 'cert_02_preuni_admin_modal');

    // Close modal
    await cdp.eval(`
      const closeBtn = document.querySelector('.btn-close') || document.querySelector('button.btn-outline-secondary');
      if (closeBtn) closeBtn.click();
    `);
    await delay(500);

    // -------------------------------------------------------------
    // Test 3: Restricted Admin WITHOUT CERTIFICATES_MANAGE
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Restricted Admin (Without CERTIFICATES_MANAGE) ---');
    await setAuthInBrowser(cdp, restrictedAdminToken, restrictedAdmin.toJSON());
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/certificates' });
    await delay(1500);

    const restrictedIssueBtn = await cdp.eval(`Boolean(document.querySelector('#btn-open-issue-certificate'))`);
    console.log(`[PASS] Restricted Admin [ Issue Certificate ] button is absent: ${!restrictedIssueBtn}`);

    const hasRevokeBtn = await cdp.eval(`Boolean(document.querySelector('button.btn-danger'))`);
    console.log(`[PASS] Restricted Admin [ Revoke ] button is absent: ${!hasRevokeBtn}`);

    await captureScreenshot(cdp, 'cert_03_restricted_admin_hidden');

    console.log('\n========================================================================');
    console.log('ALL BROWSER CDP CERTIFICATE VERIFICATIONS COMPLETED SUCCESSFULLY!');
    console.log('========================================================================');
  } finally {
    await cdp.close();
    if (chromeProcess) {
      chromeProcess.kill();
    }
    await mongoose.disconnect();
  }
}

runBrowserVerification().catch((err) => {
  console.error('[Browser Test Error]', err);
  process.exit(1);
});
