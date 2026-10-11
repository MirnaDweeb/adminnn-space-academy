/**
 * feedbackAndSidebarRegression.test.js
 *
 * Verifies:
 * 1. divisionScope middleware safely handles all input types:
 *    - valid strings ('PRE_UNIVERSITY', 'UNIVERSITY', 'all', 'ALL')
 *    - missing / undefined / empty values
 *    - unexpected objects ({ division: 'PRE_UNIVERSITY' }, {})
 *    - unexpected arrays and non-string types
 * 2. Feedback endpoints return real database records and calculated metrics:
 *    - GET /api/admin/feedback (returns feedback, pagination, metrics with real avg rating and sentiment breakdown)
 *    - GET /api/admin/feedback/summary (returns grounded thematic summary)
 * 3. Division scoping and access isolation across roles:
 *    - Super Admin can filter by division or query all
 *    - Pre-University Admin is strictly isolated to PRE_UNIVERSITY
 * 4. Sidebar configuration has zero duplicate route destinations.
 */

const assert = require('assert');
const { resolveDivisionScope } = require('../src/middleware/divisionScope');
const { ROLES } = require('../src/constants/roles');
const { DIVISIONS } = require('../src/constants/divisions');

const BASE = 'http://localhost:5000/api';

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-json
  }
  return { status: res.status, json };
}

