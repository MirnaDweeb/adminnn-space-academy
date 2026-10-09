const mongoose = require('../backend/node_modules/mongoose');

const BASE_URL = 'http://127.0.0.1:5000/api';

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
  console.log('PHASE 9 — ENROLLMENT & CAPACITY API TEST MATRIX');
  console.log('====================================================\n');

  const results = [];
  function assert(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? `(${detail})` : ''}`);
  }

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));

  // 1. Tokens for all roles
  const superToken = await login('superadmin@esa.dev');
  const preUniToken = await login('preuni.admin@esa.dev');
  const uniToken = await login('uni.admin@esa.dev');
  const studentToken = await login('student@esa.dev');
  const instructorToken = await login('instructor@esa.dev');

  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  // 2. Setup Test Courses
  const preUniCourse = await Course.create({
    title: 'API Test Pre-Uni Spacecraft Dynamics',
    description: 'Testing enrollment endpoints',
    division: 'PRE_UNIVERSITY',
    capacity: 2,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
  });

  const uniCourse = await Course.create({
    title: 'API Test University Propulsion Engineering',
    description: 'Testing university division isolation',
    division: 'UNIVERSITY',
    capacity: 5,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
  });

  // Setup Test Applications
  const eligiblePreUniApp = await Application.create({
    student: student._id,
    program: preUniCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });

  const submittedApp = await Application.create({
    student: student._id,
    program: preUniCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'SUBMITTED',
  });

  const uniApp = await Application.create({
    student: student._id,
    program: uniCourse._id,
    division: 'UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });

  // TEST 1: Valid enrollment with capacity -> 201 / PENDING_PAYMENT
  let activeEnrollmentId = null;
  {
    const res = await request(`/admin/applications/${eligiblePreUniApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const enr = res.body.data?.enrollment;
    activeEnrollmentId = enr?._id;
    assert(
      'Test 1: Valid enrollment with capacity returns 201 and PENDING_PAYMENT',
      res.status === 201 && enr?.status === 'PENDING_PAYMENT',
      `HTTP ${res.status}, status: ${enr?.status}, occupied: ${res.body.data?.capacity?.occupied}/${res.body.data?.capacity?.capacity}`
    );
  }

  // TEST 2: Duplicate active enrollment -> 409 Conflict
  {
    const res = await request(`/admin/applications/${eligiblePreUniApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      'Test 2: Duplicate active enrollment returns 409 Conflict',
      res.status === 409,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 3: Invalid application status (SUBMITTED) -> 400 Bad Request
  {
    const res = await request(`/admin/applications/${submittedApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      'Test 3: Ineligible application (status SUBMITTED) returns 400 Bad Request',
      res.status === 400,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 4: Enrollment at full capacity -> 201 / WAITLISTED
  {
    // Fill up the second seat in preUniCourse (capacity = 2)
    const fillerStudent = await User.create({
      fullName: 'Filler Student API',
      email: `filler_${Date.now()}@esa.dev`,
      password: '$2a$10$X9ZpW8.Nl4L5K4xH0jQ5OuEw61mY/uMhI02bS6n0c1s1qW2e3r4t5',
      role: 'STUDENT',
      division: 'PRE_UNIVERSITY',
      isActive: true,
    });
    const fillerApp = await Application.create({
      student: fillerStudent._id,
      program: preUniCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });
    await request(`/admin/applications/${fillerApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });

    // Now preUniCourse has 2 occupied seats out of 2. Next applicant should be WAITLISTED.
    const waitlistStudent = await User.create({
      fullName: 'Waitlist Student API',
      email: `waitlist_${Date.now()}@esa.dev`,
      password: '$2a$10$X9ZpW8.Nl4L5K4xH0jQ5OuEw61mY/uMhI02bS6n0c1s1qW2e3r4t5',
      role: 'STUDENT',
      division: 'PRE_UNIVERSITY',
      isActive: true,
    });
    const waitlistApp = await Application.create({
      student: waitlistStudent._id,
      program: preUniCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });

    const res = await request(`/admin/applications/${waitlistApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const enr = res.body.data?.enrollment;
    assert(
      'Test 4: Enrollment at full capacity returns 201 and status WAITLISTED',
      res.status === 201 && enr?.status === 'WAITLISTED',
      `HTTP ${res.status}, status: ${enr?.status}, waitlisted count: ${res.body.data?.capacity?.waitlisted}`
    );
  }

  // TEST 5: Cross-division enrollment -> 403 Forbidden
  {
    // PRE_UNIVERSITY_ADMIN trying to enroll a UNIVERSITY application
    const res = await request(`/admin/applications/${uniApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert(
      'Test 5: Cross-division enrollment blocked with 403 Forbidden',
      res.status === 403,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 6: Missing token -> 401 Unauthorized
  {
    const res = await request(`/admin/applications/${eligiblePreUniApp._id}/enroll`, {
      method: 'POST',
    });
    assert(
      'Test 6: Missing authorization token returns 401 Unauthorized',
      res.status === 401,
      `HTTP ${res.status}`
    );
  }

  // TEST 7: STUDENT role blocked -> 403 Forbidden
  {
    const res = await request(`/admin/applications/${eligiblePreUniApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(
      'Test 7: STUDENT role cannot access enroll endpoint (403)',
      res.status === 403,
      `HTTP ${res.status}`
    );
  }

  // TEST 8: INSTRUCTOR role blocked -> 403 Forbidden
  {
    const res = await request(`/admin/applications/${eligiblePreUniApp._id}/enroll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${instructorToken}` },
    });
    assert(
      'Test 8: INSTRUCTOR role cannot access enroll endpoint (403)',
      res.status === 403,
      `HTTP ${res.status}`
    );
  }

  // TEST 9: Invalid enrollment ID on cancel -> 404 Not Found
  {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(`/admin/enrollments/${fakeId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ reason: 'testing not found' }),
    });
    assert(
      'Test 9: Invalid enrollment ID returns 404 Not Found',
      res.status === 404,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 10: Valid cancellation & FIFO promotion -> 200 Success
  {
    const res = await request(`/admin/enrollments/${activeEnrollmentId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ reason: 'Candidate withdrew from Academy' }),
    });
    const cancelled = res.body.data?.enrollment;
    const promoted = res.body.data?.promotedEnrollment;
    assert(
      'Test 10: Cancellation succeeds and triggers FIFO promotion of waitlisted student',
      res.status === 200 && cancelled?.status === 'CANCELLED' && Boolean(promoted),
      `HTTP ${res.status}, cancelled: ${cancelled?.status}, promoted ID: ${promoted?._id} (new status: ${promoted?.status})`
    );
  }

  // TEST 11: Repeated cancellation returns 409 Conflict
  {
    const res = await request(`/admin/enrollments/${activeEnrollmentId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ reason: 'Attempting second cancel' }),
    });
    assert(
      'Test 11: Repeated cancellation returns 409 Conflict',
      res.status === 409,
      `HTTP ${res.status}, msg: ${res.body.error?.message}`
    );
  }

  // TEST 12: List Program Enrollments with status filter
  {
    const res = await request(`/admin/programs/${preUniCourse._id}/enrollments?status=CANCELLED`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const enrollments = res.body.data?.enrollments;
    assert(
      'Test 12: GET /api/admin/programs/:id/enrollments filters by status and returns capacity',
      res.status === 200 && Array.isArray(enrollments) && enrollments.every((e) => e.status === 'CANCELLED'),
      `HTTP ${res.status}, returned count: ${enrollments?.length}, capacity occupied: ${res.body.data?.capacity?.occupied}`
    );
  }

  // TEST 13: Program Capacity endpoint
  {
    const res = await request(`/admin/programs/${preUniCourse._id}/capacity`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const cap = res.body.data?.capacity;
    assert(
      'Test 13: GET /api/admin/programs/:id/capacity returns accurate stats',
      res.status === 200 && cap?.capacity === 2 && (cap.occupied <= cap.capacity),
      `HTTP ${res.status}, capacity: ${cap?.capacity}, occupied: ${cap?.occupied}, waitlisted: ${cap?.waitlisted}`
    );
  }

  // TEST 14: Capacity invariant preserved in MongoDB
  {
    const occupiedInDb = await Enrollment.countDocuments({
      program: preUniCourse._id,
      status: { $in: ['PENDING_PAYMENT', 'CONFIRMED'] },
    });
    const invariantPreserved = occupiedInDb <= preUniCourse.capacity;
    assert(
      'Test 14: Final database check confirms capacity invariant (occupied <= capacity)',
      invariantPreserved,
      `DB occupied: ${occupiedInDb} <= capacity: ${preUniCourse.capacity}`
    );
  }

  await mongoose.disconnect();

  const allPassed = results.every((r) => r.pass);
  console.log('\n====================================================');
  console.log(`API MATRIX RESULT: ${results.filter((r) => r.pass).length} / ${results.length} PASSED`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runApiMatrix().catch((err) => {
  console.error(err);
  process.exit(1);
});
