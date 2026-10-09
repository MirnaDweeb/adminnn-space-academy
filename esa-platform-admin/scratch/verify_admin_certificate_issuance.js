require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const mongoose = require('../backend/node_modules/mongoose');
const path = require('path');
const fs = require('fs');

const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Enrollment = require('../backend/src/models/Enrollment');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const AuditLog = require('../backend/src/models/AuditLog');
const { ROLES } = require('../backend/src/constants/roles');
const { DIVISIONS } = require('../backend/src/constants/divisions');
const { PERMISSIONS } = require('../backend/src/constants/permissions');
const { EVALUATION_OUTCOME, CERTIFICATE_STATUS } = require('../backend/src/constants/statuses');
const generateToken = require('../backend/src/utils/generateToken');

const BASE_URL = 'http://localhost:5000/api';

async function fetchApi(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

let passedTests = 0;
let totalTests = 0;

function assert(description, condition, extraInfo = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${description} ${extraInfo ? `(${extraInfo})` : ''}`);
  } else {
    console.error(`[FAIL] ${description} ${extraInfo ? `— Extra: ${extraInfo}` : ''}`);
  }
}

async function run() {
  console.log('========================================================================');
  console.log('ADMIN CERTIFICATE ISSUANCE — VERIFICATION & PERMISSION MATRIX');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/esa_academy';
  await mongoose.connect(mongoUri);
  console.log('[db] Connected to MongoDB for fixture verification\n');

  // Find or use seeded users
  const superAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN }).select('+passwordHash');
  const preUniAdmin = await User.findOne({ role: ROLES.PRE_UNIVERSITY_ADMIN, email: 'preuni.admin@esa.dev' });
  const uniAdmin = await User.findOne({ role: ROLES.UNIVERSITY_ADMIN, email: 'uni.admin@esa.dev' });

  assert('Setup: Super Admin exists', Boolean(superAdmin));
  assert('Setup: Pre-Uni Admin exists', Boolean(preUniAdmin));
  assert('Setup: Uni Admin exists', Boolean(uniAdmin));

  const superAdminToken = generateToken(superAdmin);
  const preUniAdminToken = generateToken(preUniAdmin);
  const uniAdminToken = generateToken(uniAdmin);

  // Provision an Admin WITHOUT CERTIFICATES_MANAGE permission
  let restrictedAdmin = await User.findOne({ email: 'nocerts.admin@esa.dev' });
  if (!restrictedAdmin) {
    restrictedAdmin = await User.create({
      fullName: 'No Certs Admin',
      email: 'nocerts.admin@esa.dev',
      passwordHash: superAdmin.passwordHash,
      role: ROLES.PRE_UNIVERSITY_ADMIN,
      division: DIVISIONS.PRE_UNIVERSITY,
      permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.CERTIFICATES_VIEW], // View only, no manage
      isActive: true,
    });
  } else {
    restrictedAdmin.permissions = [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.CERTIFICATES_VIEW];
    await restrictedAdmin.save();
  }
  const restrictedAdminToken = generateToken(restrictedAdmin);
  assert('Setup: Restricted Admin without CERTIFICATES_MANAGE configured', Boolean(restrictedAdmin));

  // Find or create test programs, cohorts, and evaluations in both divisions
  let preUniProgram = await Course.findOne({ division: DIVISIONS.PRE_UNIVERSITY });
  let uniProgram = await Course.findOne({ division: DIVISIONS.UNIVERSITY });

  // Test students
  let studentPreUni = await User.findOne({ role: ROLES.STUDENT, email: 'student.preuni.cert@esa.dev' });
  if (!studentPreUni) {
    studentPreUni = await User.create({
      fullName: 'Pre-Uni Cert Student',
      email: 'student.preuni.cert@esa.dev',
      passwordHash: superAdmin.passwordHash,
      role: ROLES.STUDENT,
      division: DIVISIONS.PRE_UNIVERSITY,
      isActive: true,
    });
  }

  let studentUni = await User.findOne({ role: ROLES.STUDENT, email: 'student.uni.cert@esa.dev' });
  if (!studentUni) {
    studentUni = await User.create({
      fullName: 'Uni Cert Student',
      email: 'student.uni.cert@esa.dev',
      passwordHash: superAdmin.passwordHash,
      role: ROLES.STUDENT,
      division: DIVISIONS.UNIVERSITY,
      isActive: true,
    });
  }

  // Find or create test enrollments
  let preUniEnrollment = await Enrollment.findOne({ division: DIVISIONS.PRE_UNIVERSITY });
  let uniEnrollment = await Enrollment.findOne({ division: DIVISIONS.UNIVERSITY });

  // Pre-Uni Cohort & Evaluation
  let preUniCohort = await Cohort.findOne({ division: DIVISIONS.PRE_UNIVERSITY });
  let preUniEval = await Evaluation.findOne({ student: studentPreUni._id, outcome: EVALUATION_OUTCOME.PASS });
  if (!preUniEval) {
    preUniEval = await Evaluation.create({
      student: studentPreUni._id,
      cohort: preUniCohort._id,
      program: preUniProgram._id,
      enrollment: preUniEnrollment?._id,
      division: DIVISIONS.PRE_UNIVERSITY,
      outcome: EVALUATION_OUTCOME.PASS,
      averageScore: 92,
      attendanceRate: 95,
      attendanceThresholdMet: true,
      evaluatedBy: preUniAdmin._id,
      evaluatedAt: new Date(),
    });
  }

  // Clean any pre-existing certificates for this evaluation to start fresh
  await Certificate.deleteMany({ evaluation: preUniEval._id });

  // Uni Cohort & Evaluation
  let uniCohort = await Cohort.findOne({ division: DIVISIONS.UNIVERSITY });
  let uniEval = await Evaluation.findOne({ student: studentUni._id, outcome: EVALUATION_OUTCOME.PASS });
  if (!uniEval) {
    uniEval = await Evaluation.create({
      student: studentUni._id,
      cohort: uniCohort._id,
      program: uniProgram._id,
      enrollment: uniEnrollment?._id,
      division: DIVISIONS.UNIVERSITY,
      outcome: EVALUATION_OUTCOME.PASS,
      averageScore: 88,
      attendanceRate: 90,
      attendanceThresholdMet: true,
      evaluatedBy: uniAdmin._id,
      evaluatedAt: new Date(),
    });
  }
  await Certificate.deleteMany({ evaluation: uniEval._id });

  // Ineligible evaluation (FAIL)
  let failEval = await Evaluation.findOne({ outcome: EVALUATION_OUTCOME.FAIL });
  if (!failEval) {
    failEval = await Evaluation.create({
      student: studentPreUni._id,
      cohort: preUniCohort._id,
      program: preUniProgram._id,
      enrollment: preUniEnrollment?._id,
      division: DIVISIONS.PRE_UNIVERSITY,
      outcome: EVALUATION_OUTCOME.FAIL,
      averageScore: 45,
      attendanceRate: 50,
      attendanceThresholdMet: false,
      evaluatedBy: preUniAdmin._id,
      evaluatedAt: new Date(),
    });
  }

  console.log('\n--- Section 1: Super Admin Certificate Capabilities ---');
  // 1.1 List certificates
  const superListRes = await fetchApi(`${BASE_URL}/admin/certificates`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('1.1 Super Admin lists certificates -> 200', superListRes.status === 200);

  // 1.2 Eligible list
  const superEligibleRes = await fetchApi(`${BASE_URL}/admin/certificates/eligible`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert('1.2 Super Admin gets eligible completions -> 200', superEligibleRes.status === 200 && Array.isArray(superEligibleRes.data?.data?.eligible));

  console.log('\n--- Section 2: Pre-University Admin with CERTIFICATES_MANAGE ---');
  // 2.1 View eligible completions in Pre-University
  const preUniEligibleRes = await fetchApi(`${BASE_URL}/admin/certificates/eligible`, {
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('2.1 Pre-Uni Admin lists eligible completions -> 200', preUniEligibleRes.status === 200);
  const preUniEligible = preUniEligibleRes.data?.data?.eligible || [];
  const foundPreUniCandidate = preUniEligible.some((e) => String(e._id) === String(preUniEval._id));
  assert('2.2 Eligible list contains qualifying Pre-University evaluation', foundPreUniCandidate);

  // 2.3 Pre-Uni Admin CANNOT issue University certificate (Cross-division protection)
  const crossDivRes = await fetchApi(`${BASE_URL}/admin/evaluations/${uniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('2.3 Pre-Uni Admin issuing University certificate -> 403 Forbidden', crossDivRes.status === 403, `Status: ${crossDivRes.status}`);

  // 2.4 Pre-Uni Admin issues eligible Pre-University certificate
  const preUniIssueRes = await fetchApi(`${BASE_URL}/admin/evaluations/${preUniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('2.4 Pre-Uni Admin issues Pre-University certificate -> 201 Created', preUniIssueRes.status === 201, `Status: ${preUniIssueRes.status}`);
  const preUniCert = preUniIssueRes.data?.data?.certificate;
  assert('2.5 Serial number format matches CERT-PRE-YYYY-XXXXXX', /^CERT-PRE-\d{4}-\d{6}$/.test(preUniCert?.serialNumber), `Serial: ${preUniCert?.serialNumber}`);
  assert('2.6 Verification token generated', Boolean(preUniCert?.verificationToken));

  // 2.7 Verify Audit Log
  const preUniAudit = await AuditLog.findOne({ resource: 'Certificate', resourceId: preUniCert?._id, action: 'CERTIFICATE_ISSUED' });
  assert('2.7 Audit log recorded CERTIFICATE_ISSUED with Pre-Uni admin actor', Boolean(preUniAudit) && String(preUniAudit.user) === String(preUniAdmin._id));

  console.log('\n--- Section 3: University Admin with CERTIFICATES_MANAGE ---');
  const tempStudent = await User.create({ fullName: 'Temp PreUni', email: `temp${Date.now()}@esa.dev`, passwordHash: superAdmin.passwordHash, role: ROLES.STUDENT, division: DIVISIONS.PRE_UNIVERSITY });
  const tempPreUniEval = await Evaluation.create({
    student: tempStudent._id,
    cohort: preUniCohort._id,
    program: preUniProgram._id,
    enrollment: preUniEnrollment?._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    outcome: EVALUATION_OUTCOME.PASS,
    averageScore: 90,
    attendanceRate: 100,
    attendanceThresholdMet: true,
  });

  const uniCrossDivRes = await fetchApi(`${BASE_URL}/admin/evaluations/${tempPreUniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${uniAdminToken}` },
  });
  assert('3.1 Uni Admin issuing Pre-University certificate -> 403 Forbidden', uniCrossDivRes.status === 403, `Status: ${uniCrossDivRes.status}`);

  // 3.2 Uni Admin issues eligible University certificate
  const uniIssueRes = await fetchApi(`${BASE_URL}/admin/evaluations/${uniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${uniAdminToken}` },
  });
  assert('3.2 Uni Admin issues University certificate -> 201 Created', uniIssueRes.status === 201, `Status: ${uniIssueRes.status}`);
  const uniCert = uniIssueRes.data?.data?.certificate;
  assert('3.3 Serial number format matches CERT-UNI-YYYY-XXXXXX', /^CERT-UNI-\d{4}-\d{6}$/.test(uniCert?.serialNumber), `Serial: ${uniCert?.serialNumber}`);

  const uniAudit = await AuditLog.findOne({ resource: 'Certificate', resourceId: uniCert?._id, action: 'CERTIFICATE_ISSUED' });
  assert('3.4 Audit log recorded CERTIFICATE_ISSUED with Uni admin actor', Boolean(uniAudit) && String(uniAudit.user) === String(uniAdmin._id));

  console.log('\n--- Section 4: Admin Without CERTIFICATES_MANAGE Permission ---');
  // 4.1 Restricted Admin can view certificates (CERTIFICATES_VIEW granted)
  const restViewRes = await fetchApi(`${BASE_URL}/admin/certificates`, {
    headers: { Authorization: `Bearer ${restrictedAdminToken}` },
  });
  assert('4.1 Admin with CERTIFICATES_VIEW can view certificates -> 200', restViewRes.status === 200);

  // 4.2 Restricted Admin CANNOT issue certificate (CERTIFICATES_MANAGE missing)
  const restIssueRes = await fetchApi(`${BASE_URL}/admin/evaluations/${tempPreUniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${restrictedAdminToken}` },
  });
  assert('4.2 Admin without CERTIFICATES_MANAGE cannot issue certificate -> 403 Forbidden', restIssueRes.status === 403, `Status: ${restIssueRes.status}`);

  // 4.3 Restricted Admin CANNOT revoke certificate
  const restRevokeRes = await fetchApi(`${BASE_URL}/admin/certificates/${preUniCert._id}/revoke`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${restrictedAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Unauthorized attempt' }),
  });
  assert('4.3 Admin without CERTIFICATES_MANAGE cannot revoke certificate -> 403 Forbidden', restRevokeRes.status === 403, `Status: ${restRevokeRes.status}`);

  console.log('\n--- Section 5: Duplicate Protection & Ineligible Validation ---');
  // 5.1 Attempt duplicate issuance for the same evaluation
  const duplicateRes = await fetchApi(`${BASE_URL}/admin/evaluations/${preUniEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('5.1 Duplicate certificate issuance rejected with 409 Conflict', duplicateRes.status === 409, `Status: ${duplicateRes.status}`);

  // 5.2 Attempt issuance for FAIL evaluation
  const failIssueRes = await fetchApi(`${BASE_URL}/admin/evaluations/${failEval._id}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('5.2 Ineligible (FAIL) evaluation rejected with 400 Bad Request', failIssueRes.status === 400, `Status: ${failIssueRes.status}`);

  // 5.3 Attempt issuance for non-existent evaluation
  const fakeId = new mongoose.Types.ObjectId();
  const nonExistentRes = await fetchApi(`${BASE_URL}/admin/evaluations/${fakeId}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('5.3 Non-existent evaluation rejected with 404 Not Found', nonExistentRes.status === 404, `Status: ${nonExistentRes.status}`);

  console.log('\n--- Section 6: Public Verification & PDF Generation ---');
  // 6.1 Public unauthenticated verification
  const verifyRes = await fetchApi(`${BASE_URL}/certificates/verify/${preUniCert.verificationToken}`);
  assert('6.1 Public verification endpoint accessible without auth -> 200', verifyRes.status === 200);
  const verifyData = verifyRes.data?.data;
  assert('6.2 Verification returns valid status and serial number', verifyData?.status === CERTIFICATE_STATUS.ISSUED && verifyData?.serialNumber === preUniCert.serialNumber);
  assert('6.3 Public verification does NOT expose sensitive student fields (no phone, password, national ID)',
    !verifyData?.student?.password && !verifyData?.student?.phone && !verifyData?.student?.nationalId
  );

  // 6.4 PDF Generation
  const pdfRes = await fetch(`${BASE_URL}/admin/certificates/${preUniCert._id}/pdf`, {
    headers: { Authorization: `Bearer ${preUniAdminToken}` },
  });
  assert('6.4 Admin can download certificate PDF -> 200', pdfRes.status === 200);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  assert('6.5 PDF begins with %PDF magic header', pdfBuffer.slice(0, 4).toString() === '%PDF');

  console.log('\n--- Section 7: Certificate Revocation by Authorized Admin ---');
  // 7.1 Revoke Pre-University Certificate by Pre-University Admin
  const revokeRes = await fetchApi(`${BASE_URL}/admin/certificates/${preUniCert._id}/revoke`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${preUniAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Administrative academic audit revocation' }),
  });
  assert('7.1 Pre-Uni Admin revokes certificate -> 200', revokeRes.status === 200);

  const revokeAudit = await AuditLog.findOne({ resource: 'Certificate', resourceId: preUniCert._id, action: 'CERTIFICATE_REVOKED' });
  assert('7.2 Audit log recorded CERTIFICATE_REVOKED', Boolean(revokeAudit));

  // 7.3 Public verification reflects REVOKED
  const verifyRevokedRes = await fetchApi(`${BASE_URL}/certificates/verify/${preUniCert.verificationToken}`);
  assert('7.3 Public verification now displays REVOKED status', verifyRevokedRes.data?.data?.status === CERTIFICATE_STATUS.REVOKED);

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(totalTests === passedTests ? 0 : 1);
}

run().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
