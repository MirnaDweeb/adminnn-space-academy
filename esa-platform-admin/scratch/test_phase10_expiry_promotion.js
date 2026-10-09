const mongoose = require('../backend/node_modules/mongoose');

const BASE_URL = 'http://127.0.0.1:5000/api';
const SEED_PASSWORD = 'Password123!';

async function apiRequest(endpoint, { method = 'GET', body = null, token = null } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

async function login(email, password = SEED_PASSWORD) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return res.data.data.token;
}

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10: DEADLINE ENFORCEMENT & WAITLIST PROMOTION TEST');
  console.log('===============================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Invoice = mongoose.model('Invoice', new mongoose.Schema({}, { strict: false }));
  const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

  const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const preUniToken = await login('preuni.admin@esa.dev');

  // Find or create two students for PRE_UNIVERSITY
  const studentA = await User.findOne({ email: 'student@esa.dev' });
  let studentB = await User.findOne({ email: 'student_waitlist@esa.dev' });
  if (!studentB) {
    const bcrypt = require('../backend/node_modules/bcrypt');
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
    studentB = await User.create({
      fullName: 'Waitlisted Candidate B',
      email: 'student_waitlist@esa.dev',
      role: 'STUDENT',
      division: 'PRE_UNIVERSITY',
      passwordHash,
      isActive: true,
      createdAt: new Date(),
    });
  }

  // 1. Create a course with capacity = 1
  const testCourse = await Course.create({
    title: 'Phase10 Satellite Avionics 1-Seat',
    description: 'Strict 1-seat capacity to test deadline expiry and waitlist promotion',
    division: 'PRE_UNIVERSITY',
    targetAudience: 'Secondary Students',
    price: 3000,
    capacity: 1,
    occupiedSeats: 0,
    deliveryMode: 'ONSITE',
    level: 'ADVANCED',
    status: 'ACTIVE',
    createdBy: preUniAdmin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`[1] Created 1-Seat Program: "${testCourse.title}" (Capacity: 1)`);

  // 2. Student A applies & enrolls -> Occupies seat 1/1, status: PENDING_PAYMENT
  const appA = await Application.create({
    student: studentA._id,
    program: testCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: new Date(),
    createdAt: new Date(Date.now() - 10000),
  });

  const enrollARes = await apiRequest(`/admin/applications/${appA._id}/enroll`, {
    method: 'POST',
    token: preUniToken,
  });
  const enrollmentA = enrollARes.data.data.enrollment;
  console.log(`[2] Student A enrolled: Status=${enrollmentA.status}, Occupied=${enrollARes.data.data.capacity.occupied}/1`);

  // 3. Student B applies & enrolls -> Capacity full, placed on FIFO waiting list
  const appB = await Application.create({
    student: studentB._id,
    program: testCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
    submittedAt: new Date(),
    createdAt: new Date(Date.now() - 5000),
  });

  const enrollBRes = await apiRequest(`/admin/applications/${appB._id}/enroll`, {
    method: 'POST',
    token: preUniToken,
  });
  const enrollmentB = enrollBRes.data.data.enrollment;
  console.log(`[3] Student B enrolled: Status=${enrollmentB.status}, Waitlisted=${enrollBRes.data.data.capacity.waitlisted}`);

  if (enrollmentB.status !== 'WAITLISTED') {
    throw new Error(`Expected Student B to be WAITLISTED, got ${enrollmentB.status}`);
  }

  // 4. Generate Invoice for Student A
  const invRes = await apiRequest(`/admin/enrollments/${enrollmentA._id}/invoice`, {
    method: 'POST',
    body: { dueAtHours: 72, notes: 'Seat reservation fee' },
    token: preUniToken,
  });
  const invoiceA = invRes.data.data.invoice;
  console.log(`[4] Generated Invoice ${invoiceA.invoiceNumber} for Student A (Due: ${invoiceA.dueAt})`);

  // 5. Deliberately backdate invoice dueAt to simulate elapsed deadline window
  const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  await Invoice.updateOne({ _id: invoiceA._id }, { $set: { dueAt: pastDate } });
  console.log(`[5] Backdated Invoice ${invoiceA.invoiceNumber} dueAt to past: ${pastDate.toISOString()}`);

  // 6. Admin triggers the deadline sweep: POST /api/admin/invoices/process-expired
  console.log(`[6] Triggering deadline sweep via POST /api/admin/invoices/process-expired...`);
  const sweepRes = await apiRequest('/admin/invoices/process-expired', {
    method: 'POST',
    token: preUniToken,
  });

  console.log(`Sweep Response status: ${sweepRes.status}`);
  console.log(`Sweep Processed Count: ${sweepRes.data.data?.processedCount}`);

  // 7. Verify Document States
  const updatedInvoiceA = await Invoice.findById(invoiceA._id);
  const updatedEnrollmentA = await Enrollment.findById(enrollmentA._id);
  const updatedEnrollmentB = await Enrollment.findById(enrollmentB._id);
  const updatedAppB = await Application.findById(appB._id);
  const updatedCourse = await Course.findById(testCourse._id);

  console.log('\n--- VERIFICATION CHECKS ---');
  let allPass = true;

  function check(label, condition, details) {
    if (condition) {
      console.log(`[✓] PASS: ${label} -> ${details}`);
    } else {
      console.error(`[✗] FAIL: ${label} -> ${details}`);
      allPass = false;
    }
  }

  check(
    'INVOICE_A_STATUS',
    updatedInvoiceA.status === 'EXPIRED',
    `Status=${updatedInvoiceA.status} (expected EXPIRED)`
  );

  check(
    'ENROLLMENT_A_STATUS',
    updatedEnrollmentA.status === 'CANCELLED',
    `Status=${updatedEnrollmentA.status} (expected CANCELLED)`
  );

  check(
    'ENROLLMENT_A_CANCEL_REASON',
    updatedEnrollmentA.cancelReason === 'Payment deadline expired',
    `CancelReason="${updatedEnrollmentA.cancelReason}" (expected "Payment deadline expired")`
  );

  check(
    'ENROLLMENT_B_PROMOTION',
    updatedEnrollmentB.status === 'PENDING_PAYMENT',
    `Status=${updatedEnrollmentB.status} (expected PENDING_PAYMENT from WAITLISTED via FIFO)`
  );

  check(
    'APPLICATION_B_STATUS',
    updatedAppB.status === 'ELIGIBLE_PAYMENT_PENDING',
    `Application B Status=${updatedAppB.status} (expected ELIGIBLE_PAYMENT_PENDING)`
  );

  check(
    'COURSE_OCCUPIED_SEATS',
    updatedCourse.occupiedSeats === 1,
    `OccupiedSeats=${updatedCourse.occupiedSeats} (1 seat freed by A, re-reserved by B)`
  );

  // 8. Verify Audit Logs
  const invoiceExpiredLog = await AuditLog.findOne({
    action: 'INVOICE_EXPIRED',
    resourceId: new mongoose.Types.ObjectId(invoiceA._id),
  });
  check(
    'AUDIT_INVOICE_EXPIRED',
    !!invoiceExpiredLog,
    `Found INVOICE_EXPIRED log (Actor: ${invoiceExpiredLog?.user || 'admin'}, Reason: ${invoiceExpiredLog?.reason})`
  );

  const enrollmentCancelledLog = await AuditLog.findOne({
    action: 'ENROLLMENT_CANCELLED',
    resourceId: new mongoose.Types.ObjectId(enrollmentA._id),
  });
  check(
    'AUDIT_ENROLLMENT_CANCELLED',
    !!enrollmentCancelledLog,
    `Found ENROLLMENT_CANCELLED log (Reason: ${enrollmentCancelledLog?.reason})`
  );

  const waitlistPromotedLog = await AuditLog.findOne({
    action: 'ENROLLMENT_PROMOTED_FROM_WAITLIST',
    resourceId: new mongoose.Types.ObjectId(enrollmentB._id),
  });
  check(
    'AUDIT_ENROLLMENT_PROMOTED_FROM_WAITLIST',
    !!waitlistPromotedLog,
    `Found ENROLLMENT_PROMOTED_FROM_WAITLIST log for promoted student B (Reason: ${waitlistPromotedLog?.reason})`
  );

  console.log('\n===============================================================');
  console.log(allPass ? '>>> ALL EXPIRY & PROMOTION TESTS PASSED! <<<' : '>>> SOME TESTS FAILED <<<');
  console.log('===============================================================');

  await mongoose.disconnect();
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
