const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const mongoose = require('../backend/node_modules/mongoose');
const User = require('../backend/src/models/User');
const Notification = require('../backend/src/models/Notification');
const OfficialEmailConfiguration = require('../backend/src/models/OfficialEmailConfiguration');
const Certificate = require('../backend/src/models/Certificate');
const Evaluation = require('../backend/src/models/Evaluation');
const Cohort = require('../backend/src/models/Cohort');
const Course = require('../backend/src/models/Course');
const Enrollment = require('../backend/src/models/Enrollment');
const certificateService = require('../backend/src/services/certificateService');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, 'chrome-phase14-profile');
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

async function waitForSelector(cdp, selector, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const exists = await cdp.eval(`Boolean(document.querySelector('${selector}'))`);
    if (exists) return true;
    await delay(250);
  }
  return false;
}

async function loginUser(cdp, email, password = 'Password123!') {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
  await delay(1200);
  await cdp.eval(`localStorage.clear(); sessionStorage.clear();`);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
  await waitForSelector(cdp, 'input[type="email"]');
  await cdp.eval(`
    (() => {
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
  await delay(2000);
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('PHASE 14 BROWSER TESTING SUITE (REAL DOM / CDP EXECUTION)');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('[DB] Connected to MongoDB.');

  const sampleStudent = await User.findOne({ email: 'student@esa.dev' });
  const uniStudent = await User.findOne({ email: 'uni.student@esa.dev' });
  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });

  if (!sampleStudent || !uniStudent || !preUniAdmin || !superAdmin) {
    throw new Error('Required seed users missing.');
  }

  // Ensure Email configuration exists
  await OfficialEmailConfiguration.getOrCreateConfig();

  // Clean old notifications for sampleStudent & uniStudent
  await Notification.deleteMany({ recipient: { $in: [sampleStudent._id, uniStudent._id] } });

  // Seed 5 structured notifications for sampleStudent
  const dummyResId = new mongoose.Types.ObjectId();
  const testNotifs = [
    {
      recipient: sampleStudent._id,
      type: 'APPLICATION_DECISION',
      title: 'Application Accepted: Orbital Mechanics',
      message: 'Congratulations! Your application for Cohort COH-PRE-2026-001 has been ACCEPTED.',
      relatedResource: { resourceType: 'Application', resourceId: dummyResId },
      division: 'PRE_UNIVERSITY',
      read: false,
      emailSent: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30m ago
    },
    {
      recipient: sampleStudent._id,
      type: 'PAYMENT_CONFIRMED',
      title: 'Payment Confirmed: Invoice INV-2026-008',
      message: 'Your payment of 1,500 EGP has been successfully processed.',
      relatedResource: { resourceType: 'Invoice', resourceId: dummyResId },
      division: 'PRE_UNIVERSITY',
      read: false,
      emailSent: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 20), // 20m ago
    },
    {
      recipient: sampleStudent._id,
      type: 'ENROLLMENT_PROMOTED',
      title: 'Promoted from Waitlist: Satellite Systems',
      message: 'A seat opened in Cohort COH-PRE-2026-002! You have been promoted to ENROLLED.',
      relatedResource: { resourceType: 'Enrollment', resourceId: dummyResId },
      division: 'PRE_UNIVERSITY',
      read: false,
      emailSent: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 10), // 10m ago
    },
    {
      recipient: sampleStudent._id,
      type: 'EVALUATION_PUBLISHED',
      title: 'Evaluation Result: Final Grade Available',
      message: 'Your final evaluation has been computed: PASS with an average score of 94.5%.',
      relatedResource: { resourceType: 'Evaluation', resourceId: dummyResId },
      division: 'PRE_UNIVERSITY',
      read: false,
      emailSent: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5m ago
    },
    {
      recipient: sampleStudent._id,
      type: 'CERTIFICATE_ISSUED',
      title: 'Official Certificate Issued: Space Systems Engineering',
      message: 'Your official certificate has been issued and registered on the Egyptian Space Agency registry.',
      relatedResource: { resourceType: 'Certificate', resourceId: dummyResId },
      division: 'PRE_UNIVERSITY',
      read: true,
      readAt: new Date(Date.now() - 1000 * 60 * 1),
      emailSent: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 2), // 2m ago
    },
  ];

  await Notification.insertMany(testNotifs);
  console.log(`[DB] Seeded 5 initial notifications for sampleStudent (4 unread, 1 read).`);

  // Seed 1 notification for uniStudent to verify division scoping
  await Notification.create({
    recipient: uniStudent._id,
    type: 'APPLICATION_DECISION',
    title: 'University Program Application Status',
    message: 'University Division Application review completed for Satellite Engineering.',
    relatedResource: { resourceType: 'Application', resourceId: new mongoose.Types.ObjectId() },
    division: 'UNIVERSITY',
    read: false,
    emailSent: true,
    createdAt: new Date(),
  });
  console.log(`[DB] Seeded 1 UNIVERSITY notification for uniStudent (division scoping).`);

  // Launch or connect to Chrome
  let connected = false;
  let chromeProcess = null;

  try {
    await httpGet(`http://127.0.0.1:${PORT}/json/version`);
    connected = true;
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
      ],
      { detached: false }
    );
    await delay(3000);
  }

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Could not find active Chrome page debug URL.');
  }

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  console.log('[CDP] Attached successfully to Chrome tab.\n');

  const testResults = [];
  function record(id, title, pass, details = {}) {
    testResults.push({ id, title, pass, details });
    console.log(`[${pass ? '✓ PASS' : '✗ FAIL'}] Browser Test ${id}: ${title}`);
    if (details && typeof details === 'object' && Object.keys(details).length) {
      console.log('   Evidence:', JSON.stringify(details));
    }
  }

  // =================================================================
  // TEST 1: Student Bell Icon & Unread Count Badge in Navbar
  // =================================================================
  console.log('--- Test 1: Student Bell Icon & Unread Count Badge in Navbar ---');
  await loginUser(cdp, 'student@esa.dev');

  await waitForSelector(cdp, '#notification-bell-btn');
  const bellExists = await cdp.eval(`Boolean(document.querySelector('#notification-bell-btn'))`);
  const badgeText = await cdp.eval(`document.querySelector('#notification-unread-badge')?.innerText`);
  const badgeVisible = await cdp.eval(`Boolean(document.querySelector('#notification-unread-badge'))`);

  record(
    'BT-01',
    'Notification Bell icon and Unread Badge (count = 4) render in student navbar',
    bellExists && badgeVisible && badgeText === '4',
    { bellExists, badgeVisible, badgeText }
  );

  // =================================================================
  // TEST 2: Notification Dropdown Panel Open & Event Triggers Display
  // =================================================================
  console.log('\n--- Test 2: Notification Dropdown Panel Open & Event Triggers Display ---');
  await cdp.eval(`document.querySelector('#notification-bell-btn').click();`);
  await waitForSelector(cdp, '#notification-dropdown-panel');

  const dropdownData = await cdp.eval(`
    (() => {
      const panel = document.querySelector('#notification-dropdown-panel');
      if (!panel) return null;
      const itemElements = Array.from(panel.querySelectorAll('div[data-testid="notification-bell-item"]'));
      const items = itemElements.map(el => {
        const title = el.querySelector('div[class*="itemTitle"] span')?.innerText;
        const msg = el.querySelector('div[class*="itemMsg"]')?.innerText;
        const isUnread = el.className.includes('unreadItem');
        return { title, msg, isUnread };
      });
      const headerText = panel.querySelector('div[class*="headerTitle"]')?.innerText;
      return { headerText, itemCount: items.length, items };
    })()
  `);

  const hasAppDecision = dropdownData?.items?.some((i) => i.title?.includes('Application Accepted'));
  const hasPayment = dropdownData?.items?.some((i) => i.title?.includes('Payment Confirmed'));
  const hasWaitlist = dropdownData?.items?.some((i) => i.title?.includes('Promoted from Waitlist'));
  const hasEvaluation = dropdownData?.items?.some((i) => i.title?.includes('Evaluation Result'));
  const hasCertificate = dropdownData?.items?.some((i) => i.title?.includes('Certificate Issued'));

  record(
    'BT-02',
    'Dropdown panel opens and displays all 5 event types with titles and messages',
    dropdownData && dropdownData.itemCount === 5 && hasAppDecision && hasPayment && hasWaitlist && hasEvaluation && hasCertificate,
    {
      header: dropdownData?.headerText,
      itemCount: dropdownData?.itemCount,
      eventTypesFound: { hasAppDecision, hasPayment, hasWaitlist, hasEvaluation, hasCertificate },
      titles: dropdownData?.items?.map((i) => i.title),
    }
  );

  // =================================================================
  // TEST 3: Mark Single Notification as Read in Dropdown
  // =================================================================
  console.log('\n--- Test 3: Mark Single Notification as Read in Dropdown ---');
  const clickedRead = await cdp.eval(`
    (() => {
      const btn = document.querySelector('button[data-testid="notification-mark-read-btn"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await delay(1000);

  const updatedBadgeText = await cdp.eval(`document.querySelector('#notification-unread-badge')?.innerText`);
  const dbUnreadCount = await Notification.countDocuments({ recipient: sampleStudent._id, read: false });

  record(
    'BT-03',
    'Clicking "Mark read" decreases unread badge count from 4 to 3 in real-time and DB',
    clickedRead && updatedBadgeText === '3' && dbUnreadCount === 3,
    { clickedRead, updatedBadgeText, dbUnreadCount }
  );

  // =================================================================
  // TEST 4: Notification Dropdown Mark All Read Flow
  // =================================================================
  console.log('\n--- Test 4: Notification Dropdown Mark All Read Flow ---');
  const isDropdownOpen = await cdp.eval(`Boolean(document.querySelector('#mark-all-notifications-read-btn'))`);
  if (!isDropdownOpen) {
    await cdp.eval(`document.querySelector('#notification-bell-btn')?.click();`);
    await delay(600);
  }

  // Click Mark All as Read button in notification panel
  const clickedMarkAll = await cdp.eval(`
    (() => {
      const btn = document.querySelector('#mark-all-notifications-read-btn');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  await delay(1200);

  const finalBadgeExists = await cdp.eval(`Boolean(document.querySelector('#notification-unread-badge'))`);
  const finalDbUnreadCount = await Notification.countDocuments({ recipient: sampleStudent._id, read: false });

  record(
    'BT-04',
    'Execute "Mark all read" in notification panel, clearing unread badge and setting DB unread count to 0',
    clickedMarkAll && !finalBadgeExists && finalDbUnreadCount === 0,
    { clickedMarkAll, finalBadgeExists, finalDbUnreadCount }
  );

  // =================================================================
  // TEST 5: Division Admin Notification Log View (Division Scoped)
  // =================================================================
  console.log('\n--- Test 5: Division Admin Notification Log View (Division Scoped) ---');
  await loginUser(cdp, 'preuni.admin@esa.dev');

  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/notifications' });
  await delay(2000);

  const adminHeader = await cdp.eval(`document.querySelector('h1')?.innerText`);
  const tableRowsData = await cdp.eval(`
    (() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).map(tr => {
        return {
          recipient: tr.cells[0]?.innerText?.split('\\n')[0],
          event: tr.cells[1]?.innerText,
          title: tr.cells[2]?.innerText?.split('\\n')[0],
          division: tr.cells[3]?.innerText,
          status: tr.cells[4]?.innerText,
          email: tr.cells[5]?.innerText
        };
      });
      return rows;
    })()
  `);

  const hasPreUniOnly = tableRowsData.length > 0 && tableRowsData.every((r) => r.division?.includes('Pre-University'));
  const hasNoUni = tableRowsData.every((r) => !r.division?.includes('University') || r.division?.includes('Pre-University'));

  // Test Details modal
  await waitForSelector(cdp, 'tbody tr button');
  const openedModal = await cdp.eval(`
    (() => {
      const detailBtn = document.querySelector('tbody tr button');
      if (detailBtn) {
        detailBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await waitForSelector(cdp, '[role="dialog"]');

  const modalData = await cdp.eval(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return null;
      return {
        title: modal.querySelector('h5')?.innerText,
        bodyText: modal.innerText
      };
    })()
  `);

  // Close modal
  await cdp.eval(`
    (() => {
      const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Close dialog"]');
      if (closeBtn) closeBtn.click();
    })()
  `);
  await delay(600);

  record(
    'BT-05',
    'Division Admin sees only Pre-University notifications (zero University leaks) and opens Details modal',
    adminHeader?.includes('Pre-University') && hasPreUniOnly && hasNoUni && openedModal && modalData?.title?.includes('Notification Audit Record'),
    {
      header: adminHeader,
      rowCount: tableRowsData.length,
      divisionsInTable: [...new Set(tableRowsData.map((r) => r.division))],
      modalTitle: modalData?.title,
    }
  );

  // =================================================================
  // TEST 6: Super Admin Global Access & Email Service Configuration Modal
  // =================================================================
  console.log('\n--- Test 6: Super Admin Global Access & Email Service Configuration Modal ---');
  await loginUser(cdp, 'superadmin@esa.dev');

  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/notifications' });
  await waitForSelector(cdp, '#admin-email-config-btn', 12000);

  const superHeader = await cdp.eval(`document.querySelector('h1')?.innerText`);
  const configBtnExists = await cdp.eval(`Boolean(document.querySelector('#admin-email-config-btn'))`);

  // Open Email Service Configuration Modal
  await cdp.eval(`document.querySelector('#admin-email-config-btn').click();`);
  await waitForSelector(cdp, '[role="dialog"]');

  const configModalData = await cdp.eval(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return null;
      const title = modal.querySelector('h5')?.innerText;
      const senderName = document.querySelector('#senderName')?.value;
      const senderEmail = document.querySelector('#senderEmail')?.value;
      const globalEnabled = document.querySelector('#global-email-toggle')?.checked;
      return { title, senderName, senderEmail, globalEnabled };
    })()
  `);

  // Update sender name and submit
  await cdp.eval(`
    (() => {
      const input = document.querySelector('#senderName');
      if (!input) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, 'Egyptian Space Agency - Academy Registry');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const form = document.querySelector('[role="dialog"] form');
      if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await delay(1500);

  const updatedConfigDb = await OfficialEmailConfiguration.findOne();

  record(
    'BT-06',
    'Super Admin accesses cross-division log and configures Email Service via Modal',
    superHeader?.includes('Platform Notification Oversight Log') &&
      configBtnExists &&
      configModalData?.title?.includes('Official Email Service Configuration') &&
      updatedConfigDb.senderName === 'Egyptian Space Agency - Academy Registry',
    {
      superHeader,
      configBtnExists,
      modalTitle: configModalData?.title,
      savedDbSender: updatedConfigDb?.senderName,
      globalEmailEnabled: updatedConfigDb?.globalEmailEnabled,
    }
  );

  // =================================================================
  // TEST 7: Critical Test — Email Failure Does NOT Block Business Action
  // =================================================================
  console.log('\n--- Test 7: Critical Test — Email Failure Does NOT Block Business Action ---');

  // Use existing cohort and create a qualifying PASS Evaluation for sampleStudent
  const cohort = await Cohort.findOne({ division: 'PRE_UNIVERSITY' });
  let dummyEnrollment = await Enrollment.findOne({ cohort: cohort._id, student: sampleStudent._id });
  if (!dummyEnrollment) {
    dummyEnrollment = await Enrollment.create({
      student: sampleStudent._id,
      cohort: cohort._id,
      program: cohort.program,
      division: cohort.division,
      status: 'CONFIRMED',
      enrolledAt: new Date(),
      createdBy: preUniAdmin._id,
    });
  }

  const dummyEval = await Evaluation.create({
    cohort: cohort._id,
    student: sampleStudent._id,
    enrollment: dummyEnrollment._id,
    program: cohort.program,
    division: cohort.division,
    attendanceRate: 100,
    averageScore: 97,
    attendanceThresholdMet: true,
    outcome: 'PASS',
    outcomeReason: 'Email failure test qualification',
    evaluatedBy: preUniAdmin._id,
    evaluatedAt: new Date(Date.now() + 10000), // ensure newest
  });

  // Clear conflicting certs for this student + cohort
  await Certificate.deleteMany({ student: sampleStudent._id, cohort: cohort._id });

  // Activate email failure simulation
  process.env.SIMULATE_EMAIL_FAILURE = 'true';
  let certIssued = null;
  let issueError = null;

  try {
    certIssued = await certificateService.issueCertificate({
      evaluationId: dummyEval._id,
      user: preUniAdmin,
    });
    // Wait for the async non-blocking setImmediate dispatch before clearing simulation flag
    await delay(800);
  } catch (err) {
    issueError = err.message;
  } finally {
    delete process.env.SIMULATE_EMAIL_FAILURE;
  }

  // Check DB state
  const certInDb = certIssued ? await Certificate.findById(certIssued._id) : null;
  const failureNotif = await Notification.findOne({
    recipient: sampleStudent._id,
    type: 'CERTIFICATE_ISSUED',
  }).sort({ createdAt: -1 });

  // Refresh admin browser view to verify failed email status badge
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/notifications' });
  await delay(2000);

  const failedBadgeInDom = await cdp.eval(`
    (() => {
      const failedBadge = document.querySelector('span.badge.bg-danger-subtle');
      return failedBadge ? { text: failedBadge.innerText, title: failedBadge.title } : null;
    })()
  `);

  record(
    'BT-07',
    '[CRITICAL] Business action (Certificate Issuance) succeeds 100% despite simulated SMTP failure; Notification is created with emailError recorded',
    issueError === null &&
      certInDb !== null &&
      certInDb.status === 'ISSUED' &&
      failureNotif !== null &&
      failureNotif.emailSent === false &&
      failureNotif.emailError?.includes('Simulated SMTP connection failure') &&
      failedBadgeInDom !== null,
    {
      issueError,
      certificateSerial: certInDb?.serialNumber,
      certificateStatus: certInDb?.status,
      notificationId: failureNotif?._id,
      notificationEmailSent: failureNotif?.emailSent,
      notificationEmailError: failureNotif?.emailError,
      domBadgeText: failedBadgeInDom?.text,
      domBadgeTitle: failedBadgeInDom?.title,
    }
  );

  // Summary
  console.log('\n================================================================');
  console.log('BROWSER TEST SUMMARY');
  console.log('================================================================');
  const allPassed = testResults.every((t) => t.pass);
  console.log(`TOTAL TESTS: ${testResults.length}`);
  console.log(`PASSED: ${testResults.filter((t) => t.pass).length}`);
  console.log(`FAILED: ${testResults.filter((t) => !t.pass).length}`);
  console.log(`STATUS: ${allPassed ? 'ALL BROWSER TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('================================================================\n');

  await cdp.close();
  if (chromeProcess) {
    chromeProcess.kill();
  }
  await mongoose.disconnect();

  if (!allPassed) {
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed with uncaught exception:', err);
  process.exit(1);
});
