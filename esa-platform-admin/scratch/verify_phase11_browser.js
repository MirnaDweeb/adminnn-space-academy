const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\mirna\\.gemini\\antigravity-ide\\brain\\af3c9371-b223-41cb-8b51-2a2d7b93b40b\\scratch\\chrome-phase11-profile';
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
  console.log('PHASE 11: TRAINING DELIVERY, ATTENDANCE & GRADING CDP BROWSER TESTS');
  console.log('===============================================================\n');

  // Seed DB
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = require('../backend/src/models/Course');
  const Application = require('../backend/src/models/Application');
  const Enrollment = require('../backend/src/models/Enrollment');
  const User = require('../backend/src/models/User');
  const Cohort = require('../backend/src/models/Cohort');

  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const instructor = await User.findOne({ email: 'instructor@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  // Clean old fixtures
  await Course.deleteMany({ title: /^Browser CDP Cohort Program/ });
  await Cohort.deleteMany({ name: /^Browser CDP/ });

  const now = new Date();

  // Create course and confirmed enrollment
  const course = await Course.create({
    title: `Browser CDP Cohort Program ${Date.now()}`,
    description: 'Testing end-to-end browser cohort schedule, attendance, and grading',
    division: 'PRE_UNIVERSITY',
    level: 'INTERMEDIATE',
    price: 4800,
    currency: 'EGP',
    capacity: 10,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
  });

  const app = await Application.create({
    student: student._id,
    program: course._id,
    division: 'PRE_UNIVERSITY',
    status: 'CONFIRMED',
    decision: 'ACCEPT',
    submittedAt: now,
  });

  const enrollment = await Enrollment.create({
    student: student._id,
    program: course._id,
    application: app._id,
    division: 'PRE_UNIVERSITY',
    status: 'CONFIRMED',
    enrolledAt: now,
    confirmedAt: now,
    createdBy: preUniAdmin._id,
  });

  await mongoose.disconnect();
  console.log(`[SEED] Created Course: "${course.title}" (ID: ${course._id})`);
  console.log(`[SEED] Confirmed Enrollment for ${student.fullName} (${student.email})\n`);

  // Launch or connect Chrome
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
    // PART A: DIVISION ADMIN CREATES COHORT
    // =========================================================================
    console.log('\n--- PART A: DIVISION ADMIN SCHEDULES COHORT ---');

    // 1. Admin Login
    console.log('Step 1: Logging in as Pre-University Admin...');
    await loginUser(cdp, 'preuni.admin@esa.dev', 'Password123!');
    const adminUrl = await cdp.eval('window.location.href');
    assert('Test 1: Admin authenticated', adminUrl.includes('/admin'), `URL: ${adminUrl}`);

    // 2. Navigate to Cohorts Page
    console.log('Step 2: Navigating to Cohorts Page (/admin/PRE_UNIVERSITY/cohorts)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/cohorts' });
    await delay(3000);

    const cohortsPageRendered = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return (text.includes('Cohorts & Delivery') || text.includes('Cohort Management')) && text.includes('Create Cohort');
      })()
    `);
    assert('Test 2: Admin Cohorts Page rendered', cohortsPageRendered, 'Header, KPI cards and Create button displayed');

    // 3. Open Create Cohort Modal
    console.log('Step 3: Opening Create Cohort Modal...');
    await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-create-cohort');
        if (btn) btn.click();
      })()
    `);
    await delay(2000);

    const modalOpened = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Schedule New Training Cohort') && !!document.getElementById('cohort-program-select');
      })()
    `);
    assert('Test 3: Create Cohort modal opened', modalOpened, 'Form controls and session builder rendered');

    // 4. Fill form & Submit
    console.log('Step 4: Filling Cohort creation form...');
    const cohortName = `Browser CDP Flight Batch ${Date.now().toString().slice(-4)}`;
    const createResult = await cdp.eval(`
      (() => {
        const progSelect = document.getElementById('cohort-program-select');
        const insSelect = document.getElementById('cohort-instructor-select');
        const nameInput = document.getElementById('cohort-name-input');
        const selectValSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;

        if (progSelect) {
          selectValSetter.call(progSelect, '${course._id}');
          progSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (insSelect) {
          selectValSetter.call(insSelect, '${instructor._id}');
          insSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (nameInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(nameInput, '${cohortName}');
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const confirmBtn = document.getElementById('btn-confirm-create-cohort');
        if (confirmBtn) confirmBtn.click();
        return {
          progVal: progSelect ? progSelect.value : null,
          insVal: insSelect ? insSelect.value : null,
          progOptions: progSelect ? Array.from(progSelect.options).map(o => o.value) : [],
          insOptions: insSelect ? Array.from(insSelect.options).map(o => o.value) : []
        };
      })()
    `);
    console.log('Form fill debug result:', createResult);
    await delay(3500);

    const cohortCreatedInList = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('${cohortName}') || text.includes('created successfully');
      })()
    `);
    assert('Test 4: Cohort created & scheduled successfully', cohortCreatedInList, `Cohort "${cohortName}" present in table`);

    // =========================================================================
    // PART B: INSTRUCTOR ATTENDANCE & GRADING
    // =========================================================================
    console.log('\n--- PART B: INSTRUCTOR ATTENDANCE & GRADING ---');

    // 5. Instructor Login
    console.log('Step 5: Logging in as Instructor (instructor@esa.dev)...');
    await loginUser(cdp, 'instructor@esa.dev', 'Password123!');
    const instructorUrl = await cdp.eval('window.location.href');
    assert('Test 5: Instructor authenticated', instructorUrl.includes('/dashboard') || instructorUrl.includes('/instructor'), `URL: ${instructorUrl}`);

    // 6. Navigate to Instructor Cohorts
    console.log('Step 6: Navigating to Instructor Cohorts (/instructor/cohorts)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/instructor/cohorts' });
    await delay(3000);

    const instructorWorkspaceRendered = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Instructor Training Delivery Portal') && text.includes('${cohortName}');
      })()
    `);
    assert('Test 6: Instructor sees assigned cohort in portal', instructorWorkspaceRendered, `Found cohort: ${cohortName}`);

    // 7. Mark Attendance for Session 1
    console.log('Step 7: Marking Session 1 Attendance (Mark All Present)...');
    await cdp.eval(`
      (() => {
        const markAllBtn = document.getElementById('btn-mark-all-present');
        if (markAllBtn) markAllBtn.click();
        const saveBtn = document.getElementById('btn-save-session-attendance');
        if (saveBtn) saveBtn.click();
      })()
    `);
    await delay(3000);

    const attendanceSaved = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Session attendance recorded') || text.includes('recorded and verified');
      })()
    `);
    assert('Test 7: Instructor recorded session attendance', attendanceSaved, 'All confirmed students marked PRESENT');

    // 8. Create Deliverable & Grade Student
    console.log('Step 8: Switching to Grading tab and creating deliverable...');
    await cdp.eval(`
      (() => {
        const tab = document.getElementById('instructor-tab-grading');
        if (tab) tab.click();
      })()
    `);
    await delay(1500);

    // Open add assignment form
    await cdp.eval(`
      (() => {
        const addBtn = document.getElementById('btn-instructor-add-assignment');
        if (addBtn) addBtn.click();
      })()
    `);
    await delay(1000);

    // Fill new deliverable form
    const assignTitle = `Orbital Simulation Lab ${Date.now().toString().slice(-4)}`;
    await cdp.eval(`
      (() => {
        const titleInput = document.getElementById('new-assignment-title');
        const dateInput = document.getElementById('new-assignment-date');
        const maxInput = document.getElementById('new-assignment-maxscore');

        if (titleInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(titleInput, '${assignTitle}');
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (dateInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(dateInput, '2026-10-15');
          dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (maxInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(maxInput, '100');
          maxInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const confirmBtn = document.getElementById('btn-confirm-create-assignment');
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await delay(3000);

    const assignCreated = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('${assignTitle}') || text.includes('created successfully');
      })()
    `);
    assert('Test 8: Instructor created deliverable', assignCreated, `Assignment "${assignTitle}" created`);

    // 9. Enter Grade & Feedback
    console.log('Step 9: Recording student grade and feedback...');
    await cdp.eval(`
      (() => {
        const scoreInput = document.querySelector('input[id^="grade-score-"]');
        const feedbackInput = document.querySelector('input[id^="grade-feedback-"]');

        if (scoreInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(scoreInput, '96');
          scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (feedbackInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeSetter.call(feedbackInput, 'Flawless flight dynamics computation!');
          feedbackInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const saveBtn = document.getElementById('btn-save-assignment-grades');
        if (saveBtn) saveBtn.click();
      })()
    `);
    await delay(3000);

    const gradeSaved = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return text.includes('grades and feedback recorded') || text.includes('recorded successfully');
      })()
    `);
    assert('Test 9: Instructor recorded student grade (96/100)', gradeSaved, 'Grade 96 and feedback saved to assessment ledger');

    // =========================================================================
    // PART C: STUDENT READ-ONLY RECORDS
    // =========================================================================
    console.log('\n--- PART C: STUDENT READ-ONLY ACADEMIC RECORDS ---');

    // 10. Student Login
    console.log('Step 10: Logging in as Student (student@esa.dev)...');
    await loginUser(cdp, 'student@esa.dev', 'Password123!');
    const sUrl = await cdp.eval('window.location.href');
    assert('Test 10: Student authenticated', sUrl.includes('/dashboard'), `URL: ${sUrl}`);

    // 11. Navigate to Student Cohorts Page
    console.log('Step 11: Navigating to Student Classes (/student/cohorts)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/student/cohorts' });
    await delay(3000);

    const studentRecordsRendered = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        const hasCohort = text.includes('${cohortName}');
        const hasPresent = text.toLowerCase().includes('present');
        const hasScore = text.includes('96') && text.includes('100');
        const hasFeedback = text.includes('Flawless flight dynamics computation!');
        return hasCohort && hasPresent && hasScore && hasFeedback;
      })()
    `);
    assert(
      'Test 11: Student views verified attendance & grade records (read-only)',
      studentRecordsRendered,
      'Attendance (Present), Score (96/100), and Feedback accurately displayed'
    );

    // 12. Student Read-Only Invariant: No write/marking controls rendered
    const noWriteControls = await cdp.eval(`
      (() => {
        const markBtn = document.getElementById('btn-save-session-attendance');
        const gradeBtn = document.getElementById('btn-save-assignment-grades');
        const addAssignBtn = document.getElementById('btn-instructor-add-assignment');
        return !markBtn && !gradeBtn && !addAssignBtn;
      })()
    `);
    assert('Test 12: Student UI is strictly read-only', noWriteControls, 'Zero administrative or grading controls rendered in student DOM');

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
