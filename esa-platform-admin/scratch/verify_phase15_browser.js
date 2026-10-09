const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const mongoose = require('../backend/node_modules/mongoose');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, 'chrome-phase15-profile');
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
  await delay(1000);
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
  console.log('PHASE 15 BROWSER TESTING SUITE (REAL DOM / CDP EXECUTION)');
  console.log('================================================================\n');

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
  console.log('[CDP] Connected to Chrome Page target.\n');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Listen for console errors
  const consoleErrors = [];
  cdp.ws.addEventListener('message', (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
        const text = data.params.args.map((a) => a.value || a.description || '').join(' ');
        if (!text.includes('Failed to load resource: the server responded with a status of 403') &&
            !text.includes('Failed to load resource: the server responded with a status of 401')) {
          consoleErrors.push(text);
        }
      }
    } catch (_) {}
  });

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // -------------------------------------------------------------
    // 1. SUPER ADMIN LOGIN & REPORTS PAGE LOAD
    // -------------------------------------------------------------
    console.log('--- 1. Super Admin: Reports Page Loading & Overview ---');
    await loginUser(cdp, 'superadmin@esa.dev');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/reports' });
    await delay(2000);
    await waitForSelector(cdp, 'h1');

    const pageHeading = await cdp.eval(`document.querySelector('h1')?.innerText`);
    assert('1.1 Reports page loads with correct title', pageHeading?.includes('Reports & Analytics'), `Heading: "${pageHeading}"`);

    // Verify all 7 tabs are present in DOM
    const tabCount = await cdp.eval(`document.querySelectorAll('button[role="tab"]').length`);
    assert('1.2 All 7 report tabs rendered', tabCount === 7, `Tabs rendered: ${tabCount}`);

    // Verify Overview KPI stat cards rendered
    const statCardsText = await cdp.eval(`
      Array.from(document.querySelectorAll('.esa-container div'))
        .map(el => el.innerText)
        .filter(t => t.includes('Total Students') || t.includes('Total Revenue'))
        .join(' | ')
    `);
    const hasTotalStudents = await cdp.eval(`document.body.innerText.includes('Total Students')`);
    const hasTotalRevenue = await cdp.eval(`document.body.innerText.includes('Total Revenue')`);
    const hasTotalEnrollments = await cdp.eval(`document.body.innerText.includes('Enrollments')`);

    assert(
      '1.3 Overview KPI stat cards displayed with real metrics',
      hasTotalStudents && hasTotalRevenue && hasTotalEnrollments,
      `Cards detected: Students=${hasTotalStudents}, Revenue=${hasTotalRevenue}, Enrollments=${hasTotalEnrollments}`
    );

    // -------------------------------------------------------------
    // 2. APPLICATIONS & ADMISSIONS REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 2. Applications & Admissions Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const appTab = tabs.find(t => t.innerText.includes('Applications'));
        if (appTab) appTab.click();
      })()
    `);
    await delay(1800);

    const hasAcceptanceRate = await cdp.eval(`document.body.innerText.includes('Acceptance Rate')`);
    const hasTurnaround = await cdp.eval(`document.body.innerText.includes('Turnaround')`);
    const hasDonut = await cdp.eval(`Boolean(document.querySelector('svg circle'))`);
    const hasAppTable = await cdp.eval(`Boolean(document.querySelector('table'))`);

    assert('2.1 Applications tab displays Acceptance Rate and Turnaround', hasAcceptanceRate && hasTurnaround);
    assert('2.2 SVG Donut Chart rendered in DOM', hasDonut);
    assert('2.3 Applications Breakdown Table rendered in DOM', hasAppTable);

    // -------------------------------------------------------------
    // 3. ENROLLMENT & CAPACITY REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 3. Enrollment & Capacity Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const enrTab = tabs.find(t => t.innerText.includes('Enrollment'));
        if (enrTab) enrTab.click();
      })()
    `);
    await delay(1800);

    const hasOccupied = await cdp.eval(`document.body.innerText.includes('Occupied Capacity')`);
    const hasWaitlistPromotions = await cdp.eval(`document.body.innerText.includes('Waitlist Promotions')`);
    const hasUtilization = await cdp.eval(`document.body.innerText.includes('Capacity Utilization')`);
    const hasProgressBar = await cdp.eval(`Boolean(document.querySelector('[class*="progressBar"]'))`);

    assert('3.1 Enrollment tab displays Occupied Capacity and Waitlist Promotions', hasOccupied && hasWaitlistPromotions && hasUtilization);
    assert('3.2 Program capacity progress bars rendered in DOM', hasProgressBar);

    // -------------------------------------------------------------
    // 4. FINANCE REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 4. Finance & Invoices Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const finTab = tabs.find(t => t.innerText.includes('Finance'));
        if (finTab) finTab.click();
      })()
    `);
    await delay(1800);

    const hasInvoiced = await cdp.eval(`document.body.innerText.includes('Total Invoiced')`);
    const hasPaidRevenue = await cdp.eval(`document.body.innerText.includes('Paid Revenue')`);
    const hasCollectionRate = await cdp.eval(`document.body.innerText.includes('Collection Rate')`);
    const hasPaymentMethods = await cdp.eval(`document.body.innerText.includes('Payment Methods')`);

    assert('4.1 Finance tab displays Invoiced, Paid Revenue, and Collection Rate', hasInvoiced && hasPaidRevenue && hasCollectionRate);
    assert('4.2 Payment methods breakdown section rendered', hasPaymentMethods);

    // -------------------------------------------------------------
    // 5. TRAINING & EVALUATION REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 5. Training & Evaluation Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const evalTab = tabs.find(t => t.innerText.includes('Evaluation'));
        if (evalTab) evalTab.click();
      })()
    `);
    await delay(1800);

    const hasPassRate = await cdp.eval(`document.body.innerText.includes('Passing Students')`);
    const hasAvgScore = await cdp.eval(`document.body.innerText.includes('Average Score')`);
    const hasAvgAttendance = await cdp.eval(`document.body.innerText.includes('Avg Attendance')`);

    assert('5.1 Evaluation tab displays Passing Students, Avg Score, and Attendance', hasPassRate && hasAvgScore && hasAvgAttendance);

    // -------------------------------------------------------------
    // 6. CERTIFICATES REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 6. Certificates Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const certTab = tabs.find(t => t.innerText.includes('Certificates'));
        if (certTab) certTab.click();
      })()
    `);
    await delay(1800);

    const hasCertCount = await cdp.eval(`document.body.innerText.includes('Total Certificates')`);
    const hasActiveCerts = await cdp.eval(`document.body.innerText.includes('Active (Valid)')`);
    const hasRevokedCerts = await cdp.eval(`document.body.innerText.includes('Revoked Credentials')`);

    assert('6.1 Certificates tab displays Active and Revoked counts', hasCertCount && hasActiveCerts && hasRevokedCerts);

    // -------------------------------------------------------------
    // 7. NOTIFICATIONS REPORT TAB
    // -------------------------------------------------------------
    console.log('\n--- 7. Notifications Report Tab ---');
    await cdp.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
        const notifTab = tabs.find(t => t.innerText.includes('Notifications'));
        if (notifTab) notifTab.click();
      })()
    `);
    await delay(1800);

    const hasNotifTotal = await cdp.eval(`document.body.innerText.includes('Total Generated')`);
    const hasReadRate = await cdp.eval(`document.body.innerText.includes('Read Count')`);
    const hasEmailFailures = await cdp.eval(`document.body.innerText.includes('Email Failures')`);

    assert('7.1 Notifications tab displays Total, Read Rate, and Email Failures', hasNotifTotal && hasReadRate && hasEmailFailures);

    // -------------------------------------------------------------
    // 8. CSV EXPORT BUTTON INTERACTION
    // -------------------------------------------------------------
    console.log('\n--- 8. CSV Export Button ---');
    const exportBtnExists = await cdp.eval(`Boolean(document.querySelector('button i.fa-file-csv'))`);
    assert('8.1 Export CSV button present in header', exportBtnExists);

    // Click Export CSV button
    await cdp.eval(`
      (() => {
        const btn = document.querySelector('button i.fa-file-csv')?.closest('button');
        if (btn) btn.click();
      })()
    `);
    await delay(2000);

    const hasExportNotice = await cdp.eval(`Boolean(document.querySelector('[class*="exportSuccessAlert"]'))`);
    assert('8.2 Export CSV button triggers download and shows success notice', hasExportNotice);

    // -------------------------------------------------------------
    // 9. DIVISION SCOPING IN FRONTEND
    // -------------------------------------------------------------
    console.log('\n--- 9. Division Scoping in Frontend ---');
    // 9.1 Super Admin switches division filter
    await cdp.eval(`
      (() => {
        const sel = Array.from(document.querySelectorAll('select')).find(s => s.innerHTML.includes('Pre-University'));
        if (sel) {
          sel.value = 'PRE_UNIVERSITY';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(1800);
    const superFilteredText = await cdp.eval(`document.body.innerText`);
    assert('9.1 Super Admin division dropdown updates data view to Pre-University', superFilteredText.includes('Pre-University'));

    // 9.2 Pre-University Admin login and scoping
    await loginUser(cdp, 'preuni.admin@esa.dev');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/reports' });
    await delay(2000);

    const preUniBadge = await cdp.eval(`document.body.innerText.includes('Pre-University Administration')`);
    const hasSuperDivSelect = await cdp.eval(`Boolean(document.querySelector('select option[value="all"]'))`);
    assert('9.2 Pre-University Admin scoped to their division with fixed badge', preUniBadge && !hasSuperDivSelect);

    // 9.3 Cross-division navigation blocked for division admin
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/UNIVERSITY/reports' });
    await delay(1500);

    const currentUrl = await cdp.eval(`window.location.pathname`);
    assert('9.3 Division admin blocked by DivisionGuard when accessing other division URL', currentUrl.includes('/unauthorized'), `Navigated to: ${currentUrl}`);

    // 9.4 Student role blocked from Reports area
    await loginUser(cdp, 'student@esa.dev');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/reports' });
    await delay(1500);

    const studentUrl = await cdp.eval(`window.location.pathname`);
    assert('9.4 Student blocked by RoleGuard from accessing admin reports', studentUrl.includes('/unauthorized'), `Navigated to: ${studentUrl}`);

    // -------------------------------------------------------------
    // 10. CONSOLE ERRORS CHECK
    // -------------------------------------------------------------
    console.log('\n--- 10. Console Error Verification ---');
    assert('10.1 Zero unexpected frontend runtime console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  } catch (err) {
    console.error('Browser Test Error:', err);
    assert('Execution without fatal exceptions', false, err.message);
  } finally {
    await cdp.close();
    if (chromeProcess) {
      chromeProcess.kill();
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nBrowser Verification Finished: ${passed}/${results.length} PASSED, ${failed} FAILED.`);
  process.exit(failed > 0 ? 1 : 0);
}

runBrowserVerification().catch((e) => {
  console.error('Fatal Browser Runner Error:', e);
  process.exit(1);
});