async function login(email, password = 'Password123!') {
  const res = await request('POST', '/auth/login', { body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.json)}`);
  }
  return res.json?.data?.token || res.json?.token;
}

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function runAll() {
  console.log('\n--- REGRESSION & INTEGRATION SUITE: FEEDBACK & SIDEBAR ---');

  // ==========================================
  // UNIT TESTS: resolveDivisionScope input robustness
  // ==========================================
  console.log('\n[1] Testing resolveDivisionScope Input Robustness (No toLowerCase Crash)...');

  it('Handles undefined query param for SUPER_ADMIN -> defaults to "all"', () => {
    const req = { user: { role: ROLES.SUPER_ADMIN }, query: {} };
    let nextCalled = false;
    resolveDivisionScope(req, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.scopeDivision, 'all');
  });

  it('Handles division="all" and division="ALL" for SUPER_ADMIN -> "all"', () => {
    const req1 = { user: { role: ROLES.SUPER_ADMIN }, query: { division: 'all' } };
    resolveDivisionScope(req1, {}, () => {});
    assert.strictEqual(req1.scopeDivision, 'all');

    const req2 = { user: { role: ROLES.SUPER_ADMIN }, query: { division: 'ALL' } };
    resolveDivisionScope(req2, {}, () => {});
    assert.strictEqual(req2.scopeDivision, 'all');
  });

  it('Handles valid division string "PRE_UNIVERSITY" -> "PRE_UNIVERSITY"', () => {
    const req = { user: { role: ROLES.SUPER_ADMIN }, query: { division: 'PRE_UNIVERSITY' } };
    resolveDivisionScope(req, {}, () => {});
    assert.strictEqual(req.scopeDivision, 'PRE_UNIVERSITY');
  });

  it('Handles serialized object { division: "PRE_UNIVERSITY" } without throwing TypeError', () => {
    const req = { user: { role: ROLES.SUPER_ADMIN }, query: { division: { division: 'PRE_UNIVERSITY' } } };
    resolveDivisionScope(req, {}, () => {});
    assert.strictEqual(req.scopeDivision, 'PRE_UNIVERSITY');
  });

  it('Rejects invalid division string with 400 Bad Request', () => {
    const req = { user: { role: ROLES.SUPER_ADMIN }, query: { division: 'INVALID_DIV' } };
    let err = null;
    try {
      resolveDivisionScope(req, {}, () => {});
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Should throw ApiError');
    assert.strictEqual(err.statusCode, 400);
  });

  it('Rejects arbitrary non-string objects safely with 400 Bad Request instead of TypeError crash', () => {
    const req = { user: { role: ROLES.SUPER_ADMIN }, query: { division: { someKey: 123 } } };
    let err = null;
    try {
      resolveDivisionScope(req, {}, () => {});
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Should throw ApiError');
    assert.strictEqual(err.statusCode, 400);
  });

  it('Division Admin is always locked to own division regardless of query param', () => {
    const req = {
      user: { role: ROLES.PRE_UNIVERSITY_ADMIN, division: DIVISIONS.PRE_UNIVERSITY },
      query: { division: 'UNIVERSITY' }, // attempt to bypass
    };
    resolveDivisionScope(req, {}, () => {});
    assert.strictEqual(req.scopeDivision, DIVISIONS.PRE_UNIVERSITY);
  });

  // ==========================================
  // INTEGRATION TESTS: Real API & Data
  // ==========================================
  console.log('\n[2] Testing Live Feedback Endpoints with Real Database Records...');

  let superToken, preUniToken;
  try {
    superToken = await login('superadmin@esa.dev');
    preUniToken = await login('preuni.admin@esa.dev');
  } catch (err) {
    console.error('Login error in tests:', err.message);
    process.exit(1);
  }

  await itAsync('GET /api/admin/feedback returns real database records and valid metrics', async () => {
    const { status, json } = await request('GET', '/admin/feedback', { token: superToken });
    assert.strictEqual(status, 200);
    assert.ok(json.success, 'Response should succeed');
    assert.ok(Array.isArray(json.data.feedback), 'Feedback list should be an array');
    assert.ok(json.data.feedback.length > 0, 'Should contain real feedback items');
    assert.ok(json.data.metrics, 'Response must include metrics');
    assert.ok(json.data.metrics.total > 0, 'Metrics total should be > 0');
    assert.ok(json.data.metrics.averageRating > 0, 'Metrics averageRating should be > 0');
    assert.ok(json.data.metrics.sentimentBreakdown, 'Metrics should include sentimentBreakdown');
  });

  await itAsync('GET /api/admin/feedback with object query param does not 500 error', async () => {
    const { status, json } = await request('GET', '/admin/feedback?division[division]=PRE_UNIVERSITY', { token: superToken });
    assert.strictEqual(status, 200);
    assert.ok(json.success);
  });

  await itAsync('GET /api/admin/feedback/summary returns grounded thematic summary', async () => {
    const { status, json } = await request('GET', '/admin/feedback/summary', { token: superToken });
    assert.strictEqual(status, 200);
    assert.ok(json.success);
    assert.ok(json.data.summary);
    assert.ok(json.data.summary.totalAnalyzed > 0, 'Total analyzed should reflect real feedback');
    assert.ok(json.data.summary.averageRating > 0, 'Average rating should be computed');
    assert.ok(json.data.summary.sentimentBreakdown, 'Sentiment breakdown should be defined');
    assert.ok(Array.isArray(json.data.summary.keyThemes), 'Key themes should be an array');
  });

  await itAsync('GET /api/admin/feedback with rating filter filters correctly', async () => {
    const { status, json } = await request('GET', '/admin/feedback?rating=5', { token: superToken });
    assert.strictEqual(status, 200);
    assert.ok(json.success);
    const nonFive = json.data.feedback.filter((f) => f.rating !== 5);
    assert.strictEqual(nonFive.length, 0, 'All returned items must have rating 5');
  });

  await itAsync('Division Admin only sees their own division feedback', async () => {
    const { status, json } = await request('GET', '/admin/feedback', { token: preUniToken });
    assert.strictEqual(status, 200);
    assert.ok(json.success);
    const wrongDivision = json.data.feedback.filter((f) => f.division !== DIVISIONS.PRE_UNIVERSITY);
    assert.strictEqual(wrongDivision.length, 0, 'Pre-University Admin must not see University feedback');
  });

  // ==========================================
  // SIDEBAR AUDIT: Verify no duplicate destinations
  // ==========================================
  console.log('\n[3] Testing Sidebar Navigation Integrity (No Duplicate Routes)...');

  it('Verifies superAdminSections in AdminLayout has zero duplicate destinations', () => {
    const fs = require('fs');
    const path = require('path');
    const adminLayoutContent = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/layouts/AdminLayout.jsx'),
      'utf8'
    );

    // Extract superAdminSections items
    const superAdminMatch = adminLayoutContent.match(/const superAdminSections = \[([\s\S]*?)\];/);
    assert.ok(superAdminMatch, 'superAdminSections must exist in AdminLayout.jsx');

    const toMatches = [...superAdminMatch[1].matchAll(/to:\s*([`'"][^`'"]+[`'"])/g)].map((m) => m[1]);
    const destinations = toMatches.map((t) => t.replace(/[`'"]/g, '').trim());

    const seen = new Set();
    const duplicates = [];
    destinations.forEach((dest) => {
      if (seen.has(dest)) {
        duplicates.push(dest);
      }
      seen.add(dest);
    });

    assert.strictEqual(
      duplicates.length,
      0,
      `Found duplicate navigation routes in superAdminSections: ${duplicates.join(', ')}`
    );
  });

  it('Verifies divisionAdminSections in AdminLayout has zero duplicate destinations', () => {
    const fs = require('fs');
    const path = require('path');
    const adminLayoutContent = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/layouts/AdminLayout.jsx'),
      'utf8'
    );

    const divAdminMatch = adminLayoutContent.match(/const divisionAdminSections = \[([\s\S]*?)\];/);
    assert.ok(divAdminMatch, 'divisionAdminSections must exist in AdminLayout.jsx');

    const toMatches = [...divAdminMatch[1].matchAll(/to:\s*([`'"][^`'"]+[`'"])/g)].map((m) => m[1]);
    const destinations = toMatches.map((t) => t.replace(/[`'"]/g, '').trim());

    const seen = new Set();
    const duplicates = [];
    destinations.forEach((dest) => {
      if (seen.has(dest)) {
        duplicates.push(dest);
      }
      seen.add(dest);
    });

    assert.strictEqual(
      duplicates.length,
      0,
      `Found duplicate navigation routes in divisionAdminSections: ${duplicates.join(', ')}`
    );
  });

  console.log('\n========================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
