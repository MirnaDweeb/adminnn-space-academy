const mongoose = require('../backend/node_modules/mongoose');

const BASE_URL = 'http://127.0.0.1:5000/api';

async function login(email, password = 'Password123!') {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (res.status !== 200 || !body.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return body.data.token;
}

async function runConcurrencyTest() {
  console.log('====================================================');
  console.log('PHASE 9 — STRICT CONCURRENCY RACE CONDITION TEST');
  console.log('Requirement: Capacity = 1. Two simultaneous requests.');
  console.log('Expected: 1 PENDING_PAYMENT, 1 WAITLISTED. Never 2 PENDING_PAYMENT.');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));

  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const superToken = await login('superadmin@esa.dev');

  async function getOrCreateStudent(email, name) {
    let u = await User.findOne({ email });
    if (!u) {
      u = await User.create({
        fullName: name,
        email,
        password: '$2a$10$X9ZpW8.Nl4L5K4xH0jQ5OuEw61mY/uMhI02bS6n0c1s1qW2e3r4t5',
        role: 'STUDENT',
        division: 'PRE_UNIVERSITY',
        isActive: true,
      });
    }
    return u;
  }

  // We will run 3 sequential trials of 2 simultaneous requests each
  const TRIALS = 3;
  let allTrialsPassed = true;

  for (let trial = 1; trial <= TRIALS; trial++) {
    console.log(`--- TRIAL ${trial} OF ${TRIALS} ---`);

    // 1. Create a course with capacity = 1
    const course = await Course.create({
      title: `Concurrency Trial ${trial} CubeSat Lab`,
      description: `Testing race condition under 2 simultaneous requests (Trial ${trial})`,
      division: 'PRE_UNIVERSITY',
      capacity: 1,
      occupiedSeats: 0,
      status: 'ACTIVE',
      createdBy: superAdmin._id,
    });

    // 2. Create two students and two eligible applications
    const s1 = await getOrCreateStudent(`conc_trial${trial}_s1@esa.dev`, `Conc S1 Trial ${trial}`);
    const s2 = await getOrCreateStudent(`conc_trial${trial}_s2@esa.dev`, `Conc S2 Trial ${trial}`);

    const app1 = await Application.create({
      student: s1._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });

    const app2 = await Application.create({
      student: s2._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });

    console.log(`Course Created: "${course.title}" | Capacity: ${course.capacity}`);
    console.log(`Eligible App 1: ${app1._id} | Eligible App 2: ${app2._id}`);
    console.log('Triggering concurrent enrollment requests via Promise.all...');

    // 3. Fire both requests as close to simultaneously as possible
    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/admin/applications/${app1._id}/enroll`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superToken}`,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${BASE_URL}/admin/applications/${app2._id}/enroll`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superToken}`,
          'Content-Type': 'application/json',
        },
      }),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    const status1 = body1.data?.enrollment?.status;
    const status2 = body2.data?.enrollment?.status;

    console.log(`Request 1 HTTP: ${res1.status} | Enrollment Status: ${status1}`);
    console.log(`Request 2 HTTP: ${res2.status} | Enrollment Status: ${status2}`);

    // 4. Verify in MongoDB directly
    const dbOccupied = await Enrollment.countDocuments({
      program: course._id,
      status: { $in: ['PENDING_PAYMENT', 'CONFIRMED'] },
    });
    const dbWaitlisted = await Enrollment.countDocuments({
      program: course._id,
      status: 'WAITLISTED',
    });
    const dbCourse = await Course.findById(course._id);

    console.log(`DB Occupied Count: ${dbOccupied} (Max allowed: ${course.capacity})`);
    console.log(`DB Waitlisted Count: ${dbWaitlisted}`);
    console.log(`DB Course.occupiedSeats: ${dbCourse.occupiedSeats}`);

    const statuses = [status1, status2].sort();
    const exactOnePendingAndOneWaitlisted =
      statuses[0] === 'PENDING_PAYMENT' && statuses[1] === 'WAITLISTED';
    const invariantPreserved = dbOccupied <= course.capacity && dbOccupied === 1;

    const trialPassed =
      res1.status === 201 &&
      res2.status === 201 &&
      exactOnePendingAndOneWaitlisted &&
      invariantPreserved &&
      dbWaitlisted === 1;

    console.log(
      `[${trialPassed ? 'PASS' : 'FAIL'}] Trial ${trial} Concurrency Safety: ${
        trialPassed ? 'Strict invariant preserved (1 reserved, 1 waitlisted)' : 'RACE CONDITION DETECTED'
      }\n`
    );

    if (!trialPassed) {
      allTrialsPassed = false;
      break;
    }
  }

  await mongoose.disconnect();

  console.log('====================================================');
  if (allTrialsPassed) {
    console.log(`CONCURRENCY RESULT: ALL ${TRIALS} CONCURRENCY TRIALS PASSED!`);
    console.log('Race condition safety verified under simultaneous requests.');
  } else {
    console.error('CONCURRENCY RESULT: FAILED!');
    process.exit(1);
  }
  console.log('====================================================');
}

runConcurrencyTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
