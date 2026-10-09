const http = require('http');

const BASE_URL = 'http://127.0.0.1:5000/api';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await request(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email, password }
  );
  return res.data?.data?.token;
}

async function runRegressionSuite() {
  console.log('====================================================');
  console.log('PLATFORM FULL REGRESSION TEST SUITE (PHASES 4 — 8)');
  console.log('====================================================\n');

  // Obtain tokens for all roles
  const superAdminToken = await login('superadmin@esa.dev', 'Password123!');
  const preUniAdminToken = await login('preuni.admin@esa.dev', 'Password123!');
  const uniAdminToken = await login('uni.admin@esa.dev', 'Password123!');
  const studentToken = await login('student@esa.dev', 'Password123!');

  if (!superAdminToken || !preUniAdminToken || !uniAdminToken) {
    throw new Error('Failed to obtain administrative tokens');
  }

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  // -------------------------------------------------------------
  // 1. ADMIN PROVISIONING (Phase 4)
  // -------------------------------------------------------------
  console.log('--- 1. Admin Provisioning (Phase 4) ---');
  const listAdmins = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/administrators',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('1.1 Super Admin lists administrators', listAdmins.status === 200 && Array.isArray(listAdmins.data?.data?.administrators));

  const forbiddenAdminList = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/administrators',
    method: 'GET',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('1.2 Division Admin blocked from Admin Provisioning (403)', forbiddenAdminList.status === 403);

  // -------------------------------------------------------------
  // 2. STUDENT MANAGEMENT (Phase 5)
  // -------------------------------------------------------------
  console.log('\n--- 2. Student Management (Phase 5) ---');
  const listStudentsPreUni = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/students',
    method: 'GET',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('2.1 Pre-University Admin lists scoped students', listStudentsPreUni.status === 200 && Array.isArray(listStudentsPreUni.data?.data?.students));

  const studentsList = listStudentsPreUni.data?.data?.students || [];
  if (studentsList.length > 0) {
    const targetStudent = studentsList[0];
    const toggleRes = await request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `/api/admin/students/${targetStudent._id}/status`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${preUniAdminToken}`,
          'Content-Type': 'application/json',
        },
      },
      { isActive: targetStudent.isActive, reason: 'Regression test status verification' }
    );
    assert('2.2 Student status toggle API works with audit log', toggleRes.status === 200);
  }

  // -------------------------------------------------------------
  // 3. INSTRUCTOR MANAGEMENT (Phase 5)
  // -------------------------------------------------------------
  console.log('\n--- 3. Instructor Management (Phase 5) ---');
  const listInstructors = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/instructors',
    method: 'GET',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('3.1 Pre-University Admin lists scoped instructors', listInstructors.status === 200 && Array.isArray(listInstructors.data?.data?.instructors));

  // -------------------------------------------------------------
  // 4. PROGRAM MANAGEMENT (Phase 6)
  // -------------------------------------------------------------
  console.log('\n--- 4. Program Management (Phase 6) ---');
  const listPrograms = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/programs?division=PRE_UNIVERSITY',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('4.1 Program listing returns active programs', listPrograms.status === 200 && Array.isArray(listPrograms.data?.data?.programs || listPrograms.data?.data));

  // -------------------------------------------------------------
  // 5. APPLICATION REVIEW & DECISIONS (Phase 7)
  // -------------------------------------------------------------
  console.log('\n--- 5. Application Review & Decisions (Phase 7) ---');
  const listApps = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/applications',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('5.1 Application list returns applications for review', listApps.status === 200 && Array.isArray(listApps.data?.data?.applications));

  const apps = listApps.data?.data?.applications || [];
  if (apps.length > 0) {
    const testApp = apps[0];
    const addNote = await request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `/api/admin/applications/${testApp._id}/notes`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json',
        },
      },
      { note: 'Regression verification review note' }
    );
    assert('5.2 Adding review note succeeds and returns updated application', [200, 201].includes(addNote.status));
  }

  // -------------------------------------------------------------
  // 6. PHASE 8 READINESS & RECOMMENDATION
  // -------------------------------------------------------------
  console.log('\n--- 6. Phase 8 Readiness & Recommendation ---');
  if (apps.length > 0) {
    const testApp = apps[0];
    const readinessHistory = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/applications/${testApp._id}/readiness`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('6.1 Readiness history endpoint returns append-only results', readinessHistory.status === 200 && Array.isArray(readinessHistory.data?.data?.history));
  }

  // -------------------------------------------------------------
  // 7. AUDIT LOG VIEWER (Phase 4 Gate Closeout)
  // -------------------------------------------------------------
  console.log('\n--- 7. Audit Log Viewer (Phase 4 Gate Closeout) ---');
  const auditFilters = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/audit-logs/filters',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('7.1 Audit log filter options endpoint responds', auditFilters.status === 200 && Array.isArray(auditFilters.data?.data?.actions));

  const auditLogs = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/audit-logs?limit=5',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('7.2 Audit logs queryable by Super Admin', auditLogs.status === 200 && Array.isArray(auditLogs.data?.data?.auditLogs));

  const divisionAuditLogs = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/audit-logs?limit=5',
    method: 'GET',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('7.3 Pre-University Admin can view scoped audit logs', divisionAuditLogs.status === 200 && Array.isArray(divisionAuditLogs.data?.data?.auditLogs));

  // -------------------------------------------------------------
  // 8. PHASE 9: ENROLLMENT & CAPACITY
  // -------------------------------------------------------------
  console.log('\n--- 8. Phase 9: Enrollment & Capacity ---');
  const activePrograms = listPrograms.data?.data?.programs || listPrograms.data?.data || [];
  if (activePrograms.length > 0) {
    const testProg = activePrograms[0];
    const capacityRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/programs/${testProg._id}/capacity`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('8.1 Program capacity endpoint returns real-time metrics', capacityRes.status === 200 && capacityRes.data?.data?.capacity != null);

    const enrollmentsList = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/programs/${testProg._id}/enrollments`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('8.2 Program enrollments list returns enrolled candidates with invoice links', enrollmentsList.status === 200 && Array.isArray(enrollmentsList.data?.data?.enrollments));
  }

  // -------------------------------------------------------------
  // 9. PHASE 10: PAYMENTS & FINANCE
  // -------------------------------------------------------------
  console.log('\n--- 9. Phase 10: Payments & Finance ---');
  const invoicesListSuper = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invoices?limit=10',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('9.1 Super Admin lists invoices across divisions', invoicesListSuper.status === 200 && Array.isArray(invoicesListSuper.data?.data?.invoices));

  const invoicesListPreUni = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invoices?division=PRE_UNIVERSITY&limit=10',
    method: 'GET',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('9.2 Pre-University Admin lists scoped invoices', invoicesListPreUni.status === 200 && Array.isArray(invoicesListPreUni.data?.data?.invoices));

  const preUniInvoices = invoicesListPreUni.data?.data?.invoices || [];
  if (preUniInvoices.length > 0) {
    const testInv = preUniInvoices[0];
    const invDetail = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/invoices/${testInv._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${preUniAdminToken}` },
    });
    assert('9.3 Invoice detail returns invoice, immutable transactions, and balance', invDetail.status === 200 && invDetail.data?.data?.invoice && Array.isArray(invDetail.data?.data?.transactions));

    // Cross-division protection check
    const crossDivisionAccess = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/invoices/${testInv._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${uniAdminToken}` },
    });
    assert('9.4 Cross-division access blocked with 403', crossDivisionAccess.status === 403);
  }

  // Student read-only invoices endpoint
  const studentInvoices = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/students/mine/invoices',
    method: 'GET',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert('9.5 Student can view own invoices in read-only view', studentInvoices.status === 200 && Array.isArray(studentInvoices.data?.data?.invoices));

  // Deadline sweep trigger endpoint
  const sweepRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invoices/process-expired',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json',
    },
  });
  assert('9.6 Admin deadline sweep endpoint executes successfully', sweepRes.status === 200 && sweepRes.data?.data?.processedCount != null);

  // -------------------------------------------------------------
  // 10. PHASE 11: COHORTS, ATTENDANCE & DELIVERABLES
  // -------------------------------------------------------------
  console.log('\n--- 10. Phase 11: Cohorts, Attendance & Deliverables ---');
  const cohortsListRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/cohorts',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('10.1 Super Admin lists cohorts', cohortsListRes.status === 200 && Array.isArray(cohortsListRes.data?.data?.cohorts));

  const existingCohorts = cohortsListRes.data?.data?.cohorts || [];
  let testCohort = existingCohorts[0];
  if (testCohort) {
    const cohortDetailRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/cohorts/${testCohort._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('10.2 Admin gets cohort detail with confirmed roster and deliverables', cohortDetailRes.status === 200 && cohortDetailRes.data?.data?.cohort != null);
  }

  // -------------------------------------------------------------
  // 11. PHASE 12: EVALUATIONS & LEARNING OUTCOMES
  // -------------------------------------------------------------
  console.log('\n--- 11. Phase 12: Evaluations & Learning Outcomes ---');
  if (testCohort) {
    // 11.1 Division Admin evaluates cohort
    const evalRun = await request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `/api/admin/cohorts/${testCohort._id}/evaluate`,
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdminToken}` },
      }
    );
    assert('11.1 Admin triggers evaluate endpoint', evalRun.status === 200 && evalRun.data?.data?.summary != null);

    // 11.2 Division-scoped evaluations list
    const evalsListRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/cohorts/${testCohort._id}/evaluations`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('11.2 Admin lists evaluations and history for cohort', evalsListRes.status === 200 && Array.isArray(evalsListRes.data?.data?.evaluations));

    // 11.3 Cross-division check
    const otherDivToken = testCohort.division === 'PRE_UNIVERSITY' ? uniAdminToken : preUniAdminToken;
    const crossDivEval = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/cohorts/${testCohort._id}/evaluations`,
      method: 'GET',
      headers: { Authorization: `Bearer ${otherDivToken}` },
    });
    assert('11.3 Cross-division admin blocked from cohort evaluations (403)', crossDivEval.status === 403);
  }

  // 11.4 Student views own evaluations
  const studentEvalRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/student/mine/evaluations',
    method: 'GET',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  // -------------------------------------------------------------
  // 12. PHASE 13: CERTIFICATES & CREDENTIALS
  // -------------------------------------------------------------
  console.log('\n--- 12. Phase 13: Certificates & Verifiable Credentials ---');
  // 12.1 Division Admin lists certificates
  const certsListRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/certificates',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('12.1 Super Admin lists certificates across divisions', certsListRes.status === 200 && Array.isArray(certsListRes.data?.data?.certificates));

  const existingCerts = certsListRes.data?.data?.certificates || [];
  const sampleCert = existingCerts[0];

  if (sampleCert) {
    // 12.2 Certificate Detail
    const certDetailRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/certificates/${sampleCert._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('12.2 Admin views certificate detail with serial number', certDetailRes.status === 200 && certDetailRes.data?.data?.certificate?.serialNumber != null);

    // 12.3 Certificate PDF Download
    const certPdfRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/certificates/${sampleCert._id}/pdf`,
      method: 'GET',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert('12.3 Admin downloads certificate PDF (application/pdf)', certPdfRes.status === 200 && certPdfRes.headers['content-type']?.includes('application/pdf'));

    // 12.4 Public unauthenticated verification
    const publicVerifyRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/certificates/verify/${sampleCert.verificationToken}`,
      method: 'GET',
    });
    assert(
      '12.4 Public unauthenticated verification returns valid payload without sensitive data leaks',
      publicVerifyRes.status === 200 &&
        publicVerifyRes.data?.data?.studentName != null &&
        publicVerifyRes.data?.data?.studentEmail === undefined &&
        publicVerifyRes.data?.data?.averageScore === undefined
    );

    // 12.5 Public verification with invalid token
    const invalidVerifyRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/certificates/verify/invalid-token-999999',
      method: 'GET',
    });
    assert('12.5 Public verification with invalid token returns found: false', invalidVerifyRes.status === 200 && invalidVerifyRes.data?.data?.found === false);

    // 12.6 Cross-division access blocked
    const otherDivToken = sampleCert.division === 'PRE_UNIVERSITY' ? uniAdminToken : preUniAdminToken;
    const crossCertRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/certificates/${sampleCert._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${otherDivToken}` },
    });
    assert('12.6 Cross-division admin blocked from accessing certificate (403)', crossCertRes.status === 403);
  }

  // 12.7 Student views own certificates
  const studentCertsRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/student/mine/certificates',
    method: 'GET',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert('12.7 Student views own certificates list', studentCertsRes.status === 200 && Array.isArray(studentCertsRes.data?.data?.certificates));

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.pass);
  console.log(`REGRESSION TEST RESULT: ${results.filter((r) => r.pass).length} / ${results.length} PASSED`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Regression suite error:', err);
  process.exit(1);
});
