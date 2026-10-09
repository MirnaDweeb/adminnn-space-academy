const http = require('http');
const mongoose = require('../backend/src/models/User').base || require('mongoose');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const AuditLog = require('../backend/src/models/AuditLog');

const BASE_URL = 'http://localhost:5000/api';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {},
    };

    if (options.body && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let rawData = [];
      res.on('data', (chunk) => rawData.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(rawData);
        let parsed = null;
        try {
          parsed = JSON.parse(buffer.toString('utf8'));
        } catch (e) {
          parsed = buffer;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          rawBuffer: buffer,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function login(email, password = 'Password123!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || !res.data?.data?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runApiMatrix() {
  console.log('================================================================');
  console.log('PHASE 13: CERTIFICATES & VERIFIABLE CREDENTIALS API TEST MATRIX');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('[DB] Connected to MongoDB.');

  // Clean old phase 13 test certificates to ensure idempotent runs
  await Certificate.deleteMany({ serialNumber: /^CERT-PRE-.*-999/ });

  // 1. Authenticate actors
  const superToken = await login('superadmin@esa.dev');
  const preUniToken = await login('preuni.admin@esa.dev');
  const uniToken = await login('uni.admin@esa.dev');
  const studentToken = await login('student@esa.dev');
  const instructorToken = await login('instructor@esa.dev');
  console.log('[Auth] All 5 role tokens obtained successfully.\n');

  // Find test evaluations from Phase 12
  const passEval = await Evaluation.findOne({ outcome: 'PASS', division: 'PRE_UNIVERSITY' })
    .populate('cohort')
    .populate('student')
    .populate('program')
    .sort({ evaluatedAt: -1 });

  const failEval = await Evaluation.findOne({ outcome: 'FAIL', division: 'PRE_UNIVERSITY' })
    .sort({ evaluatedAt: -1 });

  const incompleteEval = await Evaluation.findOne({ outcome: 'INCOMPLETE', division: 'PRE_UNIVERSITY' })
    .sort({ evaluatedAt: -1 });

  // Create a university division pass evaluation if needed for cross-division tests
  let uniPassEval = await Evaluation.findOne({ outcome: 'PASS', division: 'UNIVERSITY' });
  if (!uniPassEval) {
    const uniCourse = await Course.findOne({ division: 'UNIVERSITY' });
    const uniCohort = await Cohort.findOne({ division: 'UNIVERSITY' });
    const studentUser = await User.findOne({ email: 'student@esa.dev' });
    if (uniCourse && uniCohort) {
      uniPassEval = await Evaluation.create({
        cohort: uniCohort._id,
        student: studentUser._id,
        enrollment: new mongoose.Types.ObjectId(),
        program: uniCourse._id,
        division: 'UNIVERSITY',
        attendanceRate: 100,
        averageScore: 90,
        attendanceThresholdMet: true,
        outcome: 'PASS',
        outcomeReason: 'Requirements met',
        evaluatedAt: new Date(),
      });
    }
  }

  if (!passEval) {
    throw new Error('Fatal: No PASS evaluation found from Phase 12 fixtures.');
  }

  // Clear existing certificate on this specific evaluation if any, so issuance is clean
  await Certificate.deleteMany({ evaluation: passEval._id });

  const results = [];
  function assert(testId, name, pass, detail = '') {
    results.push({ testId, name, pass: Boolean(pass), detail });
    console.log(`[${pass ? '✓ PASS' : '✗ FAIL'}] Test ${testId}: ${name} ${detail ? `(${detail})` : ''}`);
  }

  // -------------------------------------------------------------
  // SUITE 1: UNAUTHENTICATED ACCESS (401)
  // -------------------------------------------------------------
  console.log('--- Suite 1: Unauthenticated Requests (401) ---');
  {
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, { method: 'POST' });
    assert('1.1', 'POST /admin/evaluations/:id/certificate unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates');
    assert('1.2', 'GET /admin/certificates unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates/6ab5876e5be31b38b9d96beb');
    assert('1.3', 'GET /admin/certificates/:id unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates/6ab5876e5be31b38b9d96beb/revoke', {
      method: 'PATCH',
      body: { reason: 'Test' },
    });
    assert('1.4', 'PATCH /admin/certificates/:id/revoke unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates/6ab5876e5be31b38b9d96beb/pdf');
    assert('1.5', 'GET /admin/certificates/:id/pdf unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }
  {
    const res = await request('/students/mine/certificates');
    assert('1.6', 'GET /students/mine/certificates unauthenticated returns 401', res.status === 401, `Status: ${res.status}`);
  }

  // -------------------------------------------------------------
  // SUITE 2: ROLE AUTHORIZATION & PERMISSION BOUNDARIES (403)
  // -------------------------------------------------------------
  console.log('\n--- Suite 2: Role Authorization Boundaries (403) ---');
  {
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('2.1', 'Student forbidden from issuing certificates (403)', res.status === 403, `Status: ${res.status}`);
  }
  {
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${instructorToken}` },
    });
    assert('2.2', 'Instructor forbidden from issuing certificates (403)', res.status === 403, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('2.3', 'Student forbidden from admin certificates list (403)', res.status === 403, `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/certificates/6ab5876e5be31b38b9d96beb/revoke', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { reason: 'Student revoke attempt' },
    });
    assert('2.4', 'Student forbidden from revoking certificates (403)', res.status === 403, `Status: ${res.status}`);
  }

  // -------------------------------------------------------------
  // SUITE 3: CROSS-DIVISION ISOLATION (403)
  // -------------------------------------------------------------
  console.log('\n--- Suite 3: Cross-Division Isolation (403) ---');
  {
    // University admin attempts to issue cert on Pre-University pass evaluation
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${uniToken}` },
    });
    assert('3.1', 'University admin forbidden from issuing Pre-University certificate (403)', res.status === 403, `Status: ${res.status}`);
  }
  {
    // Pre-University admin attempts to issue cert on University pass evaluation
    const res = await request(`/admin/evaluations/${uniPassEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('3.2', 'Pre-University admin forbidden from issuing University certificate (403)', res.status === 403, `Status: ${res.status}`);
  }

  // -------------------------------------------------------------
  // SUITE 4: INPUT VALIDATION & BUSINESS RULE REJECTIONS (400, 404)
  // -------------------------------------------------------------
  console.log('\n--- Suite 4: Business Rules & Validation (400, 404) ---');
  {
    const res = await request('/admin/evaluations/invalid-id/certificate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('4.1', 'Invalid evaluation ObjectId returns 400 or 500', [400, 500].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await request('/admin/evaluations/6ab5876e5be31b38b9d96000/certificate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('4.2', 'Non-existent evaluation ID returns 404', res.status === 404, `Status: ${res.status}`);
  }
  if (failEval) {
    const res = await request(`/admin/evaluations/${failEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('4.3', 'Certificate issuance on FAIL evaluation rejected with 400', res.status === 400, `Message: ${res.data?.error?.message || res.data?.message}`);
  } else {
    assert('4.3', 'FAIL evaluation test', true, 'Skipped (no fail evaluation)');
  }
  if (incompleteEval) {
    const res = await request(`/admin/evaluations/${incompleteEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('4.4', 'Certificate issuance on INCOMPLETE evaluation rejected with 400', res.status === 400, `Message: ${res.data?.error?.message || res.data?.message}`);
  } else {
    assert('4.4', 'INCOMPLETE evaluation test', true, 'Skipped');
  }

  // -------------------------------------------------------------
  // SUITE 5: VALID CERTIFICATE ISSUANCE & VERIFICATION TOKENS
  // -------------------------------------------------------------
  console.log('\n--- Suite 5: Valid Certificate Issuance ---');
  let issuedCert = null;
  {
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('5.1', 'Division Admin issues certificate for qualifying PASS evaluation (201)', res.status === 201, `Status: ${res.status}`);
    issuedCert = res.data?.data?.certificate;
    assert('5.2', 'Issued certificate contains unique serial number (CERT-PRE-...)', issuedCert?.serialNumber && issuedCert.serialNumber.startsWith('CERT-PRE-'), `Serial: ${issuedCert?.serialNumber}`);
    assert('5.3', 'Issued certificate contains unguessable verificationToken', issuedCert?.verificationToken && issuedCert.verificationToken.length >= 24, `Token: ${issuedCert?.verificationToken?.slice(0, 16)}...`);
    assert('5.4', 'Issued certificate status is ISSUED', issuedCert?.status === 'ISSUED');
  }

  // -------------------------------------------------------------
  // SUITE 6: DUPLICATE ISSUANCE PREVENTION (409 CONFLICT)
  // -------------------------------------------------------------
  console.log('\n--- Suite 6: Duplicate Issuance Prevention (409) ---');
  {
    const res = await request(`/admin/evaluations/${passEval._id}/certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('6.1', 'Re-issuing certificate for same evaluation returns 409 Conflict', res.status === 409, `Status: ${res.status}`);
    assert('6.2', 'Duplicate conflict message references existing serial number', res.data?.message?.includes(issuedCert.serialNumber) || res.data?.error?.message?.includes(issuedCert.serialNumber));
  }

  // -------------------------------------------------------------
  // SUITE 7: CERTIFICATES LISTING & SEARCHING
  // -------------------------------------------------------------
  console.log('\n--- Suite 7: Certificates Listing & Filters ---');
  {
    const res = await request('/admin/certificates', {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('7.1', 'Division Admin lists certificates in own division (200)', res.status === 200);
    const certs = res.data?.data?.certificates || [];
    assert('7.2', 'List contains newly issued certificate', certs.some((c) => c._id === issuedCert._id));
  }
  {
    const res = await request(`/admin/certificates?search=${issuedCert.serialNumber}`, {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    const certs = res.data?.data?.certificates || [];
    assert('7.3', 'Search by serialNumber returns target certificate', certs.length === 1 && certs[0].serialNumber === issuedCert.serialNumber);
  }
  {
    const res = await request('/admin/certificates?division=ALL', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('7.4', 'Super Admin lists certificates across all divisions (200)', res.status === 200);
  }

  // -------------------------------------------------------------
  // SUITE 8: CERTIFICATE DETAIL & PDF DOWNLOAD
  // -------------------------------------------------------------
  console.log('\n--- Suite 8: Certificate Detail & PDF Download ---');
  {
    const res = await request(`/admin/certificates/${issuedCert._id}`, {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('8.1', 'Admin retrieves certificate detail by ID (200)', res.status === 200 && res.data?.data?.certificate?._id === issuedCert._id);
  }
  {
    const res = await request(`/admin/certificates/${issuedCert._id}/pdf`, {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('8.2', 'Admin downloads certificate PDF (200, Content-Type: application/pdf)', res.status === 200 && res.headers['content-type']?.includes('application/pdf'), `Type: ${res.headers['content-type']}`);
    assert('8.3', 'Generated PDF buffer is valid and non-empty (>1KB)', res.rawBuffer?.length > 1000, `Buffer size: ${res.rawBuffer?.length} bytes`);
  }

  // -------------------------------------------------------------
  // SUITE 9: PUBLIC VERIFICATION ENDPOINT (PUBLIC, ZERO AUTH)
  // -------------------------------------------------------------
  console.log('\n--- Suite 9: Public Unauthenticated Verification ---');
  {
    // Verification by Token
    const res = await request(`/certificates/verify/${issuedCert.verificationToken}`);
    assert('9.1', 'Public verification endpoint works without auth token (200)', res.status === 200);
    const ver = res.data?.data;
    assert('9.2', 'Public verification confirms valid status (ISSUED, isValid: true)', ver?.isValid === true && ver?.status === 'ISSUED');
    assert('9.3', 'Public verification returns non-sensitive student and program details', Boolean(ver?.studentName) && Boolean(ver?.program?.title), `Student: ${ver?.studentName}`);
    assert('9.4', 'Public verification NEVER leaks email or phone numbers', ver?.studentEmail === undefined && ver?.phone === undefined && ver?.email === undefined);
    assert('9.5', 'Public verification NEVER leaks assessment/grade scores', ver?.averageScore === undefined && ver?.scores === undefined);
  }
  {
    // Verification by Serial Number
    const res = await request(`/certificates/verify/${issuedCert.serialNumber}`);
    assert('9.6', 'Public verification supports lookup by serialNumber', res.status === 200 && res.data?.data?.serialNumber === issuedCert.serialNumber);
  }
  {
    // Verification with non-existent token
    const res = await request('/certificates/verify/non-existent-token-123456');
    assert('9.7', 'Public verification for non-existent token returns found: false', res.status === 200 && res.data?.data?.found === false);
  }

  // -------------------------------------------------------------
  // SUITE 10: REVOCATION WORKFLOW & AUDIT TRAIL
  // -------------------------------------------------------------
  console.log('\n--- Suite 10: Revocation Workflow & Audit Trail ---');
  {
    // Revocation without reason rejected
    const res = await request(`/admin/certificates/${issuedCert._id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: { reason: '' },
    });
    assert('10.1', 'Revocation without required reason rejected with 400', res.status === 400);
  }
  {
    // Valid revocation
    const reasonText = 'Academic honesty re-check: falsified documentation during enrollment audit.';
    const res = await request(`/admin/certificates/${issuedCert._id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: { reason: reasonText },
    });
    assert('10.2', 'Division Admin revokes certificate with reason (200)', res.status === 200);
    const revoked = res.data?.data?.certificate;
    assert('10.3', 'Certificate status updated to REVOKED with timestamp & reason', revoked?.status === 'REVOKED' && revoked?.revocationReason === reasonText);
  }
  {
    // Revoking already revoked certificate rejected (irreversible)
    const res = await request(`/admin/certificates/${issuedCert._id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: { reason: 'Trying again' },
    });
    assert('10.4', 'Second revocation attempt on already revoked certificate rejected with 400', res.status === 400);
  }
  {
    // Public verification now shows REVOKED
    const res = await request(`/certificates/verify/${issuedCert.verificationToken}`);
    const ver = res.data?.data;
    assert('10.5', 'Public verification now reports certificate as REVOKED (isValid: false)', ver?.status === 'REVOKED' && ver?.isValid === false);
    assert('10.6', 'Public verification displays revocation date and reason', Boolean(ver?.revokedAt) && Boolean(ver?.revocationReason));
  }
  {
    // Audit Log verification
    const auditIssue = await AuditLog.findOne({ action: 'CERTIFICATE_ISSUED', resourceId: issuedCert._id });
    const auditRevoke = await AuditLog.findOne({ action: 'CERTIFICATE_REVOKED', resourceId: issuedCert._id });
    assert('10.7', 'CERTIFICATE_ISSUED audit log record exists in database', Boolean(auditIssue), `Action: ${auditIssue?.action}`);
    assert('10.8', 'CERTIFICATE_REVOKED audit log record exists in database', Boolean(auditRevoke), `Action: ${auditRevoke?.action}`);
  }

  // -------------------------------------------------------------
  // SUITE 11: STUDENT SELF-SERVICE & ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- Suite 11: Student Self-Service & Isolation ---');
  const recipientEmail = passEval.student?.email || 'student2.eval@esa.dev';
  const recipientToken = await login(recipientEmail);
  {
    const res = await request('/students/mine/certificates', {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert('11.1', 'Recipient student retrieves own certificates list (200)', res.status === 200);
    const certs = res.data?.data?.certificates || [];
    assert('11.2', 'Recipient student list contains their issued certificate', certs.some((c) => c._id === issuedCert._id));
  }
  {
    const res = await request(`/students/mine/certificates/${issuedCert._id}/pdf`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert('11.3', 'Recipient student downloads own certificate PDF (200, application/pdf)', res.status === 200 && res.headers['content-type']?.includes('application/pdf'));
    assert('11.4', 'Student PDF payload is non-empty (>1000 bytes)', res.rawBuffer?.length > 1000, `Size: ${res.rawBuffer?.length} bytes`);
  }
  {
    // Unrelated student attempts to download another student's certificate
    const res = await request(`/students/mine/certificates/${issuedCert._id}/pdf`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('11.5', 'Unrelated student forbidden from downloading another student certificate (403)', res.status === 403, `Status: ${res.status}`);
  }

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.pass);
  const passedCount = results.filter((r) => r.pass).length;
  console.log(`PHASE 13 API MATRIX RESULT: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

runApiMatrix().catch((err) => {
  console.error('Fatal API Matrix Execution Error:', err);
  process.exit(1);
});
