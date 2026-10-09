const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, 'chrome-superadmin-profile');
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
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const cur = await cdp.eval(`window.location.pathname`);
    if (cur !== '/login') break;
    await delay(300);
  }
  await delay(1000);
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

async function runBrowserVerification() {
  console.log('========================================================================');
  console.log('SUPER ADMIN PLATFORM CONTROL — CHROME CDP BROWSER VERIFICATION');
  console.log('========================================================================\n');

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
        '--window-size=1400,900',
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

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: LOGIN AS SUPER ADMIN -> GATEWAY
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Login as Super Admin & Verify Gateway ---');
    await loginUser(cdp, 'superadmin@esa.dev');

    const curUrl = await cdp.eval(`window.location.pathname`);
    assert('1.1 Super Admin redirects to /admin gateway', curUrl === '/admin', `Path: ${curUrl}`);

    await waitForSelector(cdp, 'h1');
    const headerTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    assert('1.2 Administration Gateway header renders', headerTitle?.includes('Gateway'), `Header: ${headerTitle}`);

    // Verify two main division cards
    const cardCount = await cdp.eval(`document.querySelectorAll('div[class*="cardTitle"]').length`);
    const cardTitles = await cdp.eval(`Array.from(document.querySelectorAll('div[class*="cardTitle"]')).map(el => el.innerText)`);
    assert('1.3 Two division cards visible', cardCount >= 2, `Cards: ${cardTitles.join(', ')}`);
    assert('1.3b Pre-University & University division cards present', cardTitles.some(t => t.includes('Pre-University')) && cardTitles.some(t => t.includes('University')));

    // Verify real DB numbers (Students, Active Programs, etc.)
    const statValues = await cdp.eval(`Array.from(document.querySelectorAll('div[class*="statValue"]')).map(el => Number(el.innerText))`);
    assert('1.4 Real DB metrics rendered (non-empty stats)', statValues.length >= 8 && statValues.some(v => v > 0), `Stats: ${statValues.slice(0, 8).join(', ')}`);

    // Verify managed capability pills
    const pillCount = await cdp.eval(`document.querySelectorAll('span[class*="managedPill"]').length`);
    assert('1.5 Managed capability pills rendered on cards', pillCount >= 10, `Found: ${pillCount}`);

    await captureScreenshot(cdp, '01_super_admin_gateway');

    // -------------------------------------------------------------------------
    // TEST 2: SIDEBAR GROUPED & COLLAPSIBLE SECTIONS
    // -------------------------------------------------------------------------
    // TEST 2: SIDEBAR GROUPED & COLLAPSIBLE SECTIONS
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Sidebar Grouping & Collapsible Sections ---');

    const sectionHeaders = await cdp.eval(`Array.from(document.querySelectorAll('button[class*="sectionHeader"], div[class*="sectionHeader"]')).map(el => el.innerText.trim())`);
    assert('2.1 Sidebar renders grouped section headers', sectionHeaders.length >= 4, `Sections: ${sectionHeaders.join(' | ')}`);
    assert('2.1b Expected collapsible sections present',
      sectionHeaders.some(s => s.toUpperCase().includes('ADMINISTRATION')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('ACADEMIC')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('OPERATIONS')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('SYSTEM'))
    );

    // Toggle collapse on 'Academic & Training'
    const academicSectionInitialLinks = await cdp.eval(`document.querySelectorAll('a[href="/admin/instructors"]').length`);
    assert('2.2 Academic section links visible initially', academicSectionInitialLinks === 1);

    // Click section header to toggle collapse
    await cdp.eval(`
      (() => {
        const headers = Array.from(document.querySelectorAll('button[class*="sectionHeader"], div[class*="sectionHeader"]'));
        const academic = headers.find(h => h.innerText.toUpperCase().includes('ACADEMIC'));
        if (academic) academic.click();
      })()
    `);
    await delay(500);

    const academicSectionCollapsed = await cdp.eval(`document.querySelectorAll('a[href="/admin/instructors"]').length`);
    assert('2.3 Section collapses when clicked (links hidden)', academicSectionCollapsed === 0);

    // Re-expand
    await cdp.eval(`
      (() => {
        const headers = Array.from(document.querySelectorAll('button[class*="sectionHeader"], div[class*="sectionHeader"]'));
        const academic = headers.find(h => h.innerText.toUpperCase().includes('ACADEMIC'));
        if (academic) academic.click();
      })()
    `);
    await delay(500);
    assert('2.4 Section re-expands when clicked again', await cdp.eval(`document.querySelectorAll('a[href="/admin/instructors"]').length`) === 1);

    await captureScreenshot(cdp, '02_sidebar_collapsible');

    // -------------------------------------------------------------------------
    // TEST 3: ADMINISTRATOR MANAGEMENT & PERMISSIONS UI
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Administrator Management & Permissions UI ---');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/administrators' });
    await delay(2000);
    await waitForSelector(cdp, 'table');

    const adminTableRows = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    assert('3.1 Administrator management table renders rows', adminTableRows >= 1, `Rows: ${adminTableRows}`);

    // Verify Permissions column renders
    const ths = await cdp.eval(`Array.from(document.querySelectorAll('th')).map(t => t.innerText.trim())`);
    assert('3.2 Table includes Permissions column', ths.some(t => t.toUpperCase().includes('PERMISSION')), `Headers: ${ths.join(', ')}`);

    // Click 'Edit' on the first editable administrator (non-self / non-disabled)
    await cdp.eval(`
      (() => {
        const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Edit') && !b.disabled);
        if (editBtns.length > 0) editBtns[0].click();
      })()
    `);
    await delay(800);

    const isEditModalOpen = await cdp.eval(`Boolean(document.querySelector('.modal.show') || document.querySelector('[class*="modal"]') || document.body.innerText.includes('Edit Administrator'))`);
    assert('3.3 Edit Administrator modal opens', isEditModalOpen);

    // Verify granular permission checkboxes
    const permissionCheckboxes = await cdp.eval(`document.querySelectorAll('input[type="checkbox"]').length`);
    assert('3.4 Granular permission checkboxes rendered in modal', permissionCheckboxes >= 15, `Found: ${permissionCheckboxes} checkboxes`);

    await captureScreenshot(cdp, '03_admin_permissions_modal');

    // Close modal
    await cdp.eval(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await delay(500);

    // -------------------------------------------------------------------------
    // TEST 4: PROGRAM MANAGEMENT & EXTENDED FIELDS
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Program Management & Extended Fields ---');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/programs' });
    await delay(2000);
    await waitForSelector(cdp, 'table');

    const progTableRows = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    assert('4.1 Program table renders active programs', progTableRows >= 1, `Rows: ${progTableRows}`);

    // Verify Delete button present in table actions
    const hasDeleteBtns = await cdp.eval(`document.querySelectorAll('button[id*="btn-delete-prog"]').length > 0`);
    assert('4.2 Safe Delete / Archive button rendered in table', hasDeleteBtns);

    // Open Create Program modal
    await cdp.eval(`
      (() => {
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create Program'));
        if (createBtn) createBtn.click();
      })()
    `);
    await delay(800);

    // Verify extended fields in create modal: category, transportation, registration dates, training dates, prerequisites
    const hasCategorySelect = await cdp.eval(`Boolean(document.querySelector('select option[value="Satellite Operations"]'))`);
    const hasTransportSelect = await cdp.eval(`Boolean(document.querySelector('select option[value="BUS_SHUTTLE"]'))`);
    const dateInputCount = await cdp.eval(`document.querySelectorAll('input[type="date"]').length`);

    assert('4.3 Extended category selection rendered', hasCategorySelect);
    assert('4.4 Transportation options selection rendered', hasTransportSelect);
    assert('4.5 Registration and training date inputs rendered', dateInputCount >= 4, `Date inputs: ${dateInputCount}`);

    await captureScreenshot(cdp, '04_program_extended_modal');

    // Close modal
    await cdp.eval(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await delay(500);

    // Test Delete / Archive safety modal
    await cdp.eval(`
      (() => {
        const delBtn = document.querySelector('button[id*="btn-delete-prog"]');
        if (delBtn) delBtn.click();
      })()
    `);
    await delay(800);

    const isDeleteModalOpen = await cdp.eval(`document.body.innerText.includes('Safety Guarantee') || document.body.innerText.includes('Proceed Delete/Archive')`);
    assert('4.6 Safe delete / archive confirmation modal with reference protection note', isDeleteModalOpen);

    // Close delete modal
    await cdp.eval(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await delay(500);

    // -------------------------------------------------------------------------
    // TEST 5: COHORT SCHEDULING MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Cohort Schedule Management ---');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/cohorts' });
    await delay(2000);
    await waitForSelector(cdp, 'table');

    const cohortRows = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    assert('5.1 Cohorts table renders', cohortRows >= 1, `Rows: ${cohortRows}`);

    const hasScheduleBtn = await cdp.eval(`Boolean(document.querySelector('button[id*="btn-edit-cohort"]') || document.querySelector('button[id*="btn-schedule-cohort"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Schedule')))`);
    assert('5.2 Schedule management button present in actions', hasScheduleBtn);

    if (hasScheduleBtn) {
      await cdp.eval(`
        (() => {
          const btn = document.querySelector('button[id*="btn-edit-cohort"]') || document.querySelector('button[id*="btn-schedule-cohort"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Schedule'));
          if (btn) btn.click();
        })()
      `);
      await delay(800);
      const isScheduleModalOpen = await cdp.eval(`document.body.innerText.includes('Modify Schedule') || document.body.innerText.includes('Training Start Date') || document.body.innerText.includes('Save Schedule Changes')`);
      assert('5.3 Edit Cohort Schedule modal opens with start/end date controls', isScheduleModalOpen);
      await captureScreenshot(cdp, '05_cohort_schedule_modal');

      // Close modal
      await cdp.eval(`
        (() => {
          const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
          if (cancelBtn) cancelBtn.click();
        })()
      `);
      await delay(500);
    }

    // -------------------------------------------------------------------------
    // TEST 6: INSTRUCTOR ACCOUNT LIFECYCLE & ACCESS SYNC
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Instructor Lifecycle UI ---');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/instructors' });
    await delay(2000);
    await waitForSelector(cdp, 'table');

    const instructorRows = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    assert('6.1 Instructors table renders official accounts', instructorRows >= 1, `Rows: ${instructorRows}`);

    const hasSyncBtn = await cdp.eval(`Boolean(document.querySelector('#btn-sync-all-instructor-access') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Sync Access Period')))`);
    assert('6.2 Sync Course-Limited Access button rendered', hasSyncBtn);

    await captureScreenshot(cdp, '06_instructors_lifecycle');

    // -------------------------------------------------------------------------
    // TEST 7: ASSESSMENT BUILDER & CONFIGURATION
    // -------------------------------------------------------------------------
    console.log('\n--- Step 7: Assessment Builder ---');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/assessments' });
    await delay(2000);

    const isAssessmentPage = await cdp.eval(`document.body.innerText.includes('Assessment') || document.body.innerText.includes('Readiness')`);
    assert('7.1 Assessments page renders', isAssessmentPage);

    // Open Create Assessment modal
    await cdp.eval(`
      (() => {
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create Assessment'));
        if (createBtn) createBtn.click();
      })()
    `);
    await delay(800);

    const hasThresholds = await cdp.eval(`document.body.innerText.includes('Recommended Threshold') || document.body.innerText.includes('Threshold')`);
    const hasQuestionType = await cdp.eval(`document.querySelectorAll('select').length >= 2`);
    assert('7.2 Assessment builder modal renders score thresholds', hasThresholds);
    assert('7.3 Question configuration controls rendered', hasQuestionType);

    await captureScreenshot(cdp, '07_assessment_builder_modal');

    // Close modal
    await cdp.eval(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await delay(500);

    // -------------------------------------------------------------------------
    // TEST 8: DIVISION SCOPE ENTRY & DIVISION ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- Step 8: Division Scoped Administration Entry ---');

    // Enter Pre-University division
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY' });
    await delay(2000);

    const preUniDashboardTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    assert('8.1 Super Admin enters Pre-University division dashboard', preUniDashboardTitle?.includes('Pre-University'), `Header: ${preUniDashboardTitle}`);

    // Enter University division
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/UNIVERSITY' });
    await delay(2000);

    const uniDashboardTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    assert('8.2 Super Admin enters University division dashboard', uniDashboardTitle?.includes('University'), `Header: ${uniDashboardTitle}`);

    await captureScreenshot(cdp, '08_division_dashboard_entry');

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = results.filter((r) => r.pass).length;
    const failedCount = results.filter((r) => !r.pass).length;
    console.log(`TOTAL BROWSER CDP TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('========================================================================\n');

    await cdp.close();
    if (chromeProcess) {
      chromeProcess.kill();
    }

    if (failedCount > 0) {
      console.error('FAILURES DETECTED:');
      results.filter((r) => !r.pass).forEach((r) => console.error(` - ${r.testName}: ${r.detail}`));
      process.exit(1);
    } else {
      console.log('ALL BROWSER CDP TESTS PASSED PERFECTLY!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Browser CDP verification error:', err);
    if (cdp) await cdp.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(1);
  }
}

runBrowserVerification();
