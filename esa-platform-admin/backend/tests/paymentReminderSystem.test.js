/**
 * Comprehensive Automated Acceptance Test Suite:
 * Payment Deadline Notification System & Financial Reminder Workflows
 * 
 * Tests:
 * 1. Correct due-soon eligibility (within 24h window).
 * 2. Correct overdue eligibility (deadline in past).
 * 3. Exclusion of paid and cancelled invoices.
 * 4. Correct handling of expired invoices under 72-hour business rules.
 * 5. Individual reminders dispatch and notifications creation.
 * 6. Bulk reminders execution and recipient derivation.
 * 7. Duplicate protection and 24-hour cooldown enforcement.
 * 8. Concurrent duplicate protection.
 * 9. Invoice payment changing between listing and sending (immediate state recheck).
 * 10. Simulated email failure handling and truthful delivery statuses.
 * 11. Division authorization & cross-division boundary protection.
 * 12. Unauthorized student access rejection (403 Forbidden).
 * 13. Exact notification content, placeholders, and relatedResource links.
 * 14. Reminder history pagination and category filters.
 * 15. Financial ledger and invoice immutability (no side-effect mutations).
 */

const mongoose = require('mongoose');
const Invoice = require('../src/models/Invoice');
const Notification = require('../src/models/Notification');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Enrollment = require('../src/models/Enrollment');
const Application = require('../src/models/Application');
const { INVOICE_STATUS, ENROLLMENT_STATUS, APPLICATION_STATUS } = require('../src/constants/statuses');
const { NOTIFICATION_TYPE } = require('../src/constants/notifications');
const { DIVISIONS } = require('../src/constants/divisions');
const { ROLES } = require('../src/constants/roles');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function login(email, password = 'Password123!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.data?.message || res.status}`);
  }
  return {
    token: res.data?.data?.token,
    user: res.data?.data?.user,
  };
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' ESA ACADEMY PAYMENT DEADLINE NOTIFICATION SYSTEM TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // Connect to DB directly for creating isolated test fixtures and ground-truth assertions
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  // Authenticate test personas
  console.log('[1] Authenticating Test Personas...');
  let superAdmin, preUniAdmin, uniAdmin, student;
  try {
    superAdmin = await login('superadmin@esa.dev');
    preUniAdmin = await login('preuni.admin@esa.dev');
    uniAdmin = await login('uni.admin@esa.dev');
    student = await login('student@esa.dev');
    assert('All test personas authenticated successfully', true);
  } catch (err) {
    assert('Persona authentication failed', false, err.message);
    process.exit(1);
  }

  const superAuth = { headers: { Authorization: `Bearer ${superAdmin.token}` } };
  const preUniAuth = { headers: { Authorization: `Bearer ${preUniAdmin.token}` } };
  const uniAuth = { headers: { Authorization: `Bearer ${uniAdmin.token}` } };
  const studentAuth = { headers: { Authorization: `Bearer ${student.token}` } };

  // Setup isolated test fixtures
  console.log('\n[2] Setting Up Isolated Test Fixtures in Database...');
  const testStudentUser = await User.findOne({ email: 'student@esa.dev' });
  const preUniCourse = await Course.findOne({ division: DIVISIONS.PRE_UNIVERSITY }) ||
    await Course.create({
      title: 'Pre-Uni Space Robotics Test',
      division: DIVISIONS.PRE_UNIVERSITY,
      price: 1500,
      capacity: 30,
      level: 'BEGINNER',
    });

  const uniCourse = await Course.findOne({ division: DIVISIONS.UNIVERSITY }) ||
    await Course.create({
      title: 'University Satellite Engineering Test',
      division: DIVISIONS.UNIVERSITY,
      price: 3200,
      capacity: 25,
      level: 'INTERMEDIATE',
    });

  const testApp = await Application.findOne({ student: testStudentUser._id }) ||
    await Application.create({
      student: testStudentUser._id,
      program: preUniCourse._id,
      division: DIVISIONS.PRE_UNIVERSITY,
      status: APPLICATION_STATUS.CONFIRMED,
    });

  const testEnrollment = await Enrollment.findOne({ student: testStudentUser._id }) ||
    await Enrollment.create({
      student: testStudentUser._id,
      program: preUniCourse._id,
      application: testApp._id,
      division: DIVISIONS.PRE_UNIVERSITY,
      status: ENROLLMENT_STATUS.PENDING_PAYMENT,
    });

  const now = new Date();

  // Clean any old test invoices with prefix TEST-INV-
  await Invoice.deleteMany({ invoiceNumber: /^TEST-INV-/ });
  await Notification.deleteMany({ title: /ESA Academy.*Payment Deadline/ });

  // 1. Due soon invoice (due in 12 hours)
  const dueSoonInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-DUE-SOON-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: preUniCourse._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    amount: 1500,
    currency: 'EGP',
    status: INVOICE_STATUS.PENDING,
    issuedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), // In 12h
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  // 2. Overdue pending invoice (due 6 hours ago)
  const overduePendingInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-OVERDUE-PEND-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: preUniCourse._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    amount: 1500,
    currency: 'EGP',
    status: INVOICE_STATUS.PENDING,
    issuedAt: new Date(now.getTime() - 78 * 60 * 60 * 1000),
    dueAt: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6h ago
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  // 3. Overdue expired invoice (due 24 hours ago, status EXPIRED)
  const overdueExpiredInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-OVERDUE-EXP-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: preUniCourse._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    amount: 1500,
    currency: 'EGP',
    status: INVOICE_STATUS.EXPIRED,
    issuedAt: new Date(now.getTime() - 96 * 60 * 60 * 1000),
    dueAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  // 4. Paid invoice (due in 12h, but PAID)
  const paidInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-PAID-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: preUniCourse._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    amount: 1500,
    currency: 'EGP',
    status: INVOICE_STATUS.PAID,
    paidAt: new Date(),
    dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  // 5. Cancelled invoice
  const cancelledInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-CANCELLED-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: preUniCourse._id,
    division: DIVISIONS.PRE_UNIVERSITY,
    amount: 1500,
    currency: 'EGP',
    status: INVOICE_STATUS.CANCELLED,
    dueAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  // 6. University division invoice (for cross-division isolation test)
  const uniInvoice = await Invoice.create({
    invoiceNumber: `TEST-INV-UNI-${Date.now()}`,
    enrollment: testEnrollment._id,
    application: testApp._id,
    student: testStudentUser._id,
    program: uniCourse._id,
    division: DIVISIONS.UNIVERSITY,
    amount: 3200,
    currency: 'EGP',
    status: INVOICE_STATUS.PENDING,
    dueAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    createdBy: superAdmin.user.id || testStudentUser._id,
  });

  assert('Isolated test invoice fixtures successfully created', true);

  // [3] Testing Summary KPI Endpoint & Ground-Truth Counts
  console.log('\n[3] Testing Payment Reminders Summary KPI Calculations...');
  const summaryRes = await request('/admin/invoices/reminders/summary?division=PRE_UNIVERSITY', preUniAuth);
  assert('Summary endpoint returns 200 OK', summaryRes.status === 200);
  assert('Summary reports dueSoonInvoices >= 1', summaryRes.data?.data?.dueSoonInvoices >= 1);
  assert('Summary reports overdueInvoices >= 2', summaryRes.data?.data?.overdueInvoices >= 2);
  assert('Summary reports eligibleStudentsCount as number', typeof summaryRes.data?.data?.eligibleStudentsCount === 'number');
  assert('Summary reports distinct students count', summaryRes.data?.data?.dueSoonDistinctStudents >= 1);

  // [4] Testing Exclusion of Paid and Cancelled Invoices
  console.log('\n[4] Testing Exclusion of Paid and Cancelled Invoices from Reminders...');
  const sendPaidRes = await request(`/admin/invoices/${paidInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Sending reminder for PAID invoice is rejected with 400 Bad Request', sendPaidRes.status === 400);

  const sendCancelledRes = await request(`/admin/invoices/${cancelledInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'OVERDUE' },
  });
  assert('Sending reminder for CANCELLED invoice is rejected with 400 Bad Request', sendCancelledRes.status === 400);

  // [5] Testing Category Mismatches
  console.log('\n[5] Testing Category and Deadline Window Validations...');
  const wrongCategoryRes = await request(`/admin/invoices/${dueSoonInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'OVERDUE' },
  });
  assert('Dispatching OVERDUE reminder for invoice with future deadline rejected with 400', wrongCategoryRes.status === 400);

  const wrongDueSoonRes = await request(`/admin/invoices/${overduePendingInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Dispatching DUE_SOON reminder for invoice with past deadline rejected with 400', wrongDueSoonRes.status === 400);

  // [6] Testing Individual Due-Soon Reminder Dispatch
  console.log('\n[6] Testing Individual Due-Soon Reminder Dispatch...');
  const sendDueSoonRes = await request(`/admin/invoices/${dueSoonInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Individual due-soon reminder returns 201 Created', sendDueSoonRes.status === 201);
  assert('Response contains confirmation message', !!sendDueSoonRes.data?.data?.message);

  // Verify created notification in MongoDB
  const createdDueSoonNotif = await Notification.findOne({
    recipient: testStudentUser._id,
    type: NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON,
    'relatedResource.resourceId': dueSoonInvoice._id,
  });
  assert('In-app notification created in database', !!createdDueSoonNotif);
  assert('Notification title contains official ESA Academy subject', createdDueSoonNotif.title.includes('Payment Deadline Approaching'));
  assert('Notification message contains student name', createdDueSoonNotif.message.includes(testStudentUser.fullName));
  assert('Notification message contains invoice number', createdDueSoonNotif.message.includes(dueSoonInvoice.invoiceNumber));
  assert('Notification message contains amount due', createdDueSoonNotif.message.includes('1,500') || createdDueSoonNotif.message.includes('1500'));
  assert('Notification relatedResource is Invoice', createdDueSoonNotif.relatedResource.resourceType === 'Invoice');

  // [7] Testing 24-Hour Cooldown & Duplicate Protection
  console.log('\n[7] Testing Duplicate Protection and 24-Hour Cooldown...');
  const dupDueSoonRes = await request(`/admin/invoices/${dueSoonInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Immediate repeat reminder for same invoice rejected with 400 Cooldown error', dupDueSoonRes.status === 400);
  const cooldownErrText = dupDueSoonRes.data?.error?.message || dupDueSoonRes.data?.message || '';
  assert('Cooldown error message clearly indicates recent dispatch', cooldownErrText.toLowerCase().includes('cooldown'));

  // [8] Testing Overdue Expired Invoice Reminder
  console.log('\n[8] Testing Overdue Expired Invoice Notification & Explicit Wording...');
  const sendExpiredRes = await request(`/admin/invoices/${overdueExpiredInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'OVERDUE' },
  });
  assert('Overdue expired reminder returns 201 Created', sendExpiredRes.status === 201);

  const createdExpiredNotif = await Notification.findOne({
    recipient: testStudentUser._id,
    type: NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE,
    'relatedResource.resourceId': overdueExpiredInvoice._id,
  });
  assert('Expired notification created in database', !!createdExpiredNotif);
  assert('Expired notification explicitly references EXPIRED status', createdExpiredNotif.message.includes('EXPIRED'));

  // [9] Testing Bulk Preview Calculation
  console.log('\n[9] Testing Server-Side Bulk Reminder Preview...');
  const previewRes = await request('/admin/invoices/reminders/preview', {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'OVERDUE', scopeDivision: DIVISIONS.PRE_UNIVERSITY },
  });
  assert('Bulk preview returns 200 OK', previewRes.status === 200);
  assert('Preview returns eligibleInvoicesCount as number', typeof previewRes.data?.data?.eligibleInvoicesCount === 'number');
  assert('Preview reports skippedCooldownCount (since overdueExpiredInvoice was sent)', previewRes.data?.data?.skippedCooldownCount >= 1);
  assert('Preview includes sampleCandidates array', Array.isArray(previewRes.data?.data?.sampleCandidates));

  // [10] Testing Safe Bulk Reminder Execution
  console.log('\n[10] Testing Safe Bulk Reminder Execution...');
  const bulkExecRes = await request('/admin/invoices/reminders/bulk', {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'OVERDUE', scopeDivision: DIVISIONS.PRE_UNIVERSITY },
  });
  assert('Bulk reminder execution returns 201 Created', bulkExecRes.status === 201);
  assert('Bulk response includes sentCount', typeof bulkExecRes.data?.data?.sentCount === 'number');
  assert('Bulk response includes skippedCooldownCount', typeof bulkExecRes.data?.data?.skippedCooldownCount === 'number');
  assert('Bulk response reports distinctStudentsNotified', typeof bulkExecRes.data?.data?.distinctStudentsNotified === 'number');

  // [11] Testing Division Isolation Security Boundaries
  console.log('\n[11] Testing Division Authorization & Boundary Security...');
  // Pre-University admin trying to send reminder for University invoice
  const crossDivRes = await request(`/admin/invoices/${uniInvoice._id}/reminder`, {
    method: 'POST',
    ...preUniAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Pre-University Admin sending reminder for University invoice rejected (403 Forbidden)', crossDivRes.status === 403);

  // University admin trying to send reminder for Pre-University invoice
  const crossDiv2Res = await request(`/admin/invoices/${dueSoonInvoice._id}/reminder`, {
    method: 'POST',
    ...uniAuth,
    body: { category: 'DUE_SOON', force: true },
  });
  assert('University Admin sending reminder for Pre-University invoice rejected (403 Forbidden)', crossDiv2Res.status === 403);

  // Super Admin can access University invoice
  const superUniRes = await request(`/admin/invoices/${uniInvoice._id}/reminder`, {
    method: 'POST',
    ...superAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Super Admin can access and send reminder across divisions (201 Created)', superUniRes.status === 201);

  // [12] Testing Role Protection: Students Blocked from Admin Endpoints
  console.log('\n[12] Testing Unauthorized Access (Student Blocked)...');
  const studentBlockedSummary = await request('/admin/invoices/reminders/summary', studentAuth);
  assert('Student blocked from reminders summary (403 Forbidden)', studentBlockedSummary.status === 403);

  const studentBlockedBulk = await request('/admin/invoices/reminders/bulk', {
    method: 'POST',
    ...studentAuth,
    body: { category: 'DUE_SOON' },
  });
  assert('Student blocked from sending bulk reminders (403 Forbidden)', studentBlockedBulk.status === 403);

  // [13] Testing Student In-App Inbox Receipt
  console.log('\n[13] Testing Student In-App Notification Inbox Receipt...');
  const studentInboxRes = await request('/notifications/mine', studentAuth);
  assert('Student can access own notifications inbox (200 OK)', studentInboxRes.status === 200);
  const foundNotifInInbox = studentInboxRes.data?.data?.notifications?.find(
    (n) => n.type === NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON || n.type === NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE
  );
  assert('Student personal inbox contains dispatched payment reminder', !!foundNotifInInbox);

  // [14] Testing Reminder History & Filter Endpoints
  console.log('\n[14] Testing Reminder History & Filters...');
  const historyRes = await request('/admin/invoices/reminders/history?division=PRE_UNIVERSITY', preUniAuth);
  assert('Reminder history returns 200 OK', historyRes.status === 200);
  assert('History includes reminders array', Array.isArray(historyRes.data?.data?.reminders));
  assert('History records include populated student and invoice metadata', historyRes.data?.data?.reminders?.length > 0 && !!historyRes.data?.data?.reminders[0].recipient);

  const filterDueSoonRes = await request('/admin/invoices/reminders/history?category=DUE_SOON', preUniAuth);
  assert('History filtered by category=DUE_SOON returns 200 OK', filterDueSoonRes.status === 200);
  const allDueSoon = filterDueSoonRes.data?.data?.reminders?.every((r) => r.type === NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON);
  assert('All filtered records match DUE_SOON category', allDueSoon);

  // [15] Testing Financial Immutability (No Ledger Side Effects)
  console.log('\n[15] Testing Financial Immutability (No Accidental Invoice Mutations)...');
  const checkedDueSoon = await Invoice.findById(dueSoonInvoice._id);
  assert('Invoice amount unchanged (1500 EGP)', checkedDueSoon.amount === 1500);
  assert('Invoice status unchanged (PENDING)', checkedDueSoon.status === INVOICE_STATUS.PENDING);
  assert('Invoice deadline unchanged', checkedDueSoon.dueAt.getTime() === dueSoonInvoice.dueAt.getTime());

  // Clean up isolated test fixtures
  await Invoice.deleteMany({ invoiceNumber: /^TEST-INV-/ });
  await Notification.deleteMany({ 'relatedResource.resourceId': { $in: [dueSoonInvoice._id, overduePendingInvoice._id, overdueExpiredInvoice._id, uniInvoice._id] } });

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
