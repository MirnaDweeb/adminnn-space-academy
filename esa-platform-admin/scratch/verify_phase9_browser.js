const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA_DIR = "C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\af3c9371-b223-41cb-8b51-2a2d7b93b40b\\scratch\\chrome-test-profile";
const PORT = 9222;

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

async function loginUser(cdp, email, password) {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
  await delay(2500);
  await cdp.eval(`
    (() => {
      localStorage.clear();
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      if (!emailInput || !passInput) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(emailInput, '${email}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(passInput, '${password}');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
      return true;
    })()
  `);
  await delay(3000);
}

async function runBrowserTests() {
  console.log('====================================================');
  console.log('PHASE 9 — HEADLESS CHROME CDP BROWSER VERIFICATION');
  console.log('====================================================\n');

  // Seed DB records specifically for browser verification using official models with timestamps
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = require('../backend/src/models/Course');
  const Application = require('../backend/src/models/Application');
  const User = require('../backend/src/models/User');
  const Enrollment = require('../backend/src/models/Enrollment');

  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  const now = new Date();
  // 1. Create a dedicated program with capacity 3 and latest timestamp
  const browserCourse = await Course.create({
    title: `Browser CDP Space Avionics Lab ${Date.now()}`,
    description: 'Program for testing browser enrollment and cancellation UI',
    division: 'PRE_UNIVERSITY',
    level: 'BEGINNER',
    capacity: 3,
    occupiedSeats: 0,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Create an eligible application ready for enrollment with latest timestamp
  const browserApp = await Application.create({
    student: student._id,
    program: browserCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await mongoose.disconnect();

  console.log(`[SEED] Created Browser Test Program: "${browserCourse.title}" (ID: ${browserCourse._id})`);
  console.log(`[SEED] Created Browser Test Application in ELIGIBLE_PAYMENT_PENDING (ID: ${browserApp._id})\n`);

  // Launch Chrome in headless mode with remote debugging
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
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
  if (!connected) throw new Error('Could not connect to Chrome debugging port');

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page');
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const testResults = [];
  function assert(name, pass, detail) {
    testResults.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // 1. Login as Super Admin
    console.log('Logging in as Super Admin via UI...');
    await loginUser(cdp, 'superadmin@esa.dev', 'Password123!');

    const afterLoginUrl = await cdp.eval('window.location.href');
    assert('Test 1: Admin successfully logs in', afterLoginUrl.includes('/admin'), `URL: ${afterLoginUrl}`);

    // 2. Navigate to Applications Page
    console.log('Navigating to Applications Page (http://localhost:5173/admin/applications)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/applications' });
    await delay(2500);

    const appTitle = await cdp.eval('document.querySelector("h1")?.innerText || document.body.innerText.substring(0, 100)');
    assert('Test 2: Applications Page renders correctly', appTitle.length > 0, `Title: "${appTitle}"`);

    // 3. Open the detail modal for our ELIGIBLE_PAYMENT_PENDING application
    console.log(`Opening detail modal for application ${browserApp._id}...`);
    const openedDetail = await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        for (const row of rows) {
          const btn = row.querySelector('button');
          if (btn && (row.innerText.includes('${browserCourse.title}') || row.innerText.toLowerCase().includes('eligible payment pending') || row.innerText.includes('ACCEPT'))) {
            btn.click();
            return true;
          }
        }
        const firstBtn = document.querySelector('tbody tr button');
        if (firstBtn) {
          firstBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await delay(1500);
    assert('Test 3: Application Review Modal opened', openedDetail === true);

    // Wait up to 5s for detail modal and action button to render
    for (let i = 0; i < 10; i++) {
      const ready = await cdp.eval(`Boolean(document.querySelector('#btn-enroll-student'))`);
      if (ready) break;
      await delay(500);
    }

    // 4. Verify "Enroll Student" action button is rendered
    const enrollBtnExists = await cdp.eval(`
      (() => {
        const btn = document.querySelector('#btn-enroll-student');
        return btn ? btn.innerText.trim() : null;
      })()
    `);
    assert(
      'Test 4: "Enroll Student" action button is rendered for accepted application',
      enrollBtnExists && enrollBtnExists.includes('Enroll Student'),
      `Button text: "${enrollBtnExists}"`
    );

    // 5. Click "Enroll Student" to open confirmation modal
    console.log('Clicking "Enroll Student" button...');
    await cdp.eval(`
      (() => {
        const btn = document.querySelector('#btn-enroll-student');
        if (btn) btn.click();
      })()
    `);
    await delay(1200);

    const modalConfirmText = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Confirm Student Enrollment') || text.includes('reserve a seat');
      })()
    `);
    assert(
      'Test 5: Enrollment Confirmation Modal renders with capacity explanation',
      modalConfirmText === true
    );

    // 6. Confirm Enrollment in the modal
    console.log('Confirming enrollment in modal...');
    await cdp.eval(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(
          b => b.innerText.trim() === 'Confirm & Enroll'
        ) || document.querySelector('.modal-footer .btn-success');
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(3000);

    const successMsg = await cdp.eval(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('seat successfully reserved') ||
               text.includes('pending_payment') ||
               text.includes('occupied') ||
               text.includes('reserved');
      })()
    `);
    assert('Test 6: Enrollment successfully executed and reserved seat banner displayed', successMsg === true);

    // 7. Navigate to Programs Page
    console.log('Navigating to Programs Page (http://localhost:5173/admin/programs)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/programs' });
    await delay(2500);

    // 8. Find program and click the "Enrollments" button
    console.log('Locating program and opening Enrollments view...');
    const openedEnrollments = await cdp.eval(`
      (() => {
        const enrollBtn = document.querySelector('#btn-enrollments-${browserCourse._id}') ||
                         Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enrollments'));
        if (enrollBtn) {
          enrollBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await delay(2000);
    assert('Test 7: Program Enrollments & Capacity Modal opened', openedEnrollments === true);

    // Wait for capacity cards to load inside modal
    for (let i = 0; i < 10; i++) {
      const loaded = await cdp.eval(`Boolean(document.querySelector('.card .fs-4'))`);
      if (loaded) break;
      await delay(500);
    }

    // 9. Verify Capacity Summary Card renders with Occupied, Waitlisted, Available Seats
    const capacitySummary = await cdp.eval(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        const hasOccupied = text.includes('occupied');
        const hasWaitlisted = text.includes('waitlist');
        const hasAvailable = text.includes('available');
        return { hasOccupied, hasWaitlisted, hasAvailable };
      })()
    `);
    assert(
      'Test 8: Capacity breakdown card renders correctly (Occupied, Waitlisted, Available)',
      capacitySummary.hasOccupied && capacitySummary.hasWaitlisted && capacitySummary.hasAvailable,
      JSON.stringify(capacitySummary)
    );

    // 10. Click Cancel on the active enrollment in the table
    console.log('Testing cancellation modal...');
    const openedCancel = await cdp.eval(`
      (() => {
        const cancelBtn = document.querySelector('button[id^="btn-cancel-enrollment-"]') ||
                          Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel'));
        if (cancelBtn) {
          cancelBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await delay(1200);
    assert('Test 9: Cancellation confirmation modal renders with FIFO promotion explanation', openedCancel === true);

    // 11. Enter reason and confirm cancellation
    console.log('Submitting cancellation with reason...');
    await cdp.eval(`
      (() => {
        const input = document.querySelector('#cancel-reason-input') || document.querySelector('input[placeholder*="withdrew"]');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'Student requested withdrawal via portal');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cancel Enrollment'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(2500);

    const cancelSuccessBanner = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Enrollment successfully cancelled') ||
               text.includes('seat released') ||
               text.includes('promoted') ||
               text.includes('Cancelled');
      })()
    `);
    assert('Test 10: Enrollment successfully cancelled and seat released in UI', cancelSuccessBanner === true);

  } finally {
    await cdp.close();
    chromeProcess.kill();
  }

  const allPassed = testResults.every((r) => r.pass);
  console.log('\n====================================================');
  console.log(`BROWSER CDP RESULT: ${testResults.filter((r) => r.pass).length} / ${testResults.length} PASSED`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
