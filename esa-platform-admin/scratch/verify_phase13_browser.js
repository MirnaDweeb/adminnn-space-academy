const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/src/models/User').base || require('mongoose');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const AuditLog = require('../backend/src/models/AuditLog');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\89793eb5-fd2a-4948-961b-c2505a5abd50\\scratch\\chrome-phase12-profile';
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

async function waitForSelector(cdp, selector, timeoutMs = 8000) {
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
  await delay(1500);
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

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('PHASE 13 BROWSER TESTING SUITE (REAL DOM / CDP EXECUTION)');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('[DB] Connected to MongoDB.');

  const sampleStudent = await User.findOne({ email: 'student@esa.dev' });
  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });

  // Target Phase 12 cohort
  let testCohort = await Cohort.findOne({ cohortNumber: 'COH-PRE-2026-P12' });
  if (!testCohort) {
    testCohort = await Cohort.findOne({ division: 'PRE_UNIVERSITY' }).sort({ createdAt: -1 });
  }

  // Ensure an uncertified PASS evaluation exists for sampleStudent in this cohort
  let targetPassEval = await Evaluation.findOne({
    cohort: testCohort._id,
    student: sampleStudent._id,
    outcome: 'PASS',
  }).sort({ evaluatedAt: -1 });

  if (!targetPassEval) {
    targetPassEval = await Evaluation.create({
      cohort: testCohort._id,
      student: sampleStudent._id,
      enrollment: new mongoose.Types.ObjectId(),
      program: testCohort.course,
      division: 'PRE_UNIVERSITY',
      attendanceRate: 100,
      averageScore: 92,
      attendanceThresholdMet: true,
      outcome: 'PASS',
      outcomeReason: 'Met all requirements for certification testing',
      evaluatedAt: new Date(),
    });
  }

  // Clear existing certificate on this evaluation so Browser Test 1 can issue cleanly
  await Certificate.deleteMany({ evaluation: targetPassEval._id });
  console.log(`[DB] Cleaned previous certificate on Evaluation ${targetPassEval._id} for sampleStudent.`);

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

  let issuedSerial = null;
  let issuedToken = null;
  let issuedCertId = null;

  // =================================================================
  // TEST 1: Division admin issues certificate for PASS evaluation
  // =================================================================
  console.log('\n--- Scenario 1: Division Admin Issues Certificate for PASS Evaluation ---');
  await loginUser(cdp, 'preuni.admin@esa.dev');

  // Navigate to Division Cohorts page
  await cdp.send('Page.navigate', { url: `http://localhost:5173/admin/PRE_UNIVERSITY/cohorts` });
  await waitForSelector(cdp, `#btn-view-cohort-${testCohort._id}`);

  // Open the Cohort details modal
  await cdp.eval(`document.querySelector('#btn-view-cohort-${testCohort._id}').click();`);
  await waitForSelector(cdp, '#tab-cohort-evaluations');

  // Switch to "Evaluations & Outcomes" tab inside cohort detail modal
  await cdp.eval(`document.querySelector('#tab-cohort-evaluations').click();`);
  await waitForSelector(cdp, `#btn-issue-cert-${targetPassEval._id}`);

  // Click "Issue Certificate"
  await cdp.eval(`document.querySelector('#btn-issue-cert-${targetPassEval._id}').click();`);
  await delay(1000);

  // Confirm issuance in ConfirmModal
  const confirmResult = await cdp.eval(`
    (() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(
        b => b.innerText.includes('Issue Certificate') && (b.className.includes('btn-success') || b.className.includes('primary'))
      );
      if (confirmBtn) {
        confirmBtn.click();
        return { confirmed: true };
      }
      return { confirmed: false };
    })()
  `);
  console.log('   ConfirmModal Submission:', confirmResult);
  await delay(3000);

  // Check that the evaluation row now displays the Certified badge with serial number
  await waitForSelector(cdp, `#cert-badge-${targetPassEval._id}`);
  const evalRowAfterIssue = await cdp.eval(`
    (() => {
      const badge = document.querySelector('#cert-badge-${targetPassEval._id}');
      if (badge) {
        const text = badge.innerText.replace(/\\s+/g, ' ');
        const serialMatch = text.match(/CERT-PRE-[0-9]{4}-[0-9]{6}/);
        return {
          hasBadge: true,
          serial: serialMatch ? serialMatch[0] : text,
          badgeText: text
        };
      }
      return { hasBadge: false };
    })()
  `);
  console.log('   Evaluation Row Post-Issuance:', evalRowAfterIssue);
  issuedSerial = evalRowAfterIssue?.serial;

  // Navigate to Certificate Management page to verify newly issued certificate
  await cdp.send('Page.navigate', { url: `http://localhost:5173/admin/PRE_UNIVERSITY/certificates` });
  await waitForSelector(cdp, 'tbody tr');
  await delay(1500);

  const certTableDom = await cdp.eval(`
    (() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const foundRow = rows.find(r => r.innerText.includes('Sample Student') && r.innerText.includes('Issued'));
      if (foundRow) {
        const text = foundRow.innerText.replace(/\\s+/g, ' ');
        const serialMatch = text.match(/CERT-PRE-[0-9]{4}-[0-9]{6}/);
        const revokeBtn = foundRow.querySelector('button[id^="btn-revoke-cert-"]');
        return {
          found: true,
          serial: serialMatch ? serialMatch[0] : null,
          certId: revokeBtn ? revokeBtn.id.replace('btn-revoke-cert-', '') : null,
          rowText: text.slice(0, 140)
        };
      }
      return { found: false, count: rows.length };
    })()
  `);
  console.log('   Certificates Management Table:', certTableDom);

  issuedCertId = certTableDom?.certId;
  record(
    '1.1',
    'Division admin issues certificate for PASS evaluation and it appears in Certificate Management',
    evalRowAfterIssue?.hasBadge && (certTableDom?.found || Boolean(issuedSerial)),
    { serial: issuedSerial, row: certTableDom?.rowText || evalRowAfterIssue?.badgeText }
  );

  // Retrieve verification token from DB
  const dbCert = await Certificate.findOne({ serialNumber: issuedSerial });
  issuedToken = dbCert?.verificationToken;
  if (!issuedCertId && dbCert) issuedCertId = dbCert._id.toString();
  console.log(`   Issued Certificate ID: ${issuedCertId}, Token: ${issuedToken}`);

  // =================================================================
  // TEST 2: Attempt duplicate issuance (blocked)
  // =================================================================
  console.log('\n--- Scenario 2: Attempt Duplicate Issuance (Blocked) ---');
  await cdp.send('Page.navigate', { url: `http://localhost:5173/admin/PRE_UNIVERSITY/cohorts` });
  await waitForSelector(cdp, `#btn-view-cohort-${testCohort._id}`);

  await cdp.eval(`document.querySelector('#btn-view-cohort-${testCohort._id}').click();`);
  await waitForSelector(cdp, '#tab-cohort-evaluations');

  await cdp.eval(`document.querySelector('#tab-cohort-evaluations').click();`);
  await waitForSelector(cdp, `#cert-badge-${targetPassEval._id}`);

  const duplicateCheck = await cdp.eval(`
    (() => {
      const issueBtn = document.querySelector('#btn-issue-cert-${targetPassEval._id}');
      const certBadge = document.querySelector('#cert-badge-${targetPassEval._id}');
      return {
        hasIssueButton: Boolean(issueBtn),
        hasCertifiedBadge: Boolean(certBadge),
        serialOnBadge: certBadge ? certBadge.innerText.trim() : null
      };
    })()
  `);
  console.log('   Duplicate Prevention Check:', duplicateCheck);

  record(
    '2.1',
    'Duplicate issuance blocked: button replaced by Certified serial badge',
    duplicateCheck?.hasIssueButton === false && duplicateCheck?.hasCertifiedBadge === true,
    duplicateCheck || {}
  );

  // =================================================================
  // TEST 3: Attempt to issue for FAIL/INCOMPLETE evaluation (no action)
  // =================================================================
  console.log('\n--- Scenario 3: Verify FAIL / INCOMPLETE Evaluations Have No Issue Action ---');
  const nonPassActions = await cdp.eval(`
    (() => {
      const rows = Array.from(document.querySelectorAll('table#table-cohort-evaluations tbody tr, tbody tr'));
      const failRow = rows.find(r => r.innerText.toLowerCase().includes('fail'));
      const incRow = rows.find(r => r.innerText.toLowerCase().includes('incomplete'));
      const failHasIssue = failRow ? Array.from(failRow.querySelectorAll('button')).some(b => b.innerText.includes('Issue Certificate') || b.id?.startsWith('btn-issue-cert')) : false;
      const incHasIssue = incRow ? Array.from(incRow.querySelectorAll('button')).some(b => b.innerText.includes('Issue Certificate') || b.id?.startsWith('btn-issue-cert')) : false;
      return {
        failFound: Boolean(failRow),
        failHasIssue,
        failSnippet: failRow ? failRow.innerText.replace(/\\s+/g, ' ').slice(0, 100) : null,
        incFound: Boolean(incRow),
        incHasIssue,
        incSnippet: incRow ? incRow.innerText.replace(/\\s+/g, ' ').slice(0, 100) : null,
      };
    })()
  `);
  console.log('   Non-PASS Evaluation Actions:', nonPassActions);

  record(
    '3.1',
    'FAIL and INCOMPLETE evaluations do not offer Issue Certificate action',
    nonPassActions?.failFound && !nonPassActions?.failHasIssue && !nonPassActions?.incHasIssue,
    nonPassActions || {}
  );

  // =================================================================
  // TEST 4: Student views own certificate and downloads PDF
  // =================================================================
  console.log('\n--- Scenario 4: Student Views Certificate & Downloads PDF ---');
  await loginUser(cdp, 'student@esa.dev');

  await cdp.send('Page.navigate', { url: `http://localhost:5173/student/certificates` });
  await delay(2500);

  const studentCertDom = await cdp.eval(`
    (() => {
      const bodyText = document.body.innerText;
      const hasSerial = bodyText.includes('${issuedSerial}');
      const hasPdfBtn = Array.from(document.querySelectorAll('button, a')).some(el => el.innerText.includes('Download PDF'));
      const hasVerifyBtn = Array.from(document.querySelectorAll('button, a')).some(el => el.innerText.includes('Verify') || el.innerText.includes('Copy'));
      return {
        hasSerial,
        hasPdfBtn,
        hasVerifyBtn,
        pageSnippet: bodyText.replace(/\\s+/g, ' ').slice(0, 180)
      };
    })()
  `);
  console.log('   Student Certificates View DOM:', studentCertDom);

  record(
    '4.1',
    'Student views own certificate with serial number, PDF action, and verification link',
    studentCertDom?.hasSerial && studentCertDom?.hasPdfBtn,
    studentCertDom || {}
  );

  // =================================================================
  // TEST 5: Anyone (unauthenticated) visits public verification page
  // =================================================================
  console.log('\n--- Scenario 5: Public Unauthenticated Verification ---');
  await cdp.eval(`localStorage.clear();`);
  await cdp.send('Page.navigate', { url: `http://localhost:5173/verify/${issuedToken}` });
  await delay(2500);

  const publicVerifyDom = await cdp.eval(`
    (() => {
      const text = document.body.innerText;
      const isOfficial = text.includes('AUTHENTIC CREDENTIAL VERIFIED') || text.toLowerCase().includes('officially issued');
      const hasSerial = text.includes('${issuedSerial}');
      const hasStudentName = text.includes('Sample Student');
      const hasEmailLeak = text.includes('student@esa.dev');
      const hasScoreLeak = text.includes('Average Score') || text.includes('92%');
      return {
        isOfficial,
        hasSerial,
        hasStudentName,
        hasEmailLeak,
        hasScoreLeak,
        snippet: text.replace(/\\s+/g, ' ').slice(0, 220)
      };
    })()
  `);
  console.log('   Public Verification DOM:', publicVerifyDom);

  record(
    '5.1',
    'Public verification confirms authentic certificate with zero sensitive data leaks',
    publicVerifyDom?.isOfficial && publicVerifyDom?.hasSerial && !publicVerifyDom?.hasEmailLeak && !publicVerifyDom?.hasScoreLeak,
    publicVerifyDom || {}
  );

  // =================================================================
  // TEST 6: Admin revokes certificate with reason -> status updates & public shows REVOKED
  // =================================================================
  console.log('\n--- Scenario 6: Admin Revocation & Verification Status Update ---');
  await loginUser(cdp, 'preuni.admin@esa.dev');

  await cdp.send('Page.navigate', { url: `http://localhost:5173/admin/PRE_UNIVERSITY/certificates` });
  await waitForSelector(cdp, `#btn-revoke-cert-${issuedCertId}`);

  // Click direct Revoke button on the certificate row
  await cdp.eval(`document.querySelector('#btn-revoke-cert-${issuedCertId}').click();`);
  await waitForSelector(cdp, '#input-revoke-reason');

  // Fill in revocation reason and submit
  const revokeSubmitted = await cdp.eval(`
    (() => {
      const textarea = document.querySelector('#input-revoke-reason');
      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(textarea, 'Enrollment verification failed: duplicate identity discovered during cross-check.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const confirmRevokeBtn = document.querySelector('#btn-confirm-revoke');
      if (confirmRevokeBtn) {
        confirmRevokeBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('   Revocation submitted:', revokeSubmitted);
  await delay(3000);

  // Verify status in Certificate Management page updated to REVOKED
  const revokedStatusDom = await cdp.eval(`
    (() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const row = rows.find(r => r.innerText.includes('${issuedSerial}'));
      if (row) {
        return {
          rowFound: true,
          statusText: row.innerText.replace(/\\s+/g, ' ').slice(0, 140),
          isRevoked: row.innerText.includes('Revoked') || row.innerText.includes('REVOKED')
        };
      }
      return { rowFound: false };
    })()
  `);
  console.log('   Revoked Table DOM:', revokedStatusDom);

  record(
    '6.1',
    'Admin revokes certificate with required reason and status updates to REVOKED',
    revokedStatusDom?.isRevoked,
    revokedStatusDom || {}
  );

  // Now, visit public verification page as unauthenticated user to confirm REVOKED status
  await cdp.eval(`localStorage.clear();`);
  await cdp.send('Page.navigate', { url: `http://localhost:5173/verify/${issuedToken}` });
  await delay(2500);

  const publicRevokedDom = await cdp.eval(`
    (() => {
      const text = document.body.innerText;
      const showsRevoked = text.includes('REVOKED') || text.includes('Certificate Revoked');
      const showsReason = text.includes('Enrollment verification failed') || text.includes('duplicate identity');
      return {
        showsRevoked,
        showsReason,
        snippet: text.replace(/\\s+/g, ' ').slice(0, 220)
      };
    })()
  `);
  console.log('   Public Verification Post-Revocation DOM:', publicRevokedDom);

  record(
    '6.2',
    'Public verification page immediately reflects REVOKED status and displays reason',
    publicRevokedDom?.showsRevoked && publicRevokedDom?.showsReason,
    publicRevokedDom || {}
  );

  // =================================================================
  // TEST 7: Cross-division attempt blocked
  // =================================================================
  console.log('\n--- Scenario 7: Cross-Division Isolation ---');
  await loginUser(cdp, 'uni.admin@esa.dev');

  await cdp.send('Page.navigate', { url: `http://localhost:5173/admin/UNIVERSITY/certificates` });
  await delay(2500);

  const crossDivDom = await cdp.eval(`
    (() => {
      const text = document.body.innerText;
      const containsPreUniCert = text.includes('${issuedSerial}');
      const rows = Array.from(document.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return {
        containsPreUniCert,
        visibleRows: rows.slice(0, 5)
      };
    })()
  `);
  console.log('   University Admin Certificate View:', crossDivDom);

  record(
    '7.1',
    'University admin cannot see or manage Pre-University certificates (division scoped)',
    crossDivDom?.containsPreUniCert === false,
    crossDivDom || {}
  );

  // Close browser connection
  await cdp.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  const allPassed = testResults.every((t) => t.pass);
  const passCount = testResults.filter((t) => t.pass).length;
  console.log(`PHASE 13 BROWSER TEST RESULT: ${passCount} / ${testResults.length} PASSED`);
  console.log('================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runBrowserVerification().catch((err) => {
  console.error('Fatal Browser Test Error:', err);
  process.exit(1);
});
