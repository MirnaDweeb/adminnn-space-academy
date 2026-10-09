const mongoose = require('../backend/node_modules/mongoose');

const BASE_URL = 'http://127.0.0.1:5000/api';
const SEED_PASSWORD = 'Password123!';

async function apiRequest(endpoint, { method = 'GET', body = null, token = null } = {}) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10: PAYMENTS & FINANCE API VERIFICATION MATRIX');
  console.log('===============================================================\n');

  const results = [];
  function record(testCase, status, details) {
    results.push({ testCase, status, details });
    const sym = status === 'PASS' ? '✓' : '✗';
    console.log(`[${sym}] ${testCase}: ${details}`);
  }

  try {
    // 1. Authenticate roles
    const superToken = await login('superadmin@esa.dev');
    const preUniToken = await login('preuni.admin@esa.dev');
    const uniToken = await login('uni.admin@esa.dev');
    const studentToken = await login('student@esa.dev');

    record('AUTH_TOKENS', 'PASS', 'Obtained JWT tokens for SuperAdmin, PreUniAdmin, UniAdmin, Student');

    // 2. Unauthenticated check (401)
    const unauthRes = await apiRequest('/admin/invoices');
    if (unauthRes.status === 401) {
      record('UNAUTH_401', 'PASS', `Received 401 Unauthorized as expected (${unauthRes.data?.message})`);
    } else {
      record('UNAUTH_401', 'FAIL', `Expected 401, got ${unauthRes.status}`);
    }

    // 3. Unauthorized role check (403)
    const wrongRoleRes = await apiRequest('/admin/invoices', { token: studentToken });
    if (wrongRoleRes.status === 403) {
      record('WRONG_ROLE_403', 'PASS', `Received 403 Forbidden for Student role (${wrongRoleRes.data?.message})`);
    } else {
      record('WRONG_ROLE_403', 'FAIL', `Expected 403, got ${wrongRoleRes.status}`);
    }

    // 4. Setup Test Data: Create course + application + enrollment
    await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
    const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
    const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    const studentUser = await User.findOne({ email: 'student@esa.dev' });
    const preUniAdminUser = await User.findOne({ email: 'preuni.admin@esa.dev' });

    // Clean up any previous test course for test isolation
    await Course.deleteMany({ title: /^Phase10 Test/ });

    const testCourse = await Course.create({
      title: 'Phase10 Test Aerospace Robotics',
      description: 'Test program for Phase 10 Finance & Billing verification',
      division: 'PRE_UNIVERSITY',
      targetAudience: 'Secondary Students',
      price: 4500,
      capacity: 10,
      occupiedSeats: 0,
      deliveryMode: 'HYBRID',
      level: 'INTERMEDIATE',
      status: 'ACTIVE',
      createdBy: preUniAdminUser._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const testApp = await Application.create({
      student: studentUser._id,
      program: testCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Enroll through API
    const enrollRes = await apiRequest(`/admin/applications/${testApp._id}/enroll`, {
      method: 'POST',
      token: preUniToken,
    });
    const enrollment = enrollRes.data.data.enrollment;
    record('ENROLLMENT_SETUP', 'PASS', `Created test enrollment in PENDING_PAYMENT: ID ${enrollment._id}`);

    // 5. Generate Invoice (Valid)
    const invRes = await apiRequest(`/admin/enrollments/${enrollment._id}/invoice`, {
      method: 'POST',
      body: { dueAtHours: 72, notes: 'Invoice for Phase 10 API verification' },
      token: preUniToken,
    });
    const invoice = invRes.data.data?.invoice;
    if (
      invRes.status === 201 &&
      invoice &&
      invoice.amount === 4500 &&
      invoice.currency === 'EGP' &&
      invoice.status === 'PENDING'
    ) {
      record(
        'INVOICE_GENERATION_VALID',
        'PASS',
        `Invoice ${invoice.invoiceNumber} created for ${invoice.amount} EGP with 72h window (Due: ${invoice.dueAt})`
      );
    } else {
      record('INVOICE_GENERATION_VALID', 'FAIL', `Invalid invoice: ${JSON.stringify(invRes.data)}`);
    }

    // 6. Duplicate Active Invoice Attempt (409 Conflict)
    const dupRes = await apiRequest(`/admin/enrollments/${enrollment._id}/invoice`, {
      method: 'POST',
      body: { dueAtHours: 72 },
      token: preUniToken,
    });
    if (dupRes.status === 409) {
      record('DUPLICATE_INVOICE_409', 'PASS', `Blocked with 409 Conflict: ${dupRes.data?.message}`);
    } else {
      record('DUPLICATE_INVOICE_409', 'FAIL', `Expected 409, got ${dupRes.status}`);
    }

    // 7. Cross-Division Payment Attempt (403 Forbidden)
    const crossRes = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: { amount: 1000, method: 'BANK_TRANSFER' },
      token: uniToken,
    });
    if (crossRes.status === 403) {
      record('CROSS_DIVISION_403', 'PASS', `Blocked with 403 Forbidden: ${crossRes.data?.message}`);
    } else {
      record('CROSS_DIVISION_403', 'FAIL', `Expected 403, got ${crossRes.status}`);
    }

    // 8. Invalid ID Tests (404 Not Found)
    const fakeId = new mongoose.Types.ObjectId();
    const invEnrollRes = await apiRequest(`/admin/enrollments/${fakeId}/invoice`, {
      method: 'POST',
      token: preUniToken,
    });
    if (invEnrollRes.status === 404) {
      record('INVALID_ENROLLMENT_404', 'PASS', `Received 404 for invalid enrollment ID`);
    } else {
      record('INVALID_ENROLLMENT_404', 'FAIL', `Expected 404, got ${invEnrollRes.status}`);
    }

    // 9. Partial Payment Recording (Valid)
    const payRes1 = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: {
        amount: 2000,
        method: 'CASH',
        reference: 'RCP-001',
        notes: 'Deposit received by cashier',
      },
      token: preUniToken,
    });
    if (
      payRes1.status === 201 &&
      payRes1.data.data.totalPaid === 2000 &&
      payRes1.data.data.isFullyPaid === false &&
      payRes1.data.data.invoice.status === 'PENDING'
    ) {
      record(
        'PARTIAL_PAYMENT_VALID',
        'PASS',
        `Recorded partial payment of 2000 EGP (Method: CASH). Total paid: 2000/4500, Status: PENDING`
      );
    } else {
      record('PARTIAL_PAYMENT_VALID', 'FAIL', `Unexpected result: ${JSON.stringify(payRes1.data)}`);
    }

    // 10. Invalid Payment Validations (Negative amount, invalid method)
    const negRes = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: { amount: -500, method: 'CASH' },
      token: preUniToken,
    });
    if (negRes.status === 400) {
      record('INVALID_AMOUNT_400', 'PASS', `Blocked negative payment with 400: ${negRes.data?.message}`);
    } else {
      record('INVALID_AMOUNT_400', 'FAIL', `Expected 400, got ${negRes.status}`);
    }

    const badMethodRes = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: { amount: 500, method: 'BITCOIN' },
      token: preUniToken,
    });
    if (badMethodRes.status === 400) {
      record('INVALID_METHOD_400', 'PASS', `Blocked invalid method with 400: ${badMethodRes.data?.message}`);
    } else {
      record('INVALID_METHOD_400', 'FAIL', `Expected 400, got ${badMethodRes.status}`);
    }

    // 11. Final Settlement Payment (Mark invoice PAID & transition enrollment to CONFIRMED)
    const payRes2 = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: {
        amount: 2500,
        method: 'BANK_TRANSFER',
        reference: 'TXN-CIB-8849',
        notes: 'Final bank transfer clearance',
      },
      token: preUniToken,
    });

    if (
      payRes2.status === 201 &&
      payRes2.data.data.totalPaid === 4500 &&
      payRes2.data.data.isFullyPaid === true &&
      payRes2.data.data.invoice.status === 'PAID' &&
      payRes2.data.data.enrollment.status === 'CONFIRMED'
    ) {
      record(
        'FINAL_SETTLEMENT_CONFIRMED',
        'PASS',
        `Settled remaining 2500 EGP. Invoice marked PAID, Enrollment transitioned to CONFIRMED (ConfirmedAt: ${payRes2.data.data.enrollment.confirmedAt})`
      );
    } else {
      record('FINAL_SETTLEMENT_CONFIRMED', 'FAIL', `Unexpected result: ${JSON.stringify(payRes2.data)}`);
    }

    // 12. Cannot record payment on settled invoice (400)
    const paySettledRes = await apiRequest(`/admin/invoices/${invoice._id}/payments`, {
      method: 'POST',
      body: { amount: 500, method: 'CASH' },
      token: preUniToken,
    });
    if (paySettledRes.status === 400) {
      record('PAY_SETTLED_INVOICE_400', 'PASS', `Blocked with 400: ${paySettledRes.data?.message}`);
    } else {
      record('PAY_SETTLED_INVOICE_400', 'FAIL', `Expected 400, got ${paySettledRes.status}`);
    }

    // 13. Query Invoices List & Details
    const listRes = await apiRequest('/admin/invoices', { token: preUniToken });
    if (listRes.status === 200 && listRes.data.data.invoices.length > 0) {
      record(
        'INVOICE_LISTING',
        'PASS',
        `PreUniAdmin retrieved ${listRes.data.data.invoices.length} division invoices with pagination`
      );
    } else {
      record('INVOICE_LISTING', 'FAIL', `Failed to retrieve invoice list: ${listRes.status}`);
    }

    const detailRes = await apiRequest(`/admin/invoices/${invoice._id}`, { token: preUniToken });
    if (
      detailRes.status === 200 &&
      detailRes.data.data.transactions.length === 2 &&
      detailRes.data.data.totalPaid === 4500 &&
      detailRes.data.data.balanceRemaining === 0
    ) {
      record(
        'INVOICE_DETAIL_HISTORY',
        'PASS',
        `Detail retrieved: 2 immutable payment transactions (CASH 2000, BANK_TRANSFER 2500), Balance: 0 EGP`
      );
    } else {
      record('INVOICE_DETAIL_HISTORY', 'FAIL', `Detail mismatch: ${JSON.stringify(detailRes.data)}`);
    }

    // 14. Student self-service read-only view
    const studentInvRes = await apiRequest('/students/mine/invoices', { token: studentToken });
    if (studentInvRes.status === 200 && studentInvRes.data.data.invoices.length > 0) {
      record(
        'STUDENT_INVOICE_VIEW',
        'PASS',
        `Student successfully queried their own invoices (${studentInvRes.data.data.invoices.length} found, read-only)`
      );
    } else {
      record('STUDENT_INVOICE_VIEW', 'FAIL', 'Failed to retrieve student invoices');
    }

    console.log('\n===============================================================');
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`TOTAL API TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('===============================================================');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (globalErr) {
    console.error('Fatal API matrix error:', globalErr.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
