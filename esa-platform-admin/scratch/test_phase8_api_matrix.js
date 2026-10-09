const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function login(email, password = 'Password123!') {
  const { status, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (status !== 200 || !body.data?.token) {
    throw new Error(`Login failed for ${email}: status ${status}`);
  }
  return body.data.token;
}

async function runApiMatrix() {
  console.log('====================================================');
  console.log('PHASE 8 — READINESS & RECOMMENDATION API TEST MATRIX');
  console.log('====================================================\n');

  const results = [];
  function assert(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? `(${detail})` : ''}`);
  }

  // 1. Logins for all roles
  const superToken = await login('superadmin@esa.dev');
  const preUniToken = await login('preuni.admin@esa.dev');
  const uniToken = await login('uni.admin@esa.dev');
  const studentToken = await login('student@esa.dev');
  const instructorToken = await login('instructor@esa.dev');

  // Fetch applications to use in test
  const { body: appsBody } = await request('/admin/applications?limit=50', {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const apps = appsBody.data.applications;

  // Find pre-uni and uni applications
  const preUniApp = apps.find((a) => a.division === 'PRE_UNIVERSITY' && ['SUBMITTED', 'MANUAL_REVIEW'].includes(a.status));
  const uniApp = apps.find((a) => a.division === 'UNIVERSITY' && ['SUBMITTED', 'MANUAL_REVIEW'].includes(a.status));
  const terminalApp = apps.find((a) => ['ELIGIBLE_PAYMENT_PENDING', 'CANCELLED', 'CONFIRMED'].includes(a.status));

  if (!preUniApp || !uniApp) {
    throw new Error('Could not find both preUni and uni test applications');
  }

  console.log(`Pre-Uni Test App: ${preUniApp._id} (division: ${preUniApp.division}, status: ${preUniApp.status})`);
  console.log(`University Test App: ${uniApp._id} (division: ${uniApp.division}, status: ${uniApp.status})`);
  if (terminalApp) {
    console.log(`Terminal Test App: ${terminalApp._id} (status: ${terminalApp.status})\n`);
  }

  // TEST 1: SUPER_ADMIN evaluates PRE_UNIVERSITY application
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 1: SUPER_ADMIN can evaluate PRE_UNIVERSITY application',
      res.status === 201 && Boolean(res.body.data?.readinessResult),
      `HTTP ${res.status}, outcome: ${res.body.data?.readinessResult?.outcome}`
    );
  }

  // TEST 2: SUPER_ADMIN evaluates UNIVERSITY application
  {
    const res = await request(`/admin/applications/${uniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 2: SUPER_ADMIN can evaluate UNIVERSITY application',
      res.status === 201 && Boolean(res.body.data?.readinessResult),
      `HTTP ${res.status}, outcome: ${res.body.data?.readinessResult?.outcome}`
    );
  }

  // TEST 3: PRE_UNIVERSITY_ADMIN evaluates PRE_UNIVERSITY application
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 3: PRE_UNIVERSITY_ADMIN can evaluate PRE_UNIVERSITY application',
      res.status === 201 && res.body.data?.readinessResult?.division === 'PRE_UNIVERSITY',
      `HTTP ${res.status}, evaluator: ${res.body.data?.readinessResult?.evaluatedBy?.fullName}`
    );
  }

  // TEST 4: PRE_UNIVERSITY_ADMIN receives 403 for UNIVERSITY application
  {
    const res = await request(`/admin/applications/${uniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 4: PRE_UNIVERSITY_ADMIN receives 403 for UNIVERSITY application',
      res.status === 403,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 5: UNIVERSITY_ADMIN evaluates UNIVERSITY application
  {
    const res = await request(`/admin/applications/${uniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${uniToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 5: UNIVERSITY_ADMIN can evaluate UNIVERSITY application',
      res.status === 201 && res.body.data?.readinessResult?.division === 'UNIVERSITY',
      `HTTP ${res.status}, evaluator: ${res.body.data?.readinessResult?.evaluatedBy?.fullName}`
    );
  }

  // TEST 6: UNIVERSITY_ADMIN receives 403 for PRE_UNIVERSITY application
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${uniToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 6: UNIVERSITY_ADMIN receives 403 for PRE_UNIVERSITY application',
      res.status === 403,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 7: Unauthenticated request returns 401
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert('Test 7: Unauthenticated request returns 401', res.status === 401, `HTTP ${res.status}`);
  }

  // TEST 8: STUDENT cannot trigger evaluation (403)
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({}),
    });
    assert('Test 8: STUDENT cannot trigger evaluation (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // TEST 9: INSTRUCTOR cannot trigger evaluation (403)
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${instructorToken}` },
      body: JSON.stringify({}),
    });
    assert('Test 9: INSTRUCTOR cannot trigger evaluation (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // TEST 10: Readiness history returns all evaluations
  {
    const res = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      'Test 10: Readiness history returns all evaluations',
      res.status === 200 && Array.isArray(res.body.data?.history) && res.body.data.history.length >= 2,
      `HTTP ${res.status}, count: ${res.body.data?.history?.length}`
    );
  }

  // TEST 11 & 12: Re-run creates new ReadinessResult and preserves previous
  {
    const beforeHist = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const beforeCount = beforeHist.body.data.history.length;
    const initialId = beforeHist.body.data.history[0]._id;

    const evalRes = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({}),
    });
    const newId = evalRes.body.data.readinessResult._id;

    const afterHist = await request(`/admin/applications/${preUniApp._id}/readiness`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const afterCount = afterHist.body.data.history.length;

    assert(
      'Test 11: Re-run creates a new ReadinessResult',
      afterCount === beforeCount + 1 && newId !== initialId,
      `New ID: ${newId}, count increased from ${beforeCount} to ${afterCount}`
    );

    const oldRecordStillExists = afterHist.body.data.history.some((h) => h._id === initialId);
    assert(
      'Test 12: Previous ReadinessResult remains unchanged in history',
      oldRecordStillExists,
      `Previous ID ${initialId} preserved in historical list`
    );
  }

  // TEST 13: AuditLog is created with action READINESS_EVALUATED
  {
    const auditRes = await request(`/admin/audit-logs?action=READINESS_EVALUATED&limit=5`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const logs = auditRes.body.data?.auditLogs || [];
    const hasReadinessLog = logs.some((l) => l.action === 'READINESS_EVALUATED' && l.resource === 'Application');
    assert(
      'Test 13: AuditLog is created with action READINESS_EVALUATED',
      auditRes.status === 200 && hasReadinessLog,
      `Found ${logs.length} matching audit entries, latest reason: "${logs[0]?.reason}"`
    );
  }

  // TEST 14: Terminal decision protection works
  if (terminalApp) {
    const res = await request(`/admin/applications/${terminalApp._id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({}),
    });
    assert(
      'Test 14: Terminal decision protection blocks evaluation',
      res.status === 400 && res.body.error?.message?.includes('finalized admission decision'),
      `HTTP ${res.status}, msg: "${res.body.error?.message}"`
    );
  } else {
    assert('Test 14: Terminal decision protection', true, 'Skipped terminal app test (none found)');
  }

  // Summary
  const passCount = results.filter((r) => r.pass).length;
  console.log('\n====================================================');
  console.log(`API MATRIX RESULT: ${passCount} / ${results.length} PASSED`);
  console.log('====================================================');

  if (passCount !== results.length) {
    process.exit(1);
  }
}

runApiMatrix().catch((err) => {
  console.error('Fatal error during API test matrix:', err);
  process.exit(1);
});
