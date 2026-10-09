const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const mongoose = require('../backend/node_modules/mongoose');
const crypto = require('crypto');
const paymobService = require('../backend/src/services/paymobService');

const BASE_URL = 'http://127.0.0.1:5000/api';
const SEED_PASSWORD = 'Password123!';
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || 'mock_hmac_secret_esa_2026_secured';

async function apiRequest(endpoint, { method = 'GET', body = null, token = null, query = null } = {}) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let url = `${BASE_URL}${endpoint}`;
  if (query) {
    const qStr = new URLSearchParams(query).toString();
    url += `?${qStr}`;
  }

  const res = await fetch(url, {
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

  return {
    status: res.status,
    ok: res.ok,
    data,
  };
}

async function login(email, password = SEED_PASSWORD) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

function calculatePaymobHmac(obj, secret = HMAC_SECRET) {
  const values = [
    String(obj.amount_cents !== undefined ? obj.amount_cents : ''),
    String(obj.created_at !== undefined ? obj.created_at : ''),
    String(obj.currency !== undefined ? obj.currency : ''),
    String(obj.error_occured !== undefined ? obj.error_occured : 'false'),
    String(obj.has_parent_transaction !== undefined ? obj.has_parent_transaction : 'false'),
    String(obj.id !== undefined ? obj.id : ''),
    String(obj.integration_id !== undefined ? obj.integration_id : ''),
    String(obj.is_3d_secure !== undefined ? obj.is_3d_secure : 'false'),
    String(obj.is_auth !== undefined ? obj.is_auth : 'false'),
    String(obj.is_capture !== undefined ? obj.is_capture : 'false'),
    String(obj.is_refunded !== undefined ? obj.is_refunded : 'false'),
    String(obj.is_standalone_payment !== undefined ? obj.is_standalone_payment : 'false'),
    String(obj.is_voided !== undefined ? obj.is_voided : 'false'),
    String(obj.order?.id !== undefined ? obj.order.id : obj.order || ''),
    String(obj.owner !== undefined ? obj.owner : ''),
    String(obj.pending !== undefined ? obj.pending : 'false'),
    String(obj.source_data?.pan !== undefined ? obj.source_data.pan : ''),
    String(obj.source_data?.sub_type !== undefined ? obj.source_data.sub_type : ''),
    String(obj.source_data?.type !== undefined ? obj.source_data.type : ''),
    String(obj.success !== undefined ? obj.success : 'false'),
  ];

  const concatenated = values.join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10 UPGRADE: REAL ONLINE PAYMENTS & GATEWAY API MATRIX');
  console.log('===============================================================\n');

  const results = [];
  function record(testCase, status, details) {
    results.push({ testCase, status, details });
    const sym = status === 'PASS' ? '✓' : '✗';
    console.log(`[${sym}] ${testCase}: ${details}`);
  }

  try {
    // Connect to DB for models and verification
    await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
    const Course = require('../backend/src/models/Course');
    const Application = require('../backend/src/models/Application');
    const Enrollment = require('../backend/src/models/Enrollment');
    const Invoice = require('../backend/src/models/Invoice');
    const PaymentTransaction = require('../backend/src/models/PaymentTransaction');
    const User = require('../backend/src/models/User');
    const AuditLog = require('../backend/src/models/AuditLog');

    // Clean up test courses
    await Course.deleteMany({ title: /^Phase10 Upgrade/ });

    // 1. Authenticate Roles
    const superToken = await login('superadmin@esa.dev');
    const preUniToken = await login('preuni.admin@esa.dev');
    const uniToken = await login('uni.admin@esa.dev');
    const studentAToken = await login('student@esa.dev');

    // Create / find student B
    await User.deleteOne({ email: 'student_b_upgrade@esa.dev' });
    const bcrypt = require('../backend/node_modules/bcrypt');
    const hash = await bcrypt.hash('Password123!', 10);
    const studentB = await User.create({
      fullName: 'Student Beta Candidate',
      email: 'student_b_upgrade@esa.dev',
      passwordHash: hash,
      role: 'STUDENT',
      isActive: true,
    });
    const studentBToken = await login('student_b_upgrade@esa.dev');
    const studentA = await User.findOne({ email: 'student@esa.dev' });
    const preUniAdmin = await User.findOne({ email: 'preuni.admin@esa.dev' });

    record('AUTH_SETUP', 'PASS', 'Tokens acquired for SuperAdmin, PreUniAdmin, UniAdmin, Student A, Student B');

    // Setup Test Program 1: PRE_UNIVERSITY
    const course1 = await Course.create({
      title: 'Phase10 Upgrade Orbital Navigation Program',
      description: 'Program for testing online payment gateway and transactions',
      division: 'PRE_UNIVERSITY',
      targetAudience: 'Secondary Students',
      capacity: 5,
      occupiedSeats: 0,
      price: 5200,
      currency: 'EGP',
      status: 'ACTIVE',
      createdBy: preUniAdmin._id,
    });

    // Create Application for Student A
    const appA = await Application.create({
      student: studentA._id,
      course: course1._id,
      program: course1._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
      formData: { statement: 'Excited about orbital mechanics' },
    });

    // Enroll Student A in PENDING_PAYMENT
    const enrollResA = await apiRequest(`/admin/applications/${appA._id}/enroll`, {
      method: 'POST',
      token: preUniToken,
    });
    if (!enrollResA.ok) {
      throw new Error(`Enrollment failed: ${JSON.stringify(enrollResA.data)}`);
    }
    const enrollmentAId = enrollResA.data.data.enrollment._id;

    // Issue Invoice for Student A
    const invResA = await apiRequest(`/admin/enrollments/${enrollmentAId}/invoice`, {
      method: 'POST',
      token: preUniToken,
      body: { amount: 5200, notes: 'Phase 10 online test invoice' },
    });
    if (!invResA.ok) {
      throw new Error(`Invoice generation failed: ${JSON.stringify(invResA.data)}`);
    }
    const invoiceA = invResA.data.data.invoice;
    record('SETUP_ENROLLMENT_AND_INVOICE', 'PASS', `Invoice ${invoiceA.invoiceNumber} (5200 EGP) created for Enrollment ${enrollmentAId}`);

    // TEST 1: Unauthenticated payment initiation (401)
    const unauthPay = await apiRequest(`/payments/enrollments/${enrollmentAId}/pay`, {
      method: 'POST',
    });
    if (unauthPay.status === 401) {
      record('UNAUTH_PAY_401', 'PASS', 'Unauthenticated online checkout attempt rejected with 401');
    } else {
      record('UNAUTH_PAY_401', 'FAIL', `Expected 401, got ${unauthPay.status}`);
    }

    // TEST 2: Student B attempts to pay for Student A's enrollment (403 Forbidden)
    const studentBPayOther = await apiRequest(`/payments/enrollments/${enrollmentAId}/pay`, {
      method: 'POST',
      token: studentBToken,
    });
    if (studentBPayOther.status === 403) {
      record('PAY_OTHER_STUDENT_403', 'PASS', 'Student B cannot initiate checkout for Student A (403 Forbidden)');
    } else {
      record('PAY_OTHER_STUDENT_403', 'FAIL', `Expected 403, got ${studentBPayOther.status}`);
    }

    // TEST 3: Student attempts manual admin payment recording (403 Forbidden)
    const studentManualPay = await apiRequest(`/admin/invoices/${invoiceA._id}/payments`, {
      method: 'POST',
      token: studentAToken,
      body: { amount: 5200, method: 'CASH', reference: 'FAKE' },
    });
    if (studentManualPay.status === 403) {
      record('STUDENT_MANUAL_PAY_403', 'PASS', 'Student cannot record manual payment (403 Forbidden)');
    } else {
      record('STUDENT_MANUAL_PAY_403', 'FAIL', `Expected 403, got ${studentManualPay.status}`);
    }

    // TEST 4: Student A initiates own online checkout (201 Created)
    // Backend strictly pulls amount from DB invoice (authoritative, ignores any frontend body)
    const initiateRes = await apiRequest(`/payments/enrollments/${enrollmentAId}/pay`, {
      method: 'POST',
      token: studentAToken,
      body: { amount: 100 }, // Intentionally bogus client amount to verify server ignores it!
    });

    if (initiateRes.status === 201 && initiateRes.data.data.checkoutUrl) {
      const initData = initiateRes.data.data;
      if (initData.amount === 5200) {
        record(
          'ONLINE_CHECKOUT_INITIATE_SUCCESS',
          'PASS',
          `Online checkout initiated. Returned Paymob checkout URL, Txn: ${initData.transactionNumber}, Server Amount: ${initData.amount} EGP (frontend 100 EGP ignored)`
        );
      } else {
        record('ONLINE_CHECKOUT_INITIATE_SUCCESS', 'FAIL', `Amount mismatch: expected 5200, got ${initData.amount}`);
      }
    } else {
      record('ONLINE_CHECKOUT_INITIATE_SUCCESS', 'FAIL', `Initiation failed: ${JSON.stringify(initiateRes.data)}`);
    }

    // TEST 5: Verify PaymentTransaction created in MongoDB
    const initiatedTx = await PaymentTransaction.findOne({ invoice: invoiceA._id }).sort({ createdAt: -1 });
    if (initiatedTx && initiatedTx.recordingType === 'ONLINE' && initiatedTx.provider === 'PAYMOB' && initiatedTx.status === 'PENDING') {
      record(
        'DB_INITIATED_TRANSACTION_VERIFIED',
        'PASS',
        `MongoDB PaymentTransaction recorded: Type=ONLINE, Provider=PAYMOB, Status=PENDING, TxnNumber=${initiatedTx.transactionNumber}`
      );
    } else {
      record('DB_INITIATED_TRANSACTION_VERIFIED', 'FAIL', `DB record unexpected: ${JSON.stringify(initiatedTx)}`);
    }

    // TEST 6: Audit log for PAYMENT_INITIATED
    const initAudit = await AuditLog.findOne({
      action: 'PAYMENT_INITIATED',
      resourceId: initiatedTx._id,
    });
    if (initAudit) {
      record('AUDIT_PAYMENT_INITIATED', 'PASS', `Audit log recorded: PAYMENT_INITIATED by ${studentA.fullName}`);
    } else {
      record('AUDIT_PAYMENT_INITIATED', 'FAIL', 'PAYMENT_INITIATED audit log missing');
    }

    // TEST 7: Paymob Webhook with Invalid HMAC signature (Rejected)
    const fakeTxId1 = Math.floor(10000000 + Math.random() * 90000000);
    const fakeOrderId1 = Number(initiatedTx.gatewayOrderId) || 998877;
    const { payload: invalidPayload } = paymobService.buildSimulatedCallback({
      transactionId: fakeTxId1,
      orderId: fakeOrderId1,
      amountCents: 520000,
      merchantOrderId: initiatedTx.transactionNumber,
      success: true,
    });

    const invalidHmacRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: 'invalid_forged_hmac_signature_1234567890' },
      body: invalidPayload,
    });
    if (invalidHmacRes.status === 401) {
      record('HMAC_INVALID_REJECTED', 'PASS', 'Callback with invalid HMAC signature rejected with 401 Unauthorized');
    } else {
      record('HMAC_INVALID_REJECTED', 'FAIL', `Expected 401, got ${invalidHmacRes.status}`);
    }

    // TEST 8: Paymob Webhook with Amount Mismatch (Rejected)
    const { payload: mismatchedPayload, hmac: mismatchedHmac } = paymobService.buildSimulatedCallback({
      transactionId: fakeTxId1,
      orderId: fakeOrderId1,
      amountCents: 10000, // 100 EGP instead of 5200 EGP
      merchantOrderId: initiatedTx.transactionNumber,
      success: true,
    });
    const amountMismatchRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: mismatchedHmac },
      body: mismatchedPayload,
    });
    if (amountMismatchRes.ok && amountMismatchRes.data.data?.status === 'AMOUNT_MISMATCH') {
      record('AMOUNT_MISMATCH_REJECTED', 'PASS', 'Callback with 100 EGP instead of 5200 EGP rejected with status AMOUNT_MISMATCH');
    } else {
      record('AMOUNT_MISMATCH_REJECTED', 'FAIL', `Unexpected response: ${JSON.stringify(amountMismatchRes.data)}`);
    }

    // TEST 9: Paymob Webhook with Failed Payment (Payment declined)
    const failedTxId = Math.floor(10000000 + Math.random() * 90000000);
    const { payload: failedPayload, hmac: failedHmac } = paymobService.buildSimulatedCallback({
      transactionId: failedTxId,
      orderId: fakeOrderId1,
      amountCents: 520000,
      merchantOrderId: initiatedTx.transactionNumber,
      success: false,
    });
    const failedWebhookRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: failedHmac },
      body: failedPayload,
    });

    const refreshedEnrollAfterFail = await Enrollment.findById(enrollmentAId);
    const refreshedInvAfterFail = await Invoice.findById(invoiceA._id);
    if (
      failedWebhookRes.ok &&
      failedWebhookRes.data.data?.status === 'FAILED' &&
      refreshedEnrollAfterFail.status === 'PENDING_PAYMENT' &&
      refreshedInvAfterFail.status === 'PENDING'
    ) {
      record(
        'GATEWAY_FAILED_CALLBACK_PRESERVES_RESERVATION',
        'PASS',
        'Failed card callback sets transaction FAILED but preserves Enrollment in PENDING_PAYMENT so student can retry'
      );
    } else {
      record('GATEWAY_FAILED_CALLBACK_PRESERVES_RESERVATION', 'FAIL', 'Failed callback handling unexpected');
    }

    // TEST 10: Paymob Webhook with Pending Authorization Status
    const pendingTxId = Math.floor(10000000 + Math.random() * 90000000);
    const { payload: pendingPayload, hmac: pendingHmac } = paymobService.buildSimulatedCallback({
      transactionId: pendingTxId,
      orderId: fakeOrderId1,
      amountCents: 520000,
      merchantOrderId: initiatedTx.transactionNumber,
      success: true,
      pending: true,
    });
    const pendingWebhookRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: pendingHmac },
      body: pendingPayload,
    });
    if (pendingWebhookRes.ok && pendingWebhookRes.data.data?.status === 'PENDING') {
      record('GATEWAY_PENDING_CALLBACK', 'PASS', 'Pending callback sets transaction status PENDING without confirming enrollment prematurely');
    } else {
      record('GATEWAY_PENDING_CALLBACK', 'FAIL', `Expected PENDING, got: ${JSON.stringify(pendingWebhookRes.data)}`);
    }

    // TEST 11: Paymob Successful Webhook Callback (Settles Invoice and Confirms Enrollment)
    const successTxId = Math.floor(10000000 + Math.random() * 90000000);
    const { payload: successPayload, hmac: successHmac } = paymobService.buildSimulatedCallback({
      transactionId: successTxId,
      orderId: fakeOrderId1,
      amountCents: 520000,
      merchantOrderId: initiatedTx.transactionNumber,
      success: true,
      pending: false,
    });
    const successWebhookRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: successHmac },
      body: successPayload,
    });

    const settledInv = await Invoice.findById(invoiceA._id);
    const confirmedEnroll = await Enrollment.findById(enrollmentAId);
    const confirmedApp = await Application.findById(appA._id);
    const settledTx = await PaymentTransaction.findById(initiatedTx._id);

    if (
      successWebhookRes.ok &&
      settledInv.status === 'PAID' &&
      confirmedEnroll.status === 'CONFIRMED' &&
      confirmedApp.status === 'CONFIRMED' &&
      settledTx.status === 'PAID'
    ) {
      record(
        'ONLINE_PAYMENT_SUCCESS_SETTLEMENT',
        'PASS',
        `Invoice ${settledInv.invoiceNumber} marked PAID, Enrollment ${confirmedEnroll._id} CONFIRMED, Application CONFIRMED, Gateway Txn ${settledTx.gatewayTransactionId} PAID`
      );
    } else {
      record('ONLINE_PAYMENT_SUCCESS_SETTLEMENT', 'FAIL', `Settlement mismatch: Inv=${settledInv.status}, Enroll=${confirmedEnroll.status}`);
    }

    // TEST 12: Duplicate Webhook Idempotency Check
    const dupWebhookRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: successHmac },
      body: successPayload,
    });
    if (dupWebhookRes.ok && dupWebhookRes.data.data?.isDuplicate === true) {
      record('DUPLICATE_WEBHOOK_IDEMPOTENT', 'PASS', 'Duplicate callback identified and handled idempotently without double-settling');
    } else {
      record('DUPLICATE_WEBHOOK_IDEMPOTENT', 'FAIL', `Duplicate callback handling unexpected: ${JSON.stringify(dupWebhookRes.data)}`);
    }

    // TEST 13: Attempt payment for already confirmed enrollment (400 Bad Request)
    const payAlreadyConfirmed = await apiRequest(`/payments/enrollments/${enrollmentAId}/pay`, {
      method: 'POST',
      token: studentAToken,
    });
    if (payAlreadyConfirmed.status === 400) {
      record('ALREADY_CONFIRMED_PAY_BLOCKED', 'PASS', 'Initiate payment on CONFIRMED enrollment blocked with 400 Bad Request');
    } else {
      record('ALREADY_CONFIRMED_PAY_BLOCKED', 'FAIL', `Expected 400, got ${payAlreadyConfirmed.status}`);
    }

    // TEST 14: Student Status Check API
    const statusRes = await apiRequest(`/payments/enrollments/${enrollmentAId}/status`, {
      token: studentAToken,
    });
    if (
      statusRes.ok &&
      statusRes.data.data.enrollment.status === 'CONFIRMED' &&
      statusRes.data.data.invoice.status === 'PAID' &&
      statusRes.data.data.transactions.length > 0
    ) {
      record(
        'PAYMENT_STATUS_API',
        'PASS',
        `GET /payments/enrollments/:id/status returned verified state: Enrollment=CONFIRMED, Invoice=PAID, Txns=${statusRes.data.data.transactions.length}`
      );
    } else {
      record('PAYMENT_STATUS_API', 'FAIL', `Status API response mismatch: ${JSON.stringify(statusRes.data)}`);
    }

    // TEST 15: Cross-Division Admin Isolation Check (403)
    const crossDivDetail = await apiRequest(`/admin/invoices/${invoiceA._id}`, {
      token: uniToken,
    });
    if (crossDivDetail.status === 403) {
      record('CROSS_DIVISION_ADMIN_403', 'PASS', 'University Admin cannot view Pre-University invoice details (403 Forbidden)');
    } else {
      record('CROSS_DIVISION_ADMIN_403', 'FAIL', `Expected 403, got ${crossDivDetail.status}`);
    }

    // =========================================================================
    // TEST 16 & 17: EXPIRY, LATE CALLBACK PROTECTION, AND WAITLIST PROMOTION
    // =========================================================================
    // Setup Program with Capacity: 1
    const oneSeatCourse = await Course.create({
      title: 'Phase10 Upgrade 1-Seat Rocketry Cohort',
      description: 'Program to verify expiry and late callback safety',
      division: 'PRE_UNIVERSITY',
      targetAudience: 'Secondary Students',
      capacity: 1,
      occupiedSeats: 0,
      price: 3500,
      currency: 'EGP',
      status: 'ACTIVE',
      createdBy: preUniAdmin._id,
    });

    // Student A Application + Enrollment (Occupies 1/1 seat)
    const appOneA = await Application.create({
      student: studentA._id,
      course: oneSeatCourse._id,
      program: oneSeatCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });
    const enrollOneARes = await apiRequest(`/admin/applications/${appOneA._id}/enroll`, {
      method: 'POST',
      token: preUniToken,
    });
    const enrollOneAId = enrollOneARes.data.data.enrollment._id;

    // Student B Application + Enrollment (WAITLISTED)
    const appOneB = await Application.create({
      student: studentB._id,
      course: oneSeatCourse._id,
      program: oneSeatCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });
    const enrollOneBRes = await apiRequest(`/admin/applications/${appOneB._id}/enroll`, {
      method: 'POST',
      token: preUniToken,
    });
    const enrollOneBId = enrollOneBRes.data.data.enrollment._id;

    // Issue Invoice for Student A
    const invOneARes = await apiRequest(`/admin/enrollments/${enrollOneAId}/invoice`, {
      method: 'POST',
      token: preUniToken,
      body: { amount: 3500 },
    });
    const invoiceOneA = invOneARes.data.data.invoice;

    // Student A initiates online checkout attempt
    const initOneARes = await apiRequest(`/payments/enrollments/${enrollOneAId}/pay`, {
      method: 'POST',
      token: studentAToken,
    });
    const initOneAData = initOneARes.data.data;

    // Backdate Invoice dueAt to simulate 72h deadline expiration
    await Invoice.findByIdAndUpdate(invoiceOneA._id, {
      dueAt: new Date(Date.now() - 3600000), // 1 hour ago
    });

    // Run expiration sweep
    const sweepRes = await apiRequest('/admin/invoices/process-expired', {
      method: 'POST',
      token: preUniToken,
    });

    const expiredInv = await Invoice.findById(invoiceOneA._id);
    const cancelledEnroll = await Enrollment.findById(enrollOneAId);
    const promotedEnrollB = await Enrollment.findById(enrollOneBId);

    if (
      expiredInv.status === 'EXPIRED' &&
      cancelledEnroll.status === 'CANCELLED' &&
      promotedEnrollB.status === 'PENDING_PAYMENT'
    ) {
      record(
        'EXPIRY_AND_WAITLIST_PROMOTION',
        'PASS',
        `Invoice ${expiredInv.invoiceNumber} EXPIRED, Enrollment A CANCELLED, Student B promoted from WAITLISTED -> PENDING_PAYMENT via FIFO`
      );
    } else {
      record('EXPIRY_AND_WAITLIST_PROMOTION', 'FAIL', 'Expiry or promotion state mismatch');
    }

    // Now simulate LATE gateway callback arriving for Student A's old transaction!
    const lateTxId = Math.floor(10000000 + Math.random() * 90000000);
    const lateOrderId = Number(initOneAData.gatewayOrderId) || 888777;
    const { payload: latePayload, hmac: lateHmac } = paymobService.buildSimulatedCallback({
      transactionId: lateTxId,
      orderId: lateOrderId,
      amountCents: 350000,
      merchantOrderId: initOneAData.transactionNumber,
      success: true,
      pending: false,
    });
    const lateCallbackRes = await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: lateHmac },
      body: latePayload,
    });

    // Check that Student A is STILL CANCELLED and Student B is STILL PROMOTED!
    const enrollAStillCancelled = await Enrollment.findById(enrollOneAId);
    const enrollBStillPromoted = await Enrollment.findById(enrollOneBId);

    if (
      lateCallbackRes.ok &&
      lateCallbackRes.data.data?.status === 'EXPIRED_REJECTED' &&
      enrollAStillCancelled.status === 'CANCELLED' &&
      enrollBStillPromoted.status === 'PENDING_PAYMENT'
    ) {
      record(
        'LATE_CALLBACK_SAFETY_TEST',
        'PASS',
        'Late gateway callback safely rejected (EXPIRED_REJECTED). Cancelled enrollment NOT resurrected; promoted student protected'
      );
    } else {
      record('LATE_CALLBACK_SAFETY_TEST', 'FAIL', 'Late callback resurrected cancelled enrollment or stole seat!');
    }

    // =========================================================================
    // TEST 18: MANUAL + ONLINE PAYMENT COEXISTENCE & IMMUTABLE HISTORY TEST
    // =========================================================================
    // Create new program for testing coexistence
    const courseCoexist = await Course.create({
      title: 'Phase10 Upgrade Coexistence Test Cohort',
      description: 'Program to verify online attempt followed by manual payment preserves both records',
      division: 'PRE_UNIVERSITY',
      targetAudience: 'Secondary Students',
      capacity: 5,
      occupiedSeats: 0,
      price: 4000,
      currency: 'EGP',
      status: 'ACTIVE',
      createdBy: preUniAdmin._id,
    });

    const appCoexist = await Application.create({
      student: studentA._id,
      course: courseCoexist._id,
      program: courseCoexist._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });

    const enrollCoexistRes = await apiRequest(`/admin/applications/${appCoexist._id}/enroll`, {
      method: 'POST',
      token: preUniToken,
    });
    const enrollCoexistId = enrollCoexistRes.data.data.enrollment._id;

    const invCoexistRes = await apiRequest(`/admin/enrollments/${enrollCoexistId}/invoice`, {
      method: 'POST',
      token: preUniToken,
      body: { amount: 4000 },
    });
    const invCoexist = invCoexistRes.data.data.invoice;

    // Step 1: Student attempts online checkout
    const onlineAttempt = await apiRequest(`/payments/enrollments/${enrollCoexistId}/pay`, {
      method: 'POST',
      token: studentAToken,
    });
    const onlineTxNumber = onlineAttempt.data.data.transactionNumber;

    // Simulate online attempt failed or abandoned
    const failTxId = Math.floor(10000000 + Math.random() * 90000000);
    const { payload: failCoexistPayload, hmac: failCoexistHmac } = paymobService.buildSimulatedCallback({
      transactionId: failTxId,
      orderId: Number(onlineAttempt.data.data.gatewayOrderId) || 777666,
      amountCents: 400000,
      merchantOrderId: onlineTxNumber,
      success: false,
      pending: false,
    });
    await apiRequest('/payments/paymob/callback', {
      method: 'POST',
      query: { hmac: failCoexistHmac },
      body: failCoexistPayload,
    });

    // Step 2: Student comes in person and Admin records manual BANK_TRANSFER
    const manualPayRes = await apiRequest(`/admin/invoices/${invCoexist._id}/payments`, {
      method: 'POST',
      token: preUniToken,
      body: {
        amount: 4000,
        method: 'BANK_TRANSFER',
        reference: 'CIB-REF-88990011',
        notes: 'Offline bank transfer verified by finance officer',
      },
    });

    if (!manualPayRes.ok) {
      throw new Error(`Manual payment failed: ${JSON.stringify(manualPayRes.data)}`);
    }

    // Step 3: Inspect database to verify BOTH records are preserved!
    const allCoexistTxns = await PaymentTransaction.find({ invoice: invCoexist._id }).sort({ createdAt: 1 });
    const hasOnlineTx = allCoexistTxns.some((t) => t.recordingType === 'ONLINE' && t.status === 'FAILED');
    const hasManualTx = allCoexistTxns.some((t) => t.recordingType === 'MANUAL' && t.method === 'BANK_TRANSFER' && t.status === 'RECORDED');

    const finalInvCoexist = await Invoice.findById(invCoexist._id);
    const finalEnrollCoexist = await Enrollment.findById(enrollCoexistId);

    if (
      allCoexistTxns.length >= 2 &&
      hasOnlineTx &&
      hasManualTx &&
      finalInvCoexist.status === 'PAID' &&
      finalEnrollCoexist.status === 'CONFIRMED'
    ) {
      record(
        'HISTORICAL_PAYMENT_PRESERVATION',
        'PASS',
        `Both transactions preserved in ledger (Online FAILED + Manual BANK_TRANSFER). Total txns: ${allCoexistTxns.length}, Invoice=PAID, Enrollment=CONFIRMED`
      );
    } else {
      record('HISTORICAL_PAYMENT_PRESERVATION', 'FAIL', `Coexistence check failed: txns=${allCoexistTxns.length}`);
    }

    // TEST 19: Phase 9 Capacity Invariant Check across all courses
    const allCourses = await Course.find();
    let capacityViolations = 0;
    for (const c of allCourses) {
      const activeEnrollments = await Enrollment.countDocuments({
        course: c._id,
        status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      });
      if (activeEnrollments > c.capacity) {
        capacityViolations++;
      }
    }

    if (capacityViolations === 0) {
      record('CAPACITY_INVARIANT_VERIFIED', 'PASS', 'Capacity invariant (occupiedCount <= capacity) holds across all programs');
    } else {
      record('CAPACITY_INVARIANT_VERIFIED', 'FAIL', `${capacityViolations} courses violate capacity limit!`);
    }

    console.log('\n===============================================================');
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`TOTAL PHASE 10 UPGRADE TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('===============================================================');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err.message, err.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
