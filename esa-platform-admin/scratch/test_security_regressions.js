const http = require('http');
require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const mongoose = require('../backend/node_modules/mongoose');

const PORT = 5000;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

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
          parsed = buffer.toString('utf8');
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
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
    throw new Error(`Login failed for ${email} (status: ${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runSecurityRegressionTests() {
  console.log('===============================================================');
  console.log('SPACE ACADEMY — SECURITY REGRESSION TEST SUITE (SEC-001 - SEC-004)');
  console.log('===============================================================\n');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/esa_academy';
  await mongoose.connect(uri);

  const User = require('../backend/src/models/User');
  const StudentProfile = require('../backend/src/models/StudentProfile');

  const results = [];
  function assert(testId, title, passed, detail = '') {
    results.push({ testId, title, passed: Boolean(passed), detail });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${testId}] ${title} ${detail ? `-> (${detail})` : ''}`);
  }

  try {
    // 0. Ensure test fixtures exist
    console.log('--- Step 0: Preparing Test Fixtures & Tokens ---');
    const superToken = await login('superadmin@esa.dev');
    const preUniToken = await login('preuni.admin@esa.dev');
    const uniToken = await login('uni.admin@esa.dev');
    const studentToken = await login('student@esa.dev');

    // Create a temporary restricted admin with empty permissions to test fail-closed
    const emptyPermEmail = 'zero.perm.admin@esa.dev';
    let emptyPermUser = await User.findOne({ email: emptyPermEmail });
    if (!emptyPermUser) {
      const bcrypt = require('../backend/node_modules/bcrypt');
      emptyPermUser = await User.create({
        fullName: 'Zero Permissions Admin',
        email: emptyPermEmail,
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'PRE_UNIVERSITY_ADMIN',
        division: 'PRE_UNIVERSITY',
        permissions: [],
        isActive: true,
      });
    } else {
      emptyPermUser.permissions = [];
      await emptyPermUser.save();
    }
    const emptyPermToken = await login(emptyPermEmail);

    // Identify a Pre-Uni student and a University student for cross-division tests
    const preUniStudent = await StudentProfile.findOne({ division: 'PRE_UNIVERSITY' }).populate('user');
    const uniStudent = await StudentProfile.findOne({ division: 'UNIVERSITY' }).populate('user');

    console.log(`Pre-Uni Student ID: ${preUniStudent?._id} (${preUniStudent?.user?.email})`);
    console.log(`University Student ID: ${uniStudent?._id} (${uniStudent?.user?.email})`);
    console.log('');

    // =========================================================================
    // SEC-001: PAYMENT SIMULATION & WEBHOOK SECURITY
    // =========================================================================
    console.log('--- Section 1: SEC-001 Paymob Simulation & Webhook Security ---');

    // 1.1 Unauthenticated request to /paymob/simulate -> 401
    const unauthSimRes = await request('/payments/paymob/simulate', {
      method: 'POST',
      body: { transactionNumber: 'FAKE-TXN-12345', success: true },
    });
    assert(
      'SEC-001.1',
      'Unauthenticated request to /paymob/simulate returns 401 Unauthorized',
      unauthSimRes.status === 401,
      `HTTP Status: ${unauthSimRes.status}`
    );

    // 1.2 Authenticated student missing transactionNumber -> 400
    const missingTxnRes = await request('/payments/paymob/simulate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { success: true },
    });
    assert(
      'SEC-001.2',
      'Missing transactionNumber returns 400 Bad Request',
      missingTxnRes.status === 400,
      `HTTP Status: ${missingTxnRes.status}`
    );

    // 1.3 Authenticated student attempting to simulate a non-existent or foreign transaction -> 404 or 403
    const foreignTxnRes = await request('/payments/paymob/simulate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { transactionNumber: 'TXN-FOREIGN-DOESNOTEXIST', success: true },
    });
    assert(
      'SEC-001.3',
      'Simulating foreign/non-existent transaction returns 404 or 403',
      foreignTxnRes.status === 404 || foreignTxnRes.status === 403,
      `HTTP Status: ${foreignTxnRes.status}`
    );

    // 1.4 Unauthenticated Paymob webhook without HMAC -> 401
    const noHmacWebhookRes = await request('/payments/paymob/callback', {
      method: 'POST',
      body: { obj: { id: 999999 } },
    });
    assert(
      'SEC-001.4',
      'Paymob webhook without HMAC signature returns 401 Unauthorized',
      noHmacWebhookRes.status === 401,
      `HTTP Status: ${noHmacWebhookRes.status}`
    );

    // 1.5 Paymob webhook with forged/invalid HMAC -> 401
    const forgedHmacWebhookRes = await request('/payments/paymob/callback?hmac=forged_invalid_signature_hex_12345', {
      method: 'POST',
      body: { obj: { id: 999999, amount_cents: 1000 } },
    });
    assert(
      'SEC-001.5',
      'Paymob webhook with forged HMAC signature returns 401 Unauthorized',
      forgedHmacWebhookRes.status === 401,
      `HTTP Status: ${forgedHmacWebhookRes.status}`
    );

    // =========================================================================
    // SEC-002: PERMISSION MIDDLEWARE FAIL-CLOSED ENFORCEMENT
    // =========================================================================
    console.log('\n--- Section 2: SEC-002 Permission Middleware Fail-Closed Enforcement ---');

    // 2.1 Admin with permissions: [] attempting to access permission-guarded route -> 403
    const emptyPermRes = await request('/admin/students', {
      headers: { Authorization: `Bearer ${emptyPermToken}` },
    });
    assert(
      'SEC-002.1',
      'Admin with empty permissions array (permissions: []) receives 403 Forbidden',
      emptyPermRes.status === 403,
      `HTTP Status: ${emptyPermRes.status}, Message: ${emptyPermRes.data?.message || JSON.stringify(emptyPermRes.data)}`
    );

    // 2.2 Restricted admin lacking specific permission receives 403
    // nocerts.admin@esa.dev only has STUDENTS_VIEW and CERTIFICATES_VIEW (lacks INSTRUCTORS_MANAGE)
    const nocertsToken = await login('nocerts.admin@esa.dev');
    const missingSpecificPermRes = await request('/admin/instructors/sync-access', {
      method: 'POST',
      headers: { Authorization: `Bearer ${nocertsToken}` },
    });
    assert(
      'SEC-002.2',
      'Admin lacking specific required permission receives 403 Forbidden',
      missingSpecificPermRes.status === 403,
      `HTTP Status: ${missingSpecificPermRes.status}`
    );

    // 2.3 Division admin with valid required permission succeeds (200)
    const validPermRes = await request('/admin/students', {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert(
      'SEC-002.3',
      'Division admin with valid permission succeeds with 200 OK',
      validPermRes.status === 200,
      `HTTP Status: ${validPermRes.status}, Total Students: ${validPermRes.data?.data?.students?.length}`
    );

    // 2.4 Super Admin always bypasses specific permission checks (200)
    const superAdminPermRes = await request('/admin/students', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      'SEC-002.4',
      'Super Admin passes permission checks with full platform authority',
      superAdminPermRes.status === 200,
      `HTTP Status: ${superAdminPermRes.status}`
    );

    // =========================================================================
    // SEC-003: SERVER-SIDE DIVISION SCOPING & CROSS-DIVISION IDOR
    // =========================================================================
    console.log('\n--- Section 3: SEC-003 Server-Side Division Scoping & Cross-Division Access ---');

    if (preUniStudent && uniStudent) {
      // 3.1 Pre-Uni admin attempting to GET University student -> 403
      const preUniAccessUniRes = await request(`/admin/students/${uniStudent._id}`, {
        headers: { Authorization: `Bearer ${preUniToken}` },
      });
      assert(
        'SEC-003.1',
        'Pre-Uni Admin accessing University student receives 403 Forbidden',
        preUniAccessUniRes.status === 403,
        `HTTP Status: ${preUniAccessUniRes.status}, Message: ${preUniAccessUniRes.data?.message}`
      );

      // 3.2 University admin attempting to GET Pre-Uni student -> 403
      const uniAccessPreUniRes = await request(`/admin/students/${preUniStudent._id}`, {
        headers: { Authorization: `Bearer ${uniToken}` },
      });
      assert(
        'SEC-003.2',
        'University Admin accessing Pre-Uni student receives 403 Forbidden',
        uniAccessPreUniRes.status === 403,
        `HTTP Status: ${uniAccessPreUniRes.status}, Message: ${uniAccessPreUniRes.data?.message}`
      );

      // 3.3 Pre-Uni admin attempting to UPDATE University student -> 403
      const preUniUpdateUniRes = await request(`/admin/students/${uniStudent._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${preUniToken}` },
        body: { phone: '+20 100 000 0000', notes: 'Unauthorized tampering attempt' },
      });
      assert(
        'SEC-003.3',
        'Pre-Uni Admin updating University student receives 403 Forbidden',
        preUniUpdateUniRes.status === 403,
        `HTTP Status: ${preUniUpdateUniRes.status}`
      );

      // 3.4 Tampering attempt: updating student with forbidden "division" key -> 400
      const divisionTamperRes = await request(`/admin/students/${preUniStudent._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${preUniToken}` },
        body: { division: 'UNIVERSITY' },
      });
      assert(
        'SEC-003.4',
        'Attempting to mutate student division in update payload returns 400 Bad Request',
        divisionTamperRes.status === 400,
        `HTTP Status: ${divisionTamperRes.status}, Message: ${divisionTamperRes.data?.message}`
      );

      // 3.5 Pre-Uni admin accessing Pre-Uni student within scope -> 200
      const preUniOwnAccessRes = await request(`/admin/students/${preUniStudent._id}`, {
        headers: { Authorization: `Bearer ${preUniToken}` },
      });
      assert(
        'SEC-003.5',
        'Pre-Uni Admin accessing Pre-Uni student succeeds with 200 OK',
        preUniOwnAccessRes.status === 200,
        `HTTP Status: ${preUniOwnAccessRes.status}`
      );

      // 3.6 Super Admin can access both Pre-Uni and University students
      const superPreUniRes = await request(`/admin/students/${preUniStudent._id}`, {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      const superUniRes = await request(`/admin/students/${uniStudent._id}`, {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      assert(
        'SEC-003.6',
        'Super Admin can access students from both academic divisions (200)',
        superPreUniRes.status === 200 && superUniRes.status === 200,
        `Pre-Uni: ${superPreUniRes.status}, Uni: ${superUniRes.status}`
      );
    } else {
      console.warn('Skipping some student division checks: preUniStudent or uniStudent missing in DB');
    }

    // =========================================================================
    // SEC-004: PUBLIC REGISTRATION PRIVILEGE ESCALATION PREVENTION
    // =========================================================================
    console.log('\n--- Section 4: SEC-004 Public Registration Privilege Escalation Prevention ---');

    // 4.1 Attempting to register as INSTRUCTOR -> 422
    const instructorRegEmail = `rogue.instructor.${Date.now()}@test.dev`;
    const instructorRegRes = await request('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Rogue Instructor Applicant',
        email: instructorRegEmail,
        password: 'Password123!',
        role: 'INSTRUCTOR',
        division: 'PRE_UNIVERSITY',
      },
    });
    assert(
      'SEC-004.1',
      'Registering with role="INSTRUCTOR" is rejected with 422 Unprocessable',
      instructorRegRes.status === 422,
      `HTTP Status: ${instructorRegRes.status}, Errors: ${JSON.stringify(instructorRegRes.data?.details || instructorRegRes.data)}`
    );

    // 4.2 Attempting to register as SUPER_ADMIN or PRE_UNIVERSITY_ADMIN -> 422
    const adminRegRes = await request('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Rogue Admin Applicant',
        email: `rogue.admin.${Date.now()}@test.dev`,
        password: 'Password123!',
        role: 'SUPER_ADMIN',
      },
    });
    assert(
      'SEC-004.2',
      'Registering with role="SUPER_ADMIN" is rejected with 422 Unprocessable',
      adminRegRes.status === 422,
      `HTTP Status: ${adminRegRes.status}`
    );

    // 4.3 Legitimate Student Registration -> 201 and created user is strictly STUDENT
    const validStudentEmail = `legit.student.${Date.now()}@test.dev`;
    const studentRegRes = await request('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Legitimate Space Cadet',
        email: validStudentEmail,
        password: 'Password123!',
        division: 'PRE_UNIVERSITY',
      },
    });
    const createdUser = await User.findOne({ email: validStudentEmail });
    const createdProfile = await StudentProfile.findOne({ user: createdUser?._id });

    assert(
      'SEC-004.3',
      'Legitimate student registration succeeds (201) and sets role strictly to STUDENT',
      studentRegRes.status === 201 &&
        createdUser?.role === 'STUDENT' &&
        createdUser?.division === 'PRE_UNIVERSITY' &&
        Boolean(createdProfile),
      `Status: ${studentRegRes.status}, Assigned Role: ${createdUser?.role}, Profile Created: ${Boolean(createdProfile)}`
    );

    // Clean up created student fixture
    if (createdUser) {
      await StudentProfile.deleteOne({ user: createdUser._id });
      await User.deleteOne({ _id: createdUser._id });
    }

  } catch (err) {
    console.error('Fatal error during security test execution:', err);
  } finally {
    await mongoose.disconnect();
  }

  // Summary
  console.log('\n===============================================================');
  console.log('SECURITY REGRESSION SUMMARY');
  console.log('===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`Total Security Checks: ${totalCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${totalCount - passedCount}`);

  if (passedCount === totalCount) {
    console.log('\n🎉 ALL SECURITY REGRESSION TESTS PASSED (100% SUCCESS)');
  } else {
    console.error(`\n❌ REGRESSION FAILURES DETECTED: ${totalCount - passedCount} failed checks.`);
    process.exit(1);
  }
}

runSecurityRegressionTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
