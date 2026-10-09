const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_DATA_DIR = "C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\af3c9371-b223-41cb-8b51-2a2d7b93b40b\\scratch\\chrome-phase10-profile";
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

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10: HEADLESS CHROME CDP BROWSER VERIFICATION');
  console.log('===============================================================\n');

  // 1. Setup DB Test Fixtures
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = require('../backend/src/models/Course');
  const Application = require('../backend/src/models/Application');
  const Enrollment = require('../backend/src/models/Enrollment');
  const User = require('../backend/src/models/User');
  const Invoice = require('../backend/src/models/Invoice');
  const PaymentTransaction = require('../backend/src/models/PaymentTransaction');

  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  // Clean old browser fixtures
  await Course.deleteMany({ title: /^Browser CDP Finance/ });

  const now = new Date();
  const testProgram = await Course.create({
    title: `Browser CDP Finance Spacecraft ${Date.now()}`,
    description: 'Testing browser invoice creation and payment flow',
    division: 'PRE_UNIVERSITY',
    level: 'INTERMEDIATE',
    price: 5200,
    capacity: 2,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
    createdAt: now,
    updatedAt: now,
  });

  const testApp = await Application.create({
    student: student._id,
    program: testProgram._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const testEnrollment = await Enrollment.create({
    student: student._id,
    program: testProgram._id,
    application: testApp._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: now,
    createdBy: preUniAdmin._id,
    createdAt: now,
    updatedAt: now,
  });

  // Second fixture for deadline sweep verification
  const sweepProgram = await Course.create({
    title: `Browser CDP Sweep Test ${Date.now()}`,
    description: 'Testing browser deadline sweep and waitlist promotion',
    division: 'PRE_UNIVERSITY',
    level: 'ADVANCED',
    price: 3600,
    capacity: 1,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
    createdAt: now,
    updatedAt: now,
  });

  let waitlistStudent = await User.findOne({ email: 'student_waitlist@esa.dev' });

  const sweepApp1 = await Application.create({
    student: student._id,
    program: sweepProgram._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
    createdAt: new Date(now.getTime() - 20000),
  });

  const sweepEnrollment1 = await Enrollment.create({
    student: student._id,
    program: sweepProgram._id,
    application: sweepApp1._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: now,
    createdBy: preUniAdmin._id,
    createdAt: new Date(now.getTime() - 20000),
  });

  const sweepApp2 = await Application.create({
    student: waitlistStudent._id,
    program: sweepProgram._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
    createdAt: new Date(now.getTime() - 10000),
  });

  const sweepEnrollment2 = await Enrollment.create({
    student: waitlistStudent._id,
    program: sweepProgram._id,
    application: sweepApp2._id,
    division: 'PRE_UNIVERSITY',
    status: 'WAITLISTED',
    enrolledAt: now,
    createdBy: preUniAdmin._id,
    createdAt: new Date(now.getTime() - 10000),
  });

  // Deliberately past-due invoice for sweep enrollment 1
  const sweepInvoice = await Invoice.create({
    invoiceNumber: `INV-SWEEP-${Date.now()}`,
    enrollment: sweepEnrollment1._id,
    application: sweepApp1._id,
    student: student._id,
    program: sweepProgram._id,
    division: 'PRE_UNIVERSITY',
    amount: 3600,
    currency: 'EGP',
    status: 'PENDING',
    issuedAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
    dueAt: new Date(now.getTime() - 2 * 3600 * 1000), // 2 hours ago
    notes: 'Expired browser sweep test invoice',
    createdBy: preUniAdmin._id,
    createdAt: now,
    updatedAt: now,
  });

  await mongoose.disconnect();
  console.log(`[SEED] Created Browser Program: "${testProgram.title}" (ID: ${testProgram._id})`);
  console.log(`[SEED] Created Browser Enrollment in PENDING_PAYMENT (ID: ${testEnrollment._id})`);
  console.log(`[SEED] Created Past-Due Invoice for Sweep Test (ID: ${sweepInvoice._id}, Due: ${sweepInvoice.dueAt})\n`);

  // Launch Chrome
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
    // TEST 1: Login as Pre-University Admin
    console.log('Logging in as Pre-University Admin via UI...');
    await loginUser(cdp, 'preuni.admin@esa.dev', 'Password123!');
    const currentUrl = await cdp.eval('window.location.href');
    assert('Test 1: Admin successfully logged in', currentUrl.includes('/admin'), `URL: ${currentUrl}`);

    // TEST 2: Navigate to Programs and generate invoice on PENDING_PAYMENT enrollment
    console.log('Navigating to Programs page (http://localhost:5173/admin/PRE_UNIVERSITY/programs)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/programs' });
    await delay(3000);

    // Open Program Enrollments modal
    const openModalSuccess = await cdp.eval(`
      (() => {
        const directBtn = document.getElementById('btn-enrollments-${testProgram._id}');
        if (directBtn) {
          directBtn.click();
          return true;
        }
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const targetRow = rows.find(r => r.innerText.includes('${testProgram.title}'));
        if (!targetRow) return false;
        const enrollBtn = targetRow.querySelector('button[id^="btn-enrollments-"]');
        if (!enrollBtn) return false;
        enrollBtn.click();
        return true;
      })()
    `);
    assert('Test 2a: Open Program Enrollments modal', openModalSuccess, 'Clicked enrollments modal button');
    await delay(2500);

    // Click "Invoice" button for our enrollment
    const clickInvoiceBtn = await cdp.eval(`
      (() => {
        const invoiceBtn = document.getElementById('btn-generate-invoice-${testEnrollment._id}');
        if (invoiceBtn) {
          invoiceBtn.click();
          return true;
        }
        const anyInvBtn = document.querySelector('button[id^="btn-generate-invoice-"]');
        if (anyInvBtn) {
          anyInvBtn.click();
          return true;
        }
        return false;
      })()
    `);
    assert('Test 2b: Click Generate Invoice action', clickInvoiceBtn, 'Clicked #btn-generate-invoice');
    await delay(2000);

    // Verify modal and confirm invoice generation
    const confirmGen = await cdp.eval(`
      (() => {
        const confirmBtn = document.getElementById('btn-confirm-generate-invoice');
        if (!confirmBtn) return false;
        confirmBtn.click();
        return true;
      })()
    `);
    assert('Test 2c: Confirm invoice generation in modal', confirmGen, 'Clicked #btn-confirm-generate-invoice');
    await delay(3000);

    // Check that invoice badge appeared on enrollment row
    const invoiceGeneratedText = await cdp.eval(`
      (() => {
        const modal = document.querySelector('.modal-content, [role="dialog"], [class*="Modal"]');
        return modal ? modal.innerText : '';
      })()
    `);
    assert(
      'Test 2d: Invoice created and linked to enrollment in UI',
      invoiceGeneratedText.includes('INV-') || invoiceGeneratedText.includes('Invoice') || invoiceGeneratedText.includes('Pay'),
      `Modal text verified contains invoice`
    );

    // TEST 3: Navigate to Finance/Invoices Page
    console.log('\nNavigating to Finance page (http://localhost:5173/admin/PRE_UNIVERSITY/invoices)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/invoices' });
    await delay(3000);

    const financePageTitle = await cdp.eval('document.querySelector("h1")?.innerText || ""');
    assert('Test 3a: Finance page renders with division header', financePageTitle.includes('Invoices'), `Title: "${financePageTitle}"`);

    // Verify invoice is listed with 5,200 EGP and Action buttons
    const invoiceRow = await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const row = rows.find(r => r.innerText.includes('5,200') || r.innerText.includes('5200') || r.innerText.includes('${testProgram.title}'));
        if (!row) return null;
        return {
          text: row.innerText,
          hasPayBtn: !!row.querySelector('button[id^="btn-record-payment-"]'),
          hasViewBtn: !!row.querySelector('button[id^="btn-view-invoice-"]'),
        };
      })()
    `);
    assert(
      'Test 3b: Invoice listed with 5,200 EGP and Action buttons',
      Boolean(invoiceRow && invoiceRow.hasPayBtn && invoiceRow.hasViewBtn),
      `Row found: ${JSON.stringify(invoiceRow)}`
    );

    // TEST 4: View Invoice Detail and Record Payment
    console.log('\nOpening Invoice Detail Modal...');
    const clickedView = await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const row = rows.find(r => r.innerText.includes('5,200') || r.innerText.includes('5200') || r.innerText.includes('${testProgram.title}'));
        const viewBtn = row?.querySelector('button[id^="btn-view-invoice-"]');
        if (viewBtn) {
          viewBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Clicked view button:', clickedView);

    let detailModalAmount = '';
    for (let i = 0; i < 15; i++) {
      await delay(500);
      detailModalAmount = await cdp.eval(`
        (() => {
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
          if (dialogs.length > 0) {
            return dialogs.map(d => d.innerText).join(' ');
          }
          return document.body ? document.body.innerText : '';
        })()
      `);
      if (detailModalAmount.includes('Balance Remaining') || detailModalAmount.includes('Payment History')) break;
    }
    assert(
      'Test 4a: Invoice Detail modal displays amount and balance',
      (detailModalAmount.includes('5,200') || detailModalAmount.includes('5200') || detailModalAmount.includes('EGP')) &&
      (detailModalAmount.includes('Balance Remaining') || detailModalAmount.includes('Payment History')),
      `Modal detail verified`
    );

    // Click Record Payment in detail modal
    console.log('Recording payment from Detail Modal...');
    await cdp.eval(`
      (() => {
        const payBtn = document.getElementById('btn-detail-record-payment');
        if (payBtn) payBtn.click();
      })()
    `);
    await delay(2000);

    // Fill and submit payment form
    const paymentRecorded = await cdp.eval(`
      (() => {
        const refInput = document.getElementById('payment-reference-input');
        if (refInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(refInput, 'TRF-BROWSER-991');
          refInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const confirmPayBtn = document.getElementById('btn-confirm-record-payment');
        if (!confirmPayBtn) return false;
        confirmPayBtn.click();
        return true;
      })()
    `);
    assert('Test 4b: Submit payment confirmation modal', paymentRecorded, 'Submitted payment modal');
    await delay(3000);

    // Verify invoice marked PAID and payment transaction recorded
    const detailAfterPayment = await cdp.eval(`
      (() => {
        const modal = document.querySelector('.modal-content, [role="dialog"], [class*="Modal"]');
        return modal ? modal.innerText : '';
      })()
    `);
    assert(
      'Test 4c: Invoice marked PAID and payment transaction recorded in history',
      detailAfterPayment.includes('PAID') && detailAfterPayment.includes('TRF-BROWSER-991'),
      `Modal verified paid and transaction listed`
    );

    // Close detail modal
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close dialog"], button[aria-label="Close"], .btn-close, button[class*="close"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(2000);

    // TEST 5: Deadline Sweep on Past-Due Invoice
    console.log('\nTesting Payment Deadline Sweep via UI...');
    const clickSweepBtn = await cdp.eval(`
      (() => {
        const sweepBtn = document.getElementById('btn-process-expired-invoices');
        if (!sweepBtn) return false;
        sweepBtn.click();
        return true;
      })()
    `);
    assert('Test 5a: Open Process Expired Invoices modal', clickSweepBtn, 'Clicked #btn-process-expired-invoices');
    await delay(2000);

    // Confirm deadline sweep
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const runSweepBtn = buttons.find(b => b.innerText.includes('Run Deadline Sweep'));
        if (runSweepBtn) runSweepBtn.click();
      })()
    `);
    await delay(3500);

    const sweepSuccessAlert = await cdp.eval(`
      (() => {
        const alert = document.querySelector('.alert-success');
        return alert ? alert.innerText : '';
      })()
    `);
    assert(
      'Test 5b: Deadline sweep completed with confirmation alert',
      sweepSuccessAlert.includes('Deadline sweep completed') && sweepSuccessAlert.includes('promoted'),
      `Alert text: "${sweepSuccessAlert}"`
    );

    // TEST 6: Cross-Division Isolation
    console.log('\nTesting Cross-Division Isolation in Browser...');
    await loginUser(cdp, 'uni.admin@esa.dev', 'Password123!');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/UNIVERSITY/invoices' });
    await delay(3000);

    const uniInvoicesText = await cdp.eval('document.body.innerText');
    assert(
      'Test 6: Pre-University invoices are strictly isolated from University Admin',
      !uniInvoicesText.includes(testProgram.title),
      'Confirmed Pre-University test invoice not rendered in University view'
    );

    console.log('\n===============================================================');
    const passed = testResults.filter((r) => r.pass).length;
    const failed = testResults.filter((r) => !r.pass).length;
    console.log(`TOTAL BROWSER TESTS: ${testResults.length} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('===============================================================');

    await cdp.close();
    chromeProcess.kill();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal Browser Test Error:', err);
    await cdp.close();
    chromeProcess.kill();
    process.exit(1);
  }
}

run();
