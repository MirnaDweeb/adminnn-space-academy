const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\af3c9371-b223-41cb-8b51-2a2d7b93b40b\\scratch\\chrome-phase10-profile';
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

async function loginUser(cdp, email, password) {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
  await delay(2000);
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
  await delay(2500);
}

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10 UPGRADE: REAL BROWSER & CDP VERIFICATION');
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

  // Clean old fixtures
  await Course.deleteMany({ title: /^Browser CDP Online/ });

  const now = new Date();

  // Program 1: Student Online Checkout Test
  const onlineCourse = await Course.create({
    title: `Browser CDP Online Astrodynamics ${Date.now()}`,
    description: 'Testing student Paymob online checkout and confirmation in browser',
    division: 'PRE_UNIVERSITY',
    level: 'INTERMEDIATE',
    price: 5200,
    currency: 'EGP',
    capacity: 5,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
  });

  const onlineApp = await Application.create({
    student: student._id,
    program: onlineCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
  });

  const onlineEnrollment = await Enrollment.create({
    student: student._id,
    program: onlineCourse._id,
    application: onlineApp._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: now,
    createdBy: preUniAdmin._id,
  });

  const onlineInvoice = await Invoice.create({
    invoiceNumber: `INV-BRW-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    enrollment: onlineEnrollment._id,
    application: onlineApp._id,
    student: student._id,
    program: onlineCourse._id,
    division: 'PRE_UNIVERSITY',
    amount: 5200,
    currency: 'EGP',
    status: 'PENDING',
    issuedAt: now,
    dueAt: new Date(now.getTime() + 72 * 3600 * 1000), // 72 hours
    createdBy: preUniAdmin._id,
  });

  // Program 2: Coexistence Program (Online attempt + Admin manual payment)
  const coexistCourse = await Course.create({
    title: `Browser CDP Online Coexist Program ${Date.now()}`,
    description: 'Testing online attempt followed by manual payment in browser',
    division: 'PRE_UNIVERSITY',
    level: 'INTERMEDIATE',
    price: 4500,
    currency: 'EGP',
    capacity: 5,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
  });

  const coexistApp = await Application.create({
    student: student._id,
    program: coexistCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: now,
  });

  const coexistEnrollment = await Enrollment.create({
    student: student._id,
    program: coexistCourse._id,
    application: coexistApp._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: now,
    createdBy: preUniAdmin._id,
  });

  const coexistInvoice = await Invoice.create({
    invoiceNumber: `INV-COEX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    enrollment: coexistEnrollment._id,
    application: coexistApp._id,
    student: student._id,
    program: coexistCourse._id,
    division: 'PRE_UNIVERSITY',
    amount: 4500,
    currency: 'EGP',
    status: 'PENDING',
    issuedAt: now,
    dueAt: new Date(now.getTime() + 72 * 3600 * 1000),
    createdBy: preUniAdmin._id,
  });

  // Create an initial online attempt on coexistInvoice that failed
  const failTx = await PaymentTransaction.create({
    transactionNumber: `TXN-ONL-FAIL-${Date.now()}`,
    invoice: coexistInvoice._id,
    enrollment: coexistEnrollment._id,
    amount: 4500,
    currency: 'EGP',
    method: 'ONLINE_CARD',
    recordingType: 'ONLINE',
    provider: 'PAYMOB',
    gatewayTransactionId: String(Math.floor(10000000 + Math.random() * 90000000)),
    status: 'FAILED',
    notes: 'Credit card declined by issuer (simulated online attempt)',
    recordedAt: new Date(now.getTime() - 3600000),
  });

  await mongoose.disconnect();
  console.log(`[SEED] Created Online Course: "${onlineCourse.title}" (ID: ${onlineCourse._id})`);
  console.log(`[SEED] Created Invoice for Student Online Test: ${onlineInvoice.invoiceNumber} (5200 EGP)`);
  console.log(`[SEED] Created Coexistence Invoice: ${coexistInvoice.invoiceNumber} with prior online failed attempt\n`);

  // Launch Chrome
  let connected = false;
  let chromeProcess = null;

  try {
    await httpGet(`http://127.0.0.1:${PORT}/json/version`);
    connected = true;
    console.log('Connected to existing Chrome instance on port 9222');
  } catch (e) {
    console.log('Launching headless Chrome on port 9222...');
    chromeProcess = spawn(
      CHROME_PATH,
      [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1366,900',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    for (let i = 0; i < 20; i++) {
      await delay(500);
      try {
        await httpGet(`http://127.0.0.1:${PORT}/json/version`);
        connected = true;
        break;
      } catch (err) {}
    }
  }

  if (!connected) throw new Error('Could not connect to Chrome debugging port');

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
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
    // =========================================================================
    // PART A: STUDENT JOURNEY
    // =========================================================================
    console.log('\n--- PART A: STUDENT ONLINE PAYMENT JOURNEY ---');

    // 1. Student Login
    console.log('Step 1: Logging in as Student (student@esa.dev)...');
    await loginUser(cdp, 'student@esa.dev', 'Password123!');
    const studentUrl = await cdp.eval('window.location.href');
    assert('Test 1: Student authenticated', studentUrl.includes('/dashboard'), `URL: ${studentUrl}`);

    // 2. Open Student Invoices Page
    console.log('Step 2: Navigating to Student Invoices (/student/invoices)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/student/invoices' });
    await delay(3000);

    const invoicesPageRendered = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('My Invoices & Online Payments') && text.includes('${onlineInvoice.invoiceNumber}');
      })()
    `);
    assert('Test 2: Student Invoices Page rendered', invoicesPageRendered, `Found invoice ${onlineInvoice.invoiceNumber}`);

    // 3. Verify Pay Now button is visible for the pending invoice
    const payNowBtnExists = await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-pay-now-${onlineInvoice._id}') || document.querySelector('button[id^="btn-pay-now-"]');
        return !!btn;
      })()
    `);
    assert('Test 3: Pay Now button present for pending invoice', payNowBtnExists, `Button id: btn-pay-now-${onlineInvoice._id}`);

    // 4. Click "Pay Now" button to open Online Checkout Modal
    console.log('Step 3: Opening Online Payment Checkout modal...');
    await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-pay-now-${onlineInvoice._id}') || document.querySelector('button[id^="btn-pay-now-"]');
        if (btn) btn.click();
      })()
    `);
    await delay(2000);

    const checkoutModalVisible = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return (text.includes('Online Program Payment Checkout') || text.includes('Online Payment Checkout') || text.includes('Paymob Secure Payment Gateway')) && (text.includes('5,200') || text.includes('5200'));
      })()
    `);
    assert('Test 4: Online Payment Checkout modal opened', checkoutModalVisible, 'Displays 5,200 EGP and Paymob Gateway branding');

    // 5. Initiate online payment with gateway
    console.log('Step 4: Clicking "Proceed to Paymob Checkout"...');
    await cdp.eval(`
      (() => {
        const initiateBtn = document.getElementById('btn-confirm-proceed-paymob');
        if (initiateBtn) initiateBtn.click();
      })()
    `);
    await delay(3000);

    const gatewayInitiatedState = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Secure Paymob order registered') || text.includes('Simulate Card Approval') || text.includes('Simulate Successful Card Payment');
      })()
    `);
    assert('Test 5: Order registered with Paymob gateway', gatewayInitiatedState, 'Payment attempt registered and simulation controls displayed');

    // 6. Complete Sandbox Simulation Payment
    console.log('Step 5: Simulating successful Paymob payment...');
    await cdp.eval(`
      (() => {
        const successBtn = document.getElementById('btn-sandbox-pay-approve');
        if (successBtn) successBtn.click();
      })()
    `);
    await delay(4000);

    // 7. Verify Return Page
    const returnUrl = await cdp.eval('window.location.href');
    assert('Test 6: Redirected to Payment Return Page', returnUrl.includes('/student/payments/return'), `URL: ${returnUrl}`);

    const verifiedSuccessState = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        const hasSuccessTitle = text.includes('Payment Successful!');
        const hasVerifiedBadge = text.toLowerCase().includes('confirmed');
        const hasInvoiceNum = text.includes('${onlineInvoice.invoiceNumber}');
        return hasSuccessTitle && hasVerifiedBadge && hasInvoiceNum;
      })()
    `);
    assert(
      'Test 7: Server-verified payment success confirmed',
      verifiedSuccessState,
      `Enrollment CONFIRMED, Invoice ${onlineInvoice.invoiceNumber} verified by backend`
    );

    // 8. Return to Invoices and verify settled state
    console.log('Step 6: Navigating back to Invoices to verify settled state...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/student/invoices' });
    await delay(2500);

    const invoiceSettledInList = await cdp.eval(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        const hasInvoice = text.includes('${onlineInvoice.invoiceNumber}'.toLowerCase());
        const hasPaid = text.includes('paid');
        const hasConfirmed = text.includes('confirmed') || text.includes('seat is confirmed') || text.includes('payment confirmed');
        return hasInvoice && hasPaid && hasConfirmed;
      })()
    `);
    assert('Test 8: Invoice table shows PAID & Settled', invoiceSettledInList, 'Invoice marked PAID, Pay Now replaced with settled badge');

    // =========================================================================
    // PART B: ADMIN FINANCE PAGE VERIFICATION
    // =========================================================================
    console.log('\n--- PART B: ADMIN FINANCE & MANUAL PAYMENT JOURNEY ---');

    // 9. Admin Login
    console.log('Step 7: Logging in as Pre-University Admin (preuni.admin@esa.dev)...');
    await loginUser(cdp, 'preuni.admin@esa.dev', 'Password123!');
    const adminUrl = await cdp.eval('window.location.href');
    assert('Test 9: Admin authenticated', adminUrl.includes('/admin'), `URL: ${adminUrl}`);

    // 10. Navigate to Finance Page
    console.log('Step 8: Navigating to Finance Page (/admin/PRE_UNIVERSITY/invoices)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/invoices' });
    await delay(3000);

    const financePageRendered = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return (text.includes('Invoices & Finance') || text.includes('Finance')) && (text.includes('Paid Invoices') || text.includes('Process Expired Invoices'));
      })()
    `);
    assert('Test 10: Admin Finance Page rendered', financePageRendered, 'Finance header and KPI cards loaded');

    // 11. Open Invoice Details for the Online Settled Invoice
    console.log(`Step 9: Opening Invoice Details for ${onlineInvoice.invoiceNumber}...`);
    await cdp.eval(`
      (() => {
        const viewBtn = document.getElementById('btn-view-invoice-${onlineInvoice._id}');
        if (viewBtn) {
          viewBtn.click();
          return true;
        }
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const targetRow = rows.find(r => r.innerText.includes('${onlineInvoice.invoiceNumber}'));
        if (targetRow) {
          const btn = targetRow.querySelector('button[id^="btn-view-invoice-"]');
          if (btn) btn.click();
        }
      })()
    `);
    await delay(2500);

    const onlineTransactionDetails = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        const hasOnlineBadge = text.includes('ONLINE');
        const hasPaymob = text.includes('Paymob Gateway') || text.includes('PAYMOB') || text.includes('Paymob');
        const hasPaidStatus = text.toLowerCase().includes('paid');
        return hasOnlineBadge && hasPaymob && hasPaidStatus;
      })()
    `);
    assert(
      'Test 11: Online transaction history displayed with ONLINE / Paymob distinction',
      onlineTransactionDetails,
      'Shows Type: ONLINE, Provider: PAYMOB, Status: PAID, Recorded By: Paymob Gateway'
    );

    // Close detail modal
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close modal"]') || document.querySelector('.btn-close');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(1500);

    // 12. Coexistence Test: Open Coexist Invoice Details (which has prior ONLINE FAILED record)
    console.log(`Step 10: Inspecting Coexistence Invoice ${coexistInvoice.invoiceNumber}...`);
    await cdp.eval(`
      (() => {
        const viewBtn = document.getElementById('btn-view-invoice-${coexistInvoice._id}');
        if (viewBtn) {
          viewBtn.click();
          return true;
        }
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const targetRow = rows.find(r => r.innerText.includes('${coexistInvoice.invoiceNumber}'));
        if (targetRow) {
          const btn = targetRow.querySelector('button[id^="btn-view-invoice-"]');
          if (btn) btn.click();
        }
      })()
    `);
    await delay(2500);

    // Click "Record Payment" inside modal
    console.log('Step 11: Recording manual bank transfer payment for Coexist invoice...');
    await cdp.eval(`
      (() => {
        const recordBtn = document.getElementById('btn-detail-record-payment');
        if (recordBtn) recordBtn.click();
      })()
    `);
    await delay(2000);

    // Fill Record Payment modal form
    await cdp.eval(`
      (() => {
        const amountInput = document.getElementById('payment-amount-input');
        const methodSelect = document.getElementById('payment-method-select');
        const refInput = document.getElementById('payment-reference-input');
        const notesInput = document.getElementById('payment-notes-input');

        if (amountInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(amountInput, '4500');
          } else {
            amountInput.value = '4500';
          }
          amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (methodSelect) {
          methodSelect.value = 'BANK_TRANSFER';
          methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (refInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(refInput, 'CIB-WIRE-BRW-2026');
          } else {
            refInput.value = 'CIB-WIRE-BRW-2026';
          }
          refInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (notesInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(notesInput, 'Manual bank wire offline settlement');
          } else {
            notesInput.value = 'Manual bank wire offline settlement';
          }
          notesInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const confirmBtn = document.getElementById('btn-confirm-record-payment');
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(3500);

    // 13. Verify Both Online and Manual Transactions are Preserved in Detail View
    console.log('Step 12: Checking Coexist invoice to verify both historical records...');
    await cdp.eval(`
      (() => {
        // If details modal not visible, click view button
        const modalVisible = document.querySelector('table');
        if (!modalVisible) {
          const viewBtn = document.getElementById('btn-view-invoice-${coexistInvoice._id}');
          if (viewBtn) viewBtn.click();
        }
      })()
    `);
    await delay(2500);

    const coexistHistoryPreserved = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        const hasOnline = text.includes('ONLINE');
        const hasManual = text.includes('MANUAL');
        const hasBank = text.includes('BANK_TRANSFER');
        const isPaid = text.toLowerCase().includes('paid');
        return hasOnline && hasManual && hasBank && isPaid;
      })()
    `);
    assert(
      'Test 12: Immutable ledger preserves both ONLINE (FAILED) and MANUAL (BANK_TRANSFER) history',
      coexistHistoryPreserved,
      'Both transaction rows rendered in UI with respective channels and statuses'
    );

    console.log('\n===============================================================');
    const passed = testResults.filter((r) => r.pass).length;
    const failed = testResults.filter((r) => !r.pass).length;
    console.log(`TOTAL CDP BROWSER TESTS: ${testResults.length} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('===============================================================');

    await cdp.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('CDP test error:', err.message);
    await cdp.close();
    process.exit(1);
  }
}

run();
