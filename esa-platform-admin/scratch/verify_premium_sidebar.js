const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, 'chrome-sidebar-profile');
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
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const cur = await cdp.eval(`window.location.pathname`);
    if (cur !== '/login') break;
    await delay(250);
  }
  await delay(1200);
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

async function runSidebarVerification() {
  console.log('========================================================================');
  console.log('SUPER ADMIN SIDEBAR — PREMIUM UX, ANIMATION & CONTEXT VERIFICATION');
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

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: SUPER ADMIN LOGIN & SIDEBAR HIERARCHY
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Super Admin Login & Hierarchy ---');
    await loginUser(cdp, 'superadmin@esa.dev');

    const curUrl = await cdp.eval(`window.location.pathname`);
    assert('1.1 Super Admin lands on /admin gateway', curUrl === '/admin', `Path: ${curUrl}`);

    // Verify top label
    const sidebarLabel = await cdp.eval(`document.querySelector('div[class*="sectionLabel"]')?.innerText.trim()`);
    assert('1.2 Sidebar label displays SUPER ADMIN', sidebarLabel?.includes('SUPER ADMIN'), `Label: ${sidebarLabel}`);

    // Verify 4 target collapsible sections
    const sectionHeaders = await cdp.eval(`Array.from(document.querySelectorAll('button[class*="sectionHeader"], div[class*="sectionHeader"]')).map(el => el.innerText.trim())`);
    assert('1.3 Grouped sections render', sectionHeaders.length >= 4, `Sections: ${sectionHeaders.join(' | ')}`);
    assert('1.3b Clean hierarchy: GLOBAL, ADMINISTRATION, ACADEMY DIVISION, SYSTEM present',
      sectionHeaders.some(s => s.toUpperCase().includes('GLOBAL')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('ADMINISTRATION')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('ACADEMY DIVISION')) &&
      sectionHeaders.some(s => s.toUpperCase().includes('SYSTEM'))
    );

    await captureScreenshot(cdp, 'sidebar_01_super_admin_initial');

    // -------------------------------------------------------------------------
    // TEST 2: ACTIVE DIVISION SWITCHER WIDGET
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Premium Division Switcher Widget ---');

    const hasSwitcher = await cdp.eval(`Boolean(document.querySelector('#btn-division-switcher'))`);
    assert('2.1 Division switcher button rendered under ACADEMY DIVISION', hasSwitcher);

    const switcherText = await cdp.eval(`document.querySelector('#btn-division-switcher')?.innerText`);
    assert('2.2 Switcher displays active PRE-UNIVERSITY workspace',
      switcherText?.includes('PRE-UNIVERSITY') && switcherText?.includes('Current workspace'),
      `Switcher: ${switcherText?.replace(/\n/g, ' ')}`
    );

    // Verify division links point to active division (PRE_UNIVERSITY)
    const activeDivisionLinks = await cdp.eval(`
      Array.from(document.querySelectorAll('a[href*="/admin/PRE_UNIVERSITY"]')).map(a => a.innerText.trim())
    `);
    assert('2.3 Only active PRE-UNIVERSITY division links are rendered', activeDivisionLinks.length >= 8, `Found ${activeDivisionLinks.length} links`);

    // Verify no competing UNIVERSITY links rendered simultaneously
    const uniLinksCount = await cdp.eval(`document.querySelectorAll('a[href*="/admin/UNIVERSITY"]').length`);
    assert('2.4 No competing UNIVERSITY navigation tree shown simultaneously', uniLinksCount === 0);

    // -------------------------------------------------------------------------
    // TEST 3: SWITCHER DROPDOWN & TRANSITION TO UNIVERSITY
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Switcher Dropdown & Transition to University ---');

    // Open switcher dropdown
    await cdp.eval(`document.querySelector('#btn-division-switcher').click()`);
    await delay(300);

    const isDropdownOpen = await cdp.eval(`Boolean(document.querySelector('[class*="switcherDropdown"]'))`);
    assert('3.1 Switcher dropdown opens smoothly', isDropdownOpen);

    const hasBothOptions = await cdp.eval(`
      Boolean(document.querySelector('#btn-select-division-pre-uni') && document.querySelector('#btn-select-division-uni'))
    `);
    assert('3.2 Both PRE-UNIVERSITY and UNIVERSITY options present in dropdown', hasBothOptions);

    await captureScreenshot(cdp, 'sidebar_02_switcher_dropdown_open');

    // Click UNIVERSITY option
    await cdp.eval(`document.querySelector('#btn-select-division-uni').click()`);
    await delay(800);

    // Verify switcher label updated to UNIVERSITY
    const updatedSwitcherText = await cdp.eval(`document.querySelector('#btn-division-switcher')?.innerText`);
    assert('3.3 Switcher label smoothly transitions to UNIVERSITY',
      updatedSwitcherText?.includes('UNIVERSITY'),
      `Switcher: ${updatedSwitcherText?.replace(/\n/g, ' ')}`
    );

    // Verify URL navigated to /admin/UNIVERSITY overview
    const newPath = await cdp.eval(`window.location.pathname`);
    assert('3.4 Navigated to UNIVERSITY division overview', newPath === '/admin/UNIVERSITY', `Path: ${newPath}`);

    // Verify navigation links now point to UNIVERSITY
    const newUniLinks = await cdp.eval(`
      Array.from(document.querySelectorAll('a[href*="/admin/UNIVERSITY"]')).map(a => a.innerText.trim())
    `);
    assert('3.5 Sidebar links dynamically update to UNIVERSITY', newUniLinks.length >= 8, `Found: ${newUniLinks.length} links`);

    // Verify no PRE_UNIVERSITY links are present in sidebar
    const preUniSidebarLinks = await cdp.eval(`
      Array.from(document.querySelectorAll('aside a[href*="/admin/PRE_UNIVERSITY"]')).map(a => a.href)
    `);
    assert('3.6 PRE-UNIVERSITY sidebar links cleanly replaced', preUniSidebarLinks.length === 0, `Remaining: ${preUniSidebarLinks.join(', ')}`);

    await captureScreenshot(cdp, 'sidebar_03_switched_to_university');

    // -------------------------------------------------------------------------
    // TEST 4: PAGE HEADER CONTEXT & AUTOMATIC BREADCRUMBS
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Page Header Context & Breadcrumbs ---');

    // Navigate to Programs in University division
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/UNIVERSITY/programs' });
    await delay(1500);

    // Check breadcrumb
    const breadcrumbText = await cdp.eval(`document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`);
    assert('4.1 Breadcrumb reflects Academy / University / Programs',
      breadcrumbText?.includes('Academy') && breadcrumbText?.includes('University') && breadcrumbText?.includes('Programs'),
      `Breadcrumb: ${breadcrumbText}`
    );

    // Check division context badge
    const badgeText = await cdp.eval(`document.querySelector('span[class*="divisionBadge"]')?.innerText`);
    assert('4.2 Division context badge explicitly shows UNIVERSITY', badgeText?.includes('UNIVERSITY'), `Badge: ${badgeText}`);

    await captureScreenshot(cdp, 'sidebar_04_university_programs_context');

    // -------------------------------------------------------------------------
    // TEST 5: SWITCH DIVISION WHILE ON A SUB-MODULE (SEAMLESS ROUTING)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Seamless Module Transition Between Divisions ---');

    // Switch back to PRE-UNIVERSITY while on /programs
    await cdp.eval(`document.querySelector('#btn-division-switcher').click()`);
    await delay(250);
    await cdp.eval(`document.querySelector('#btn-select-division-pre-uni').click()`);
    await delay(1200);

    const transitionedPath = await cdp.eval(`window.location.pathname`);
    assert('5.1 Seamlessly transitions from /admin/UNIVERSITY/programs to /admin/PRE_UNIVERSITY/programs',
      transitionedPath === '/admin/PRE_UNIVERSITY/programs',
      `Path: ${transitionedPath}`
    );

    const preUniBreadcrumb = await cdp.eval(`document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`);
    assert('5.2 Breadcrumb automatically updates to Pre-University',
      preUniBreadcrumb?.includes('Pre-University'),
      `Breadcrumb: ${preUniBreadcrumb}`
    );

    const preUniBadge = await cdp.eval(`document.querySelector('span[class*="divisionBadge"]')?.innerText`);
    assert('5.3 Division badge updates to PRE-UNIVERSITY', preUniBadge?.includes('PRE-UNIVERSITY'), `Badge: ${preUniBadge}`);

    await captureScreenshot(cdp, 'sidebar_05_pre_uni_programs_context');

    // -------------------------------------------------------------------------
    // TEST 6: COLLAPSIBLE ACCORDION ANIMATION
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Collapsible Section Animations ---');

    const initialVisibleLinks = await cdp.eval(`document.querySelectorAll('a[href*="/admin/PRE_UNIVERSITY/students"]').length`);
    assert('6.1 Division links visible when section is open', initialVisibleLinks === 1);

    // Click section header to collapse
    await cdp.eval(`
      (() => {
        const headers = Array.from(document.querySelectorAll('button[class*="sectionHeader"]'));
        const academy = headers.find(h => h.innerText.toUpperCase().includes('ACADEMY DIVISION'));
        if (academy) academy.click();
      })()
    `);
    await delay(350);

    // Check if sectionBody has collapsed class
    const isBodyCollapsed = await cdp.eval(`
      Boolean(document.querySelector('[class*="sectionBodyCollapsed"]'))
    `);
    assert('6.2 Section body collapses smoothly with CSS transition', isBodyCollapsed);

    // Re-expand
    await cdp.eval(`
      (() => {
        const headers = Array.from(document.querySelectorAll('button[class*="sectionHeader"]'));
        const academy = headers.find(h => h.innerText.toUpperCase().includes('ACADEMY DIVISION'));
        if (academy) academy.click();
      })()
    `);
    await delay(350);

    const isBodyExpanded = await cdp.eval(`
      !document.querySelector('[class*="sectionBodyCollapsed"]')
    `);
    assert('6.3 Section body re-expands smoothly with CSS transition', isBodyExpanded);

    // -------------------------------------------------------------------------
    // TEST 7: SIDEBAR RAIL (COLLAPSE/EXPAND MODE)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 7: Sidebar Rail Mode ---');

    // Click rail toggle button
    await cdp.eval(`document.querySelector('button[class*="railToggleBtn"]').click()`);
    await delay(400);

    const isRailMode = await cdp.eval(`Boolean(document.querySelector('[class*="sidebarRail"]'))`);
    assert('7.1 Sidebar shrinks into compact icon rail', isRailMode);

    await captureScreenshot(cdp, 'sidebar_06_rail_collapsed_mode');

    // Expand back
    await cdp.eval(`document.querySelector('button[class*="railToggleBtn"]').click()`);
    await delay(400);

    const isNormalMode = await cdp.eval(`!document.querySelector('[class*="sidebarRail"]')`);
    assert('7.2 Sidebar expands back to standard readable width', isNormalMode);

    // -------------------------------------------------------------------------
    // TEST 8: DIVISION ADMIN LOCKED WORKSPACE (NO SWITCHER)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 8: Division Admin Locked Workspace ---');

    // Login as Pre-University Admin
    await loginUser(cdp, 'preuni.admin@esa.dev');
    await delay(1200);

    const preAdminSwitcherBtn = await cdp.eval(`Boolean(document.querySelector('#btn-division-switcher'))`);
    assert('8.1 Pre-University Admin cannot switch divisions (no dropdown switcher button)', !preAdminSwitcherBtn);

    const staticBadge = await cdp.eval(`document.querySelector('div[class*="divisionStaticBadge"]')?.innerText`);
    assert('8.2 Pre-University Admin displays locked static PRE-UNIVERSITY badge',
      staticBadge?.includes('PRE-UNIVERSITY') && staticBadge?.includes('Assigned workspace'),
      `Badge: ${staticBadge?.replace(/\n/g, ' ')}`
    );

    await captureScreenshot(cdp, 'sidebar_07_pre_uni_admin_locked');

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = results.filter((r) => r.pass).length;
    const failedCount = results.filter((r) => !r.pass).length;
    console.log(`TOTAL SIDEBAR UX TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
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
      console.log('ALL SIDEBAR UX AND ANIMATION TESTS PASSED PERFECTLY!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Sidebar verification error:', err);
    if (cdp) await cdp.close();
    if (chromeProcess) chromeProcess.kill();
    process.exit(1);
  }
}

runSidebarVerification();
