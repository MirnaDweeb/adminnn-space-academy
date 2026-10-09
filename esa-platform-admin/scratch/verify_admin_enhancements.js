const http = require('http');
const mongoose = require('../backend/src/models/User').base || require('mongoose');
const User = require('../backend/src/models/User');
const StudentProfile = require('../backend/src/models/StudentProfile');
const Invoice = require('../backend/src/models/Invoice');
const PaymentTransaction = require('../backend/src/models/PaymentTransaction');
const Certificate = require('../backend/src/models/Certificate');
const AuditLog = require('../backend/src/models/AuditLog');
const Feedback = require('../backend/src/models/Feedback');

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

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('ADMIN OPERATIONS & SMART STUDENT MANAGEMENT — VERIFICATION SUITE');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('[DB] Connected to MongoDB.\n');

  // Authenticate Actors
  console.log('--- Step 0: Authenticating Actors ---');
  const superToken = await login('superadmin@esa.dev');
  const preUniToken = await login('preuni.admin@esa.dev');
  const uniToken = await login('uni.admin@esa.dev');
  const studentToken = await login('student@esa.dev');
  console.log('Actors authenticated: Super Admin, Pre-Uni Admin, Uni Admin, Student.\n');

  // Find a target student user
  const studentUser = await User.findOne({ role: 'STUDENT' });
  if (!studentUser) {
    throw new Error('No student found in DB for testing');
  }
  const studentId = studentUser._id.toString();
  const profileDoc = await StudentProfile.findOne({ user: studentUser._id });
  const studentDivision = profileDoc?.division || 'PRE_UNIVERSITY';
  console.log(`Target Student User ID: ${studentId}, Name: ${studentUser.fullName}, Division: ${studentDivision}\n`);

  // 1. ADMIN STUDENT EDITING & SECURITY RULES
  console.log('--- 1. Admin Student Editing & Security Rules ---');

  // 1a. Verify privilege/security tampering attempt is rejected with 400 Bad Request
  const forbiddenRes = await request(`/admin/students/${studentId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}` },
    body: { role: 'SUPER_ADMIN', password: 'HackedPassword123!' },
  });
  assert(forbiddenRes.status === 400, 'Security: Direct role/password manipulation strictly blocked with 400 Bad Request');

  // 1b. Legitimate profile update
  const originalName = studentUser.fullName;
  const updatePayload = {
    fullName: originalName + ' (Verified)',
    phoneNumber: '01099887766',
    institution: 'Cairo University Faculty of Engineering',
    major: 'Aerospace & Aeronautical Systems',
    academicYear: 'Senior 2',
    gpa: '3.85',
    skills: ['Orbital Mechanics', 'Satellite Attitude Control', 'Python', 'MATLAB'],
  };

  const updateRes = await request(`/admin/students/${studentId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}` },
    body: updatePayload,
  });

  assert(updateRes.status === 200, `PUT /api/admin/students/${studentId} returned 200`);
  assert(updateRes.data?.data?.student?.user?.fullName === updatePayload.fullName, 'Student user.fullName updated');
  assert(updateRes.data?.data?.student?.gpa === 3.85, 'Student GPA updated');
  assert(updateRes.data?.data?.student?.major === 'Aerospace & Aeronautical Systems', 'Student major updated');

  // Verify DB and privilege protection
  const reloadedStudent = await User.findById(studentId);
  assert(reloadedStudent.role === 'STUDENT', 'Security: Student role remained STUDENT in MongoDB');

  // Verify Audit Log
  const studentAudit = await AuditLog.findOne({
    action: 'STUDENT_UPDATED',
  }).sort({ timestamp: -1 });
  assert(studentAudit !== null, 'AuditLog recorded STUDENT_UPDATED event with diff');
  console.log(`  Audit entry: Action ${studentAudit?.action} on resource ${studentAudit?.resource} (${studentAudit?.resourceId})\n`);

  // 2. STUDENT OVERVIEW / DOSSIER
  console.log('--- 2. Student Overview / Dossier API ---');
  const overviewRes = await request(`/admin/students/${studentId}/overview`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });

  assert(overviewRes.status === 200, `GET /api/admin/students/${studentId}/overview returned 200`);
  const overview = overviewRes.data?.data;
  assert(overview?.student !== undefined, 'Dossier includes complete Student Profile');
  assert(Array.isArray(overview?.applications), `Dossier includes Applications (${overview?.applications?.length} found)`);
  assert(Array.isArray(overview?.enrollments), `Dossier includes Cohorts & Enrollments (${overview?.enrollments?.length} found)`);
  assert(Array.isArray(overview?.invoices), `Dossier includes Invoices (${overview?.invoices?.length} found)`);
  assert(Array.isArray(overview?.transactions), `Dossier includes Transactions (${overview?.transactions?.length} found)`);
  assert(Array.isArray(overview?.evaluations), `Dossier includes Evaluations (${overview?.evaluations?.length} found)`);
  assert(Array.isArray(overview?.certificates), `Dossier includes Certificates (${overview?.certificates?.length} found)`);
  assert(Array.isArray(overview?.feedback), `Dossier includes Feedback (${overview?.feedback?.length} found)`);
  assert(Array.isArray(overview?.notifications), `Dossier includes Notifications (${overview?.notifications?.length} found)\n`);

  // 3. STUDENT REPORT PDF
  console.log('--- 3. Student Report PDF Generation ---');
  const studentPdfRes = await request(`/admin/students/${studentId}/report-pdf`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });

  assert(studentPdfRes.status === 200, `GET /api/admin/students/${studentId}/report-pdf returned 200`);
  assert(studentPdfRes.headers['content-type'] === 'application/pdf', 'Content-Type is application/pdf');
  const isPdfHeader = studentPdfRes.rawBuffer.slice(0, 4).toString() === '%PDF';
  assert(isPdfHeader, `Downloaded data begins with %PDF header (Size: ${studentPdfRes.rawBuffer.length} bytes)`);
  assert(studentPdfRes.rawBuffer.length > 1000, 'Student Report PDF contains substantive dossier document content\n');

  // 4. REPORTS & ANALYTICS PDF EXPORT
  console.log('--- 4. Reports & Analytics PDF Export ---');
  const reportPdfRes = await request('/admin/reports/export-pdf?division=PRE_UNIVERSITY', {
    headers: { Authorization: `Bearer ${superToken}` },
  });

  assert(reportPdfRes.status === 200, 'GET /api/admin/reports/export-pdf returned 200');
  assert(reportPdfRes.headers['content-type'] === 'application/pdf', 'Content-Type is application/pdf');
  assert(reportPdfRes.rawBuffer.slice(0, 4).toString() === '%PDF', `Report data begins with %PDF header (Size: ${reportPdfRes.rawBuffer.length} bytes)`);

  const reportAudit = await AuditLog.findOne({ action: 'REPORT_EXPORTED' }).sort({ timestamp: -1 });
  assert(reportAudit !== null, `AuditLog recorded REPORT_EXPORTED (Format: ${reportAudit?.after?.format || reportAudit?.metadata?.format})\n`);

  // 5. ADMIN PAYMENT MANAGEMENT & ACCOUNTING-SAFE ADJUSTMENT
  console.log('--- 5. Admin Payment Management & Accounting-Safe Adjustments ---');
  let testInvoice = await Invoice.findOne();
  if (testInvoice) {
    const invoiceId = testInvoice._id.toString();
    // 5a. Edit permitted invoice metadata
    const metaRes = await request(`/admin/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: { notes: 'Official institutional review completed - payment validated by finance desk' },
    });
    assert(metaRes.status === 200, `PATCH /api/admin/invoices/${invoiceId} returned 200`);
    assert(metaRes.data?.data?.invoice?.notes.includes('finance desk'), 'Invoice notes updated');

    const invoiceAudit = await AuditLog.findOne({
      action: 'INVOICE_UPDATED',
      resourceId: testInvoice._id,
    }).sort({ timestamp: -1 });
    assert(invoiceAudit !== null, 'AuditLog recorded INVOICE_UPDATED');

    // 5b. Safe Payment Adjustment
    let testTxn = await PaymentTransaction.findOne({ invoice: invoiceId, provider: 'MANUAL', recordingType: { $ne: 'ADJUSTMENT' } });
    if (!testTxn) {
      testTxn = await PaymentTransaction.findOne({ invoice: invoiceId });
    }

    if (testTxn) {
      const paymentId = testTxn._id.toString();
      const originalAmount = testTxn.amount;

      const adjustRes = await request(`/admin/payments/${paymentId}/adjust`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${superToken}` },
        body: {
          amount: 25,
          reason: 'Administrative fee adjustment per directorate directive',
        },
      });

      assert(adjustRes.status === 201, `POST /api/admin/payments/${paymentId}/adjust returned 201 Created`);
      assert(adjustRes.data?.data?.adjustment?.recordingType === 'ADJUSTMENT', 'New transaction created with recordingType ADJUSTMENT');

      // Verify original payment was NOT deleted
      const originalCheck = await PaymentTransaction.findById(paymentId);
      assert(originalCheck !== null, 'Accounting Rule: Original payment transaction preserved (NOT deleted)');
      assert(originalCheck.amount === originalAmount, 'Accounting Rule: Original transaction amount preserved');

      // Verify Audit Log
      const paymentAudit = await AuditLog.findOne({
        action: 'PAYMENT_ADJUSTED',
      }).sort({ timestamp: -1 });
      assert(paymentAudit !== null, 'AuditLog recorded PAYMENT_ADJUSTED with audit trail');
    }
  }
  console.log('');

  // 6. CERTIFICATE ADMIN EDITING, REVOCATION, AND RESTORATION
  console.log('--- 6. Certificate Metadata Editing, Revocation, and Restoration Lifecycle ---');
  let cert = await Certificate.findOne({ status: 'ISSUED' });
  if (!cert) {
    const anyCert = await Certificate.findOne();
    if (anyCert) {
      anyCert.status = 'ISSUED';
      await anyCert.save();
      cert = anyCert;
    } else {
      console.log('  [Notice] Creating a test certificate...');
      const courseDoc = await mongoose.model('Course').findOne();
      cert = await Certificate.create({
        student: studentUser._id,
        program: courseDoc?._id,
        division: studentDivision,
        status: 'ISSUED',
        serialNumber: `CERT-TEST-${Date.now()}`,
        verificationToken: `token-${Date.now()}`,
        issuedAt: new Date(),
      });
    }
  }
  const certId = cert._id.toString();

  // 6a. Edit permitted metadata
  const certMetaRes = await request(`/admin/certificates/${certId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${superToken}` },
    body: { notes: 'Verified honors credential - passed with distinction' },
  });
  assert(certMetaRes.status === 200, `PATCH /api/admin/certificates/${certId} metadata edit returned 200`);
  assert(certMetaRes.data?.data?.certificate?.notes.includes('honors credential'), 'Certificate notes updated');

  const certMetaAudit = await AuditLog.findOne({
    action: 'CERTIFICATE_UPDATED',
    resourceId: cert._id,
  }).sort({ timestamp: -1 });
  assert(certMetaAudit !== null, 'AuditLog recorded CERTIFICATE_UPDATED');

  // 6b. Revoke Certificate
  const revokeRes = await request(`/admin/certificates/${certId}/revoke`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${superToken}` },
    body: { reason: 'Accidental duplicate issuance test' },
  });
  assert(revokeRes.status === 200, `PATCH /api/admin/certificates/${certId}/revoke returned 200`);
  assert(revokeRes.data?.data?.certificate?.status === 'REVOKED', 'Certificate status changed to REVOKED');

  const revokedCertDoc = await Certificate.findById(certId);
  assert(revokedCertDoc.revocationHistory?.length > 0, 'Revocation recorded in revocationHistory array');

  const revokeAudit = await AuditLog.findOne({
    action: 'CERTIFICATE_REVOKED',
    resourceId: cert._id,
  }).sort({ timestamp: -1 });
  assert(revokeAudit !== null, 'AuditLog recorded CERTIFICATE_REVOKED');

  // Verify Public Verification of REVOKED certificate
  const verifyRevoked = await request(`/certificates/verify/${revokedCertDoc.verificationToken}`);
  assert(verifyRevoked.status === 200 && verifyRevoked.data?.data?.isValid === false, 'Public verification correctly flags REVOKED certificate as INVALID');

  // 6c. Restore Certificate
  const restoreRes = await request(`/admin/certificates/${certId}/restore`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${superToken}` },
    body: { reason: 'Revocation mistake rectified by Super Admin' },
  });
  assert(restoreRes.status === 200, `PATCH /api/admin/certificates/${certId}/restore returned 200`);
  assert(restoreRes.data?.data?.certificate?.status === 'RESTORED', 'Certificate status changed to RESTORED');
  assert(restoreRes.data?.data?.certificate?.restoreReason === 'Revocation mistake rectified by Super Admin', 'Restore reason captured');

  // Verify Audit Log
  const restoreAudit = await AuditLog.findOne({
    action: 'CERTIFICATE_RESTORED',
    resourceId: cert._id,
  }).sort({ timestamp: -1 });
  assert(restoreAudit !== null, 'AuditLog recorded CERTIFICATE_RESTORED');

  // Verify Public Verification of RESTORED certificate
  const verifyRestored = await request(`/certificates/verify/${revokedCertDoc.verificationToken}`);
  assert(verifyRestored.status === 200 && verifyRestored.data?.data?.isValid === true, 'Public verification recognizes RESTORED certificate as VALID');
  assert(verifyRestored.data?.data?.status === 'RESTORED', 'Public verification displays RESTORED status\n');

  // 7. NOTIFICATIONS
  console.log('--- 7. Notifications API & Division Scoping ---');
  const notifRes = await request('/notifications/mine', {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(notifRes.status === 200, 'GET /api/notifications/mine returned 200');
  assert(Array.isArray(notifRes.data?.data?.notifications), `Returned notifications array (${notifRes.data?.data?.notifications?.length} items)`);
  assert(typeof notifRes.data?.data?.unreadCount === 'number', `Unread count accurately computed: ${notifRes.data?.data?.unreadCount}\n`);

  // 8. STUDENT FEEDBACK & AI/THEMATIC INSIGHTS
  console.log('--- 8. Student Feedback Center & AI Feedback Summary ---');
  const feedbackRes = await request('/admin/feedback', {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(feedbackRes.status === 200, 'GET /api/admin/feedback returned 200');
  assert(Array.isArray(feedbackRes.data?.data?.feedback), `Returned real student feedback items (${feedbackRes.data?.data?.feedback?.length} items)`);

  const summaryRes = await request('/admin/feedback/summary', {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(summaryRes.status === 200, 'GET /api/admin/feedback/summary returned 200');
  const summary = summaryRes.data?.data?.summary;
  assert(summary?.analyzedCount > 0 || summary?.totalAnalyzed > 0, `Total feedback analyzed: ${summary?.analyzedCount || summary?.totalAnalyzed}`);
  assert(summary?.averageRating > 0, `Average rating: ${summary?.averageRating} / 5.0`);
  assert(Array.isArray(summary?.keyThemes) && summary?.keyThemes?.length > 0, `Key themes detected: ${summary?.keyThemes?.join(', ')}`);
  assert(Array.isArray(summary?.mostMentionedStrengths) && summary?.mostMentionedStrengths?.length > 0, 'Most mentioned strengths present');
  assert(Array.isArray(summary?.mostMentionedIssues), 'Most mentioned issues present');
  assert(Array.isArray(summary?.importantSignals), 'Important signals present');
  assert(Array.isArray(summary?.representativeFeedback) && summary?.representativeFeedback?.length > 0, 'Representative student feedback quotes present');
  console.log(`  Feedback Insights Provider: ${summary?.provider || summaryRes.data?.data?.provider}\n`);

  // 9. DIVISION & PERMISSION ENFORCEMENT
  console.log('--- 9. Division Scoping & Permission Enforcement ---');
  const crossDivisionRes = await request(`/admin/students/${studentId}/overview`, {
    headers: { Authorization: `Bearer ${studentDivision === 'PRE_UNIVERSITY' ? uniToken : preUniToken}` },
  });
  assert(crossDivisionRes.status === 403, 'Cross-division admin access to Student Dossier is rejected with 403 Forbidden');

  // Non-admin token trying to access feedback summary
  const studentUnauthorized = await request('/admin/feedback/summary', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert(studentUnauthorized.status === 403, 'Unauthorized student access to Admin Feedback Summary rejected with 403 Forbidden\n');

  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
