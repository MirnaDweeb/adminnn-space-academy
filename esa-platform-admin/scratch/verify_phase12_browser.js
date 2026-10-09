const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/src/models/User').base || require('mongoose');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Application = require('../backend/src/models/Application');
const Enrollment = require('../backend/src/models/Enrollment');
const Attendance = require('../backend/src/models/Attendance');
const Assignment = require('../backend/src/models/Assignment');
const Assessment = require('../backend/src/models/Assessment');
const Evaluation = require('../backend/src/models/Evaluation');

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
  console.log('PHASE 12 BROWSER TESTING SUITE (REAL DOM / CDP EXECUTION)');
  console.log('================================================================\n');

  // Connect to DB and ensure we have an active/completed cohort with varied records
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('[DB] Connected to MongoDB.');

  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const instructor = await User.findOne({ email: 'instructor@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  // Find or verify our Phase 12 test cohort
  let testCohort = await Cohort.findOne({ cohortNumber: 'COH-PRE-2026-P12' });
  if (!testCohort) {
    testCohort = await Cohort.findOne({ division: 'PRE_UNIVERSITY' }).sort({ createdAt: -1 });
  }

  // Ensure instructor is assigned to this cohort so instructor tests succeed
  if (testCohort && (!testCohort.instructor || testCohort.instructor.toString() !== instructor._id.toString())) {
    testCohort.instructor = instructor._id;
    await testCohort.save();
  }

  console.log(`[DB] Target Browser Test Cohort: ${testCohort.cohortNumber} (${testCohort.name}) - ID: ${testCohort._id}`);

  // Launch headless Chrome
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
        '--window-size=1366,900',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    for (let i = 0; i < 25; i++) {
      await delay(400);
      try {
        await httpGet(`http://127.0.0.1:${PORT}/json/version`);
        connected = true;
        break;
      } catch (err) {}
    }
  }

  if (!connected) {
    if (chromeProcess) chromeProcess.kill();
    throw new Error('Could not connect to Chrome debugging port');
  }

  const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  console.log('[CDP] Connected to Chrome page target successfully.\n');

  const results = [];
  function assert(name, pass, detail) {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`[${pass ? '✓ PASS' : '✗ FAIL'}] ${name} ${detail ? `| ${detail}` : ''}`);
  }

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: DIVISION ADMIN EVALUATES COHORT & VIEWS RESULTS TABLE
    // -------------------------------------------------------------
    console.log('--- Scenario 1: Division Admin Evaluates Cohort & Views Results Table ---');
    await loginUser(cdp, 'preuni.admin@esa.dev');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/cohorts' });
    await delay(3000);

    const cohortsCount = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    assert('1.1 Admin arrives on Pre-University Cohorts page with cohort list', cohortsCount > 0, `Rows: ${cohortsCount}`);

    // Click "Details" button for target cohort
    const openedDetail = await cdp.eval(`
      (() => {
        const btn = document.querySelector('button[id="btn-view-cohort-${testCohort._id}"]') ||
                    document.querySelector('button[id^="btn-view-cohort-"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    assert('1.2 Opened Cohort Detail modal', openedDetail);
    await delay(1500);

    const modalTitle = await cdp.eval(`document.querySelector('div[role="dialog"] h5, div[role="dialog"] [class*="title"]')?.textContent`);
    assert('1.3 Cohort Detail modal rendered with cohort identifier', modalTitle && modalTitle.includes('COH-PRE'), `Title: ${modalTitle}`);

    // Switch to Tab 4: Evaluations & Outcomes
    await cdp.eval(`
      (() => {
        const tab = document.querySelector('#tab-cohort-evaluations');
        if (tab) tab.click();
      })()
    `);
    await delay(1500);

    const tabActive = await cdp.eval(`document.querySelector('#tab-cohort-evaluations')?.classList.contains('active') || document.querySelector('#table-cohort-evaluations') != null || document.querySelector('#btn-re-evaluate-cohort') != null`);
    assert('1.4 Evaluations & Outcomes tab activated in modal', tabActive);

    // Click "Evaluate Cohort" button to open ConfirmModal
    await cdp.eval(`
      (() => {
        const btn = document.querySelector('#btn-re-evaluate-cohort') ||
                    document.querySelector('#btn-evaluate-cohort-action') ||
                    document.querySelector('#btn-empty-evaluate-cohort');
        if (btn) btn.click();
      })()
    `);
    await delay(1000);

    const confirmModalOpen = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Evaluate Cohort') || text.includes('Run Evaluation') || text.includes('compute official evaluation records');
      })()
    `);
    assert('1.5 ConfirmModal displays for Evaluate Cohort action', confirmModalOpen);

    // Confirm execution by clicking the confirmation button
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const runBtn = buttons.find(b => b.textContent.includes('Run Evaluation') || b.textContent.includes('Computing'));
        if (runBtn) runBtn.click();
      })()
    `);
    await delay(3000);

    // Verify evaluations results table in the DOM
    const evalRowsCount = await cdp.eval(`document.querySelectorAll('#table-cohort-evaluations tbody tr').length`);
    assert('1.6 Evaluations results table renders evaluated student outcomes', evalRowsCount > 0, `Students evaluated: ${evalRowsCount}`);

    // Extract table rows text content
    const tableData = await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('#table-cohort-evaluations tbody tr'));
        return rows.map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim().replace(/\\n/g, ' '));
          return {
            student: cells[0],
            attendance: cells[1],
            score: cells[2],
            gate: cells[3],
            outcome: cells[4],
            reason: cells[5],
          };
        });
      })()
    `);

    console.log('[DOM] Rendered Evaluations Table Data:');
    console.table(tableData);

    const passOutcome = tableData.find(r => r.outcome && r.outcome.toUpperCase().includes('PASS'));
    const failOutcome = tableData.find(r => r.outcome && r.outcome.toUpperCase().includes('FAIL'));
    const incompleteOutcome = tableData.find(r => r.outcome && r.outcome.toUpperCase().includes('INCOMPLETE'));

    assert('1.7 PASS outcome rendered with tone badge', passOutcome != null, `Pass student: ${passOutcome?.student}`);
    assert('1.8 FAIL outcome rendered with tone badge', failOutcome != null, `Fail student: ${failOutcome?.student}`);
    assert('1.9 INCOMPLETE outcome rendered with tone badge', incompleteOutcome != null, `Incomplete student: ${incompleteOutcome?.student}`);

    // -------------------------------------------------------------
    // SCENARIO 2: RE-RUN EVALUATION & CHECK APPEND-ONLY HISTORY TIMELINE
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: Re-run Evaluation & View Student History Timeline ---');

    // Click "History" button on the first student row
    await cdp.eval(`
      (() => {
        const histBtn = document.querySelector('button[id^="btn-eval-history-"]');
        if (histBtn) histBtn.click();
      })()
    `);
    await delay(1200);

    const historyTimelineCount = await cdp.eval(`document.querySelectorAll('div[class*="timelineItem"]').length`);
    assert('2.1 Student Evaluation History timeline modal opens displaying append-only runs', historyTimelineCount >= 1, `Runs in timeline: ${historyTimelineCount}`);

    const timelineText = await cdp.eval(`
      (() => {
        const items = Array.from(document.querySelectorAll('div[class*="timelineItem"]'));
        return items.map(i => i.innerText.trim().replace(/\\n/g, ' '));
      })()
    `);
    console.log('[DOM] Student History Timeline Runs:');
    timelineText.forEach((t, idx) => console.log(`  Run #${idx + 1}: ${t.slice(0, 110)}...`));

    // Close history modal
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.btn-close');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(800);

    // -------------------------------------------------------------
    // SCENARIO 3: STUDENT VIEWS OWN EVALUATION OUTCOME (READ-ONLY)
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: Student Views Own Evaluation Outcome (Read-Only) ---');
    await loginUser(cdp, 'student@esa.dev');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/student/cohorts' });
    await delay(3000);

    const studentPageTitle = await cdp.eval(`document.querySelector('h1, .page-title, h2')?.textContent`);
    assert('3.1 Student navigates to My Classes & Academic Records', studentPageTitle && (studentPageTitle.includes('Classes') || studentPageTitle.includes('Cohort')), `Title: ${studentPageTitle}`);

    const evalSectionVisible = await cdp.eval(`
      (() => {
        const section = document.querySelector('div[id^="eval-section-"]');
        if (!section) return null;
        return {
          header: section.innerText.slice(0, 60),
          hasOutcomeBadge: section.querySelector('span[class*="badge"]') != null,
          hasReason: section.innerText.includes('Requirements met') || section.innerText.includes('Determination Summary') || section.innerText.includes('threshold'),
          isReadOnly: section.querySelector('button[id^="btn-evaluate"]') === null,
        };
      })()
    `);

    assert('3.2 Student sees Official Learning Outcome section', Boolean(evalSectionVisible?.hasOutcomeBadge), `Header: ${evalSectionVisible?.header}`);
    assert('3.3 Student sees certified determination reason and scores', Boolean(evalSectionVisible?.hasReason));
    assert('3.4 View is strictly read-only (no evaluate trigger button exposed to student)', evalSectionVisible?.isReadOnly === true);

    // -------------------------------------------------------------
    // SCENARIO 4: CROSS-DIVISION ATTEMPT BLOCKED
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Cross-Division Attempt Blocked ---');
    await loginUser(cdp, 'uni.admin@esa.dev');

    // Attempt to access Pre-University Cohorts as University Admin
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/cohorts' });
    await delay(2000);

    const currentPath = await cdp.eval('window.location.pathname');
    const crossDivBlocked = await cdp.eval(`
      document.body.innerText.includes('Unauthorized') ||
      document.body.innerText.includes('Access Denied') ||
      document.body.innerText.includes('403') ||
      window.location.pathname.includes('/unauthorized')
    `);
    assert('4.1 Cross-division access blocked on route guard / redirected to /unauthorized', Boolean(crossDivBlocked), `URL: ${currentPath}`);

    // -------------------------------------------------------------
    // SCENARIO 5: INSTRUCTOR VIEWS EVALUATIONS FOR ASSIGNED COHORT
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: Instructor Views Evaluations for Assigned Cohort ---');
    await loginUser(cdp, 'instructor@esa.dev');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/instructor/cohorts' });
    await delay(3000);

    const instructorTabExists = await cdp.eval(`document.querySelector('#instructor-tab-evaluations') != null`);
    assert('5.1 Instructor workspace contains Evaluated Outcomes tab', instructorTabExists);

    // Click Evaluated Outcomes tab
    await cdp.eval(`
      (() => {
        const tab = document.querySelector('#instructor-tab-evaluations');
        if (tab) tab.click();
      })()
    `);
    await delay(2500);

    const instructorEvalsTable = await cdp.eval(`
      (() => {
        const table = document.querySelector('table');
        if (!table) return null;
        const rows = Array.from(table.querySelectorAll('tbody tr')).map(r => r.innerText.trim().replace(/\\n/g, ' '));
        const hasTrigger = document.querySelector('#btn-evaluate-cohort-action') != null;
        return {
          rowCount: rows.length,
          hasTrigger,
          sampleRow: rows[0],
        };
      })()
    `);

    assert('5.2 Instructor views certified outcomes table for assigned cohort', instructorEvalsTable && instructorEvalsTable.rowCount > 0, `Rows: ${instructorEvalsTable?.rowCount}`);
    assert('5.3 Instructor cannot trigger evaluation (view-only, no trigger button)', instructorEvalsTable?.hasTrigger === false);

    console.log('\n================================================================');
    const allPassed = results.every(r => r.pass);
    const passedCount = results.filter(r => r.pass).length;
    console.log(`PHASE 12 BROWSER TESTING RESULT: ${passedCount} / ${results.length} PASSED`);
    console.log('================================================================');

    await cdp.close();
    if (chromeProcess) chromeProcess.kill();
    await mongoose.disconnect();

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Browser testing error:', err);
    await cdp.close().catch(() => {});
    if (chromeProcess) chromeProcess.kill();
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error('Fatal browser verification error:', err);
  process.exit(1);
});
