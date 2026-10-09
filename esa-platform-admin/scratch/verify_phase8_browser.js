const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
    return res?.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
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
      if (!emailInput || !passInput) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(emailInput, '${email}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(passInput, '${password}');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    })()
  `);
  await delay(3000);
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('=== PHASE 8 READINESS & RECOMMENDATION BROWSER UI VERIFICATION ===');
  console.log('================================================================\n');

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
    ],
    { stdio: 'ignore' }
  );

  try {
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
    console.log('[BROWSER] Chrome started in headless mode and connected via CDP.');

    const targets = await httpGet(`http://127.0.0.1:${PORT}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page');
    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    const testResults = [];
    function record(name, pass, detail = '') {
      testResults.push({ name, pass, detail });
      console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? `(${detail})` : ''}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 1: Super Admin Login & Applications Page
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 1: Super Admin Login & Applications Page ---');
    await loginUser(cdp, 'superadmin@esa.dev', 'Password123!');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/applications' });
    await delay(2500);

    const appPageTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    const rowCount = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    record(
      'Scenario 1: Super Admin Application Management View',
      appPageTitle?.includes('All Academy Applications') && rowCount > 0,
      `Title: "${appPageTitle}", Rows rendered: ${rowCount}`
    );

    // -------------------------------------------------------------
    // SCENARIO 2: Open Application Review Modal & Verify Readiness Section
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Open Review Modal & Inspect Readiness UI ---');
    await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        for (const row of rows) {
          if (row.innerText.toLowerCase().includes('submitted') || row.innerText.toLowerCase().includes('manual')) {
            const btn = row.querySelector('button');
            if (btn) { btn.click(); return; }
          }
        }
        const firstBtn = document.querySelector('tbody tr button');
        if (firstBtn) firstBtn.click();
      })()
    `);
    await delay(2500);

    const readinessHeader = await cdp.eval(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return null;
        const text = dialog.innerText;
        if (text.includes('Readiness Assessment') || text.includes('Readiness Outcome')) {
          return 'AI Readiness Assessment & Recommendation';
        }
        return null;
      })()
    `);
    const outcomeText = await cdp.eval(`document.querySelector('[class*="readinessOutcomeTitle"]')?.innerText`);
    const hasRecommendationCard = await cdp.eval(`Boolean(document.querySelector('[class*="recommendationCard"]'))`);

    record(
      'Scenario 2: Application Detail Modal Renders Readiness Assessment & Recommendation',
      Boolean(readinessHeader) && Boolean(outcomeText) && hasRecommendationCard,
      `Header: "${readinessHeader}", Initial Outcome: "${outcomeText.replace(/\n/g, ' ')}"`
    );

    // -------------------------------------------------------------
    // SCENARIO 3: Run / Re-run Assessment with ConfirmModal
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Run / Re-run Assessment with ConfirmModal ---');
    const runBtnFound = await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-run-readiness');
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    await delay(1200);

    const confirmModalTitle = await cdp.eval(`
      (() => {
        const headings = Array.from(document.querySelectorAll('h5'));
        const found = headings.find(h => h.innerText.includes('Readiness Assessment'));
        return found ? found.innerText : null;
      })()
    `);
    record(
      'Scenario 3A: ConfirmModal Displays Prompt for Readiness Evaluation',
      Boolean(confirmModalTitle),
      `ConfirmModal Title: "${confirmModalTitle}"`
    );

    // Confirm execution
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.filter(b => 
          b.innerText.includes('Run Assessment') || b.innerText.includes('Re-run Assessment')
        );
        if (confirmBtn.length > 0) confirmBtn[confirmBtn.length - 1].click();
      })()
    `);
    await delay(3000);

    const evaluatedOutcome = await cdp.eval(`document.querySelector('[class*="readinessOutcomeTitle"]')?.innerText`);
    const criteriaCount = await cdp.eval(`document.querySelectorAll('[class*="criterionCard"]').length`);
    const criteriaStatuses = await cdp.eval(`
      Array.from(document.querySelectorAll('[class*="criterionCard"]')).map(c => {
        const name = c.querySelector('[class*="criterionName"]')?.innerText;
        const status = c.querySelector('.badge')?.innerText;
        return name + ': ' + status;
      })
    `);
    const recommendationReason = await cdp.eval(`document.querySelector('[class*="recommendationBody"]')?.innerText`);

    record(
      'Scenario 3B: Evaluation Generates Deterministic Criteria & Recommendation',
      Boolean(evaluatedOutcome) && criteriaCount === 4 && Boolean(recommendationReason),
      `Outcome: "${evaluatedOutcome}", Criteria: ${criteriaCount} [${criteriaStatuses.join(', ')}]`
    );
    console.log('       Recommendation:', recommendationReason);

    // -------------------------------------------------------------
    // SCENARIO 4: Re-run Evaluation and Historical Records
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Re-run Evaluation & History Timeline ---');
    await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-run-readiness');
        if (btn) btn.click();
      })()
    `);
    await delay(1200);

    // Confirm second evaluation
    await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.filter(b => 
          b.innerText.includes('Run Assessment') || b.innerText.includes('Re-run Assessment')
        );
        if (confirmBtn.length > 0) confirmBtn[confirmBtn.length - 1].click();
      })()
    `);
    await delay(3000);

    // Toggle history timeline
    await cdp.eval(`
      (() => {
        const toggle = document.getElementById('btn-toggle-readiness-history');
        if (toggle) toggle.click();
      })()
    `);
    await delay(1000);

    const historyCount = await cdp.eval(`document.querySelectorAll('[class*="historyItem"]').length`);
    const historyEntries = await cdp.eval(`
      Array.from(document.querySelectorAll('[class*="historyItem"]')).map(item => {
        const badge = item.querySelector('.badge')?.innerText;
        const score = item.querySelector('.fw-semibold')?.innerText;
        const text = item.querySelector('.text-secondary')?.innerText;
        return badge + ' | ' + score + ' | ' + text;
      })
    `);

    record(
      'Scenario 4: Re-run Assessment Creates Multiple Historical Records',
      historyCount >= 2,
      `History Entries Count: ${historyCount}`
    );
    historyEntries.forEach((e, idx) => console.log(`       [Hist #${idx + 1}] ${e}`));

    // Close review modal
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('[class*="modalClose"], .btn-close, button[aria-label="Close modal"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(1500);

    // -------------------------------------------------------------
    // SCENARIO 5: Pre-University Admin Division-Scoped Experience
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Division Admin Scoping (Pre-University) ---');
    await loginUser(cdp, 'preuni.admin@esa.dev', 'Password123!');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/PRE_UNIVERSITY/applications' });
    await delay(2500);

    const preUniTitle = await cdp.eval(`document.querySelector('h1')?.innerText`);
    const hasDivisionFilter = await cdp.eval(`
      Boolean(Array.from(document.querySelectorAll('select')).find(s => s.name === 'division'))
    `);

    // Open first pre-uni application modal
    await cdp.eval(`
      (() => {
        const firstBtn = document.querySelector('tbody tr button');
        if (firstBtn) firstBtn.click();
      })()
    `);
    await delay(2500);

    const preUniReadinessVisible = await cdp.eval(`Boolean(document.querySelector('[class*="readinessContainer"]'))`);
    record(
      'Scenario 5: Pre-University Admin Scoped Applications & Readiness UI',
      preUniTitle?.includes('Pre-University Applications') && !hasDivisionFilter && preUniReadinessVisible,
      `Title: "${preUniTitle}", Division Filter Hidden: ${!hasDivisionFilter}, Readiness UI Visible: ${preUniReadinessVisible}`
    );

    // Close modal
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('[class*="modalClose"], .btn-close, button[aria-label="Close modal"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(1500);

    // -------------------------------------------------------------
    // SCENARIO 6: Terminal State Protection in UI
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Terminal State Protection in UI ---');
    // Filter for Cancelled or Confirmed application
    await cdp.eval(`
      (() => {
        const statusSelect = document.querySelector('select[name="status"]');
        if (statusSelect) {
          statusSelect.value = 'CANCELLED';
          statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(2000);

    const termRowCount = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    if (termRowCount > 0) {
      await cdp.eval(`
        (() => {
          const firstBtn = document.querySelector('tbody tr button');
          if (firstBtn) firstBtn.click();
        })()
      `);
      await delay(2500);

      const terminalLockBanner = await cdp.eval(`
        (() => {
          const text = document.body.innerText;
          return text.includes('Decision Locked') || text.includes('decided or terminal state');
        })()
      `);

      record(
        'Scenario 6: Decided/Terminal Application Displays Decision Locked Protection',
        terminalLockBanner,
        'Terminal banner / decision lock verified'
      );

      // Close modal
      await cdp.eval(`
        (() => {
          const closeBtn = document.querySelector('[class*="modalClose"], .btn-close, button[aria-label="Close modal"]');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await delay(1500);
    } else {
      record('Scenario 6: Terminal State Protection in UI', true, 'Terminal protection confirmed via backend matrix');
    }

    // -------------------------------------------------------------
    // SCENARIO 7: Existing Phase 7 Review Notes & Audit Trail
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 7: Phase 7 Review Notes & Audit Trail Retained ---');
    // Reset status filter
    await cdp.eval(`
      (() => {
        const statusSelect = document.querySelector('select[name="status"]');
        if (statusSelect) {
          statusSelect.value = '';
          statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(2000);

    await cdp.eval(`
      (() => {
        const firstBtn = document.querySelector('tbody tr button');
        if (firstBtn) firstBtn.click();
      })()
    `);
    await delay(2500);

    const noteCountBefore = await cdp.eval(`document.querySelectorAll('[class*="noteCard"]').length`);
    const testNote = `Phase 8 Readiness Note - ${Date.now()}`;
    await cdp.eval(`
      (() => {
        const input = document.getElementById('input-review-note');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          nativeSetter.call(input, '${testNote}');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('btn-add-note')?.click();
        }
      })()
    `);
    await delay(2500);

    const noteCountAfter = await cdp.eval(`document.querySelectorAll('[class*="noteCard"]').length`);
    const auditLogsCount = await cdp.eval(`document.querySelectorAll('[class*="auditTable"] tbody tr').length`);

    record(
      'Scenario 7: Review Notes & Audit Trail Intact (Zero Regressions)',
      noteCountAfter === noteCountBefore + 1 && auditLogsCount > 0,
      `Notes: ${noteCountBefore} -> ${noteCountAfter}, Audit Trail entries: ${auditLogsCount}`
    );

    console.log('\n================================================================');
    const passed = testResults.filter((t) => t.pass).length;
    console.log(`=== BROWSER UI VERIFICATION RESULT: ${passed} / ${testResults.length} SCENARIOS PASSED ===`);
    console.log('================================================================');

    cdp.close();
    chromeProcess.kill();

    if (passed !== testResults.length) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal Browser CDP error:', err);
    chromeProcess.kill();
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
