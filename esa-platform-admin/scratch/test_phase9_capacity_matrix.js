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

async function runCapacityMatrix() {
  console.log('====================================================');
  console.log('PHASE 9 — CAPACITY TEST MATRIX (SCENARIOS A, B, C)');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));
  const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const superToken = await login('superadmin@esa.dev');

  // Helper to create test student
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

  // --------------------------------------------------------------------------
  // SCENARIO A: Capacity = 5 | Current: CONFIRMED = 3, PENDING_PAYMENT = 1 (Occupied 4/5)
  // New enrollment -> PENDING_PAYMENT | Final: Occupied 5/5
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO A ---');
  console.log('Setup: Capacity: 5 | CONFIRMED: 3, PENDING_PAYMENT: 1 (Occupied: 4/5)');

  const courseA = await Course.create({
    title: 'Scenario A Satellite Workshop',
    description: 'Testing Scenario A capacity allocation',
    division: 'PRE_UNIVERSITY',
    capacity: 5,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
  });

  // Seed 3 CONFIRMED enrollments
  for (let i = 1; i <= 3; i++) {
    const s = await getOrCreateStudent(`studentA_conf${i}@esa.dev`, `Student A Conf ${i}`);
    const app = await Application.create({
      student: s._id,
      program: courseA._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      decision: 'ACCEPT',
    });
    await Enrollment.create({
      application: app._id,
      student: s._id,
      program: courseA._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      enrolledAt: new Date(Date.now() - 3600000 * (4 - i)),
      confirmedAt: new Date(),
      createdBy: superAdmin._id,
    });
  }

  // Seed 1 PENDING_PAYMENT enrollment
  const sPend = await getOrCreateStudent('studentA_pend@esa.dev', 'Student A Pending');
  const appPend = await Application.create({
    student: sPend._id,
    program: courseA._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });
  await Enrollment.create({
    application: appPend._id,
    student: sPend._id,
    program: courseA._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: new Date(Date.now() - 1800000),
    createdBy: superAdmin._id,
  });

  // Create new candidate application eligible for enrollment
  const sNewA = await getOrCreateStudent('studentA_new@esa.dev', 'Student A New');
  const appNewA = await Application.create({
    student: sNewA._id,
    program: courseA._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });

  // Verify occupied before enrollment
  const occBeforeA = await Enrollment.countDocuments({
    program: courseA._id,
    status: { $in: ['PENDING_PAYMENT', 'CONFIRMED'] },
  });
  console.log(`Pre-condition occupied seats: ${occBeforeA} / ${courseA.capacity}`);

  // Execute Enrollment via API
  const resA = await fetch(`${BASE_URL}/admin/applications/${appNewA._id}/enroll`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${superToken}`,
      'Content-Type': 'application/json',
    },
  });
  const bodyA = await resA.json();
  const enrA = bodyA.data?.enrollment;
  const capA = bodyA.data?.capacity;

  console.log(`Enrollment Response Status: ${resA.status}`);
  console.log(`Enrollment Result Status: ${enrA?.status}`);
  console.log(`Final Occupied Count: ${capA?.occupied} / ${capA?.capacity}`);
  console.log(`Waitlisted Count: ${capA?.waitlisted}`);

  const passA =
    resA.status === 201 &&
    enrA?.status === 'PENDING_PAYMENT' &&
    capA?.occupied === 5 &&
    capA?.capacity === 5 &&
    capA?.waitlisted === 0;

  console.log(`[${passA ? 'PASS' : 'FAIL'}] Scenario A Verification\n`);
  if (!passA) process.exit(1);

  // --------------------------------------------------------------------------
  // SCENARIO B: Capacity = 5 | Current: CONFIRMED = 3, PENDING_PAYMENT = 2 (Occupied 5/5)
  // New enrollment -> WAITLISTED | Final: Occupied 5/5
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO B ---');
  console.log('Setup: Capacity: 5 | CONFIRMED: 3, PENDING_PAYMENT: 2 (Occupied: 5/5)');

  const courseB = await Course.create({
    title: 'Scenario B Planetary Rover',
    description: 'Testing Scenario B capacity full and waitlist',
    division: 'PRE_UNIVERSITY',
    capacity: 5,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
  });

  // Seed 3 CONFIRMED
  for (let i = 1; i <= 3; i++) {
    const s = await getOrCreateStudent(`studentB_conf${i}@esa.dev`, `Student B Conf ${i}`);
    const app = await Application.create({
      student: s._id,
      program: courseB._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      decision: 'ACCEPT',
    });
    await Enrollment.create({
      application: app._id,
      student: s._id,
      program: courseB._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      enrolledAt: new Date(Date.now() - 3600000 * (4 - i)),
      confirmedAt: new Date(),
      createdBy: superAdmin._id,
    });
  }

  // Seed 2 PENDING_PAYMENT
  for (let i = 1; i <= 2; i++) {
    const s = await getOrCreateStudent(`studentB_pend${i}@esa.dev`, `Student B Pend ${i}`);
    const app = await Application.create({
      student: s._id,
      program: courseB._id,
      division: 'PRE_UNIVERSITY',
      status: 'ELIGIBLE_PAYMENT_PENDING',
      decision: 'ACCEPT',
    });
    await Enrollment.create({
      application: app._id,
      student: s._id,
      program: courseB._id,
      division: 'PRE_UNIVERSITY',
      status: 'PENDING_PAYMENT',
      enrolledAt: new Date(Date.now() - 1800000 * (3 - i)),
      createdBy: superAdmin._id,
    });
  }

  // Create new candidate application eligible for enrollment
  const sNewB = await getOrCreateStudent('studentB_new@esa.dev', 'Student B New');
  const appNewB = await Application.create({
    student: sNewB._id,
    program: courseB._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });

  const occBeforeB = await Enrollment.countDocuments({
    program: courseB._id,
    status: { $in: ['PENDING_PAYMENT', 'CONFIRMED'] },
  });
  console.log(`Pre-condition occupied seats: ${occBeforeB} / ${courseB.capacity}`);

  // Execute Enrollment via API
  const resB = await fetch(`${BASE_URL}/admin/applications/${appNewB._id}/enroll`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${superToken}`,
      'Content-Type': 'application/json',
    },
  });
  const bodyB = await resB.json();
  const enrB = bodyB.data?.enrollment;
  const capB = bodyB.data?.capacity;

  console.log(`Enrollment Response Status: ${resB.status}`);
  console.log(`Enrollment Result Status: ${enrB?.status}`);
  console.log(`Final Occupied Count: ${capB?.occupied} / ${capB?.capacity}`);
  console.log(`Waitlisted Count: ${capB?.waitlisted}`);

  const passB =
    resB.status === 201 &&
    enrB?.status === 'WAITLISTED' &&
    capB?.occupied === 5 &&
    capB?.capacity === 5 &&
    capB?.waitlisted === 1;

  console.log(`[${passB ? 'PASS' : 'FAIL'}] Scenario B Verification\n`);
  if (!passB) process.exit(1);

  // --------------------------------------------------------------------------
  // SCENARIO C: Capacity = 5 | Current: CONFIRMED = 4, PENDING_PAYMENT = 1, WAITLISTED = 2
  // Cancel one occupied enrollment -> Oldest waitlisted becomes PENDING_PAYMENT
  // Final: Occupied 5/5, Remaining waitlist: 1
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO C ---');
  console.log('Setup: Capacity: 5 | CONFIRMED: 4, PENDING_PAYMENT: 1, WAITLISTED: 2');

  const courseC = await Course.create({
    title: 'Scenario C Deep Space Telemetry',
    description: 'Testing Scenario C cancellation and FIFO promotion',
    division: 'PRE_UNIVERSITY',
    capacity: 5,
    status: 'ACTIVE',
    createdBy: superAdmin._id,
  });

  // Seed 4 CONFIRMED
  for (let i = 1; i <= 4; i++) {
    const s = await getOrCreateStudent(`studentC_conf${i}@esa.dev`, `Student C Conf ${i}`);
    const app = await Application.create({
      student: s._id,
      program: courseC._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      decision: 'ACCEPT',
    });
    await Enrollment.create({
      application: app._id,
      student: s._id,
      program: courseC._id,
      division: 'PRE_UNIVERSITY',
      status: 'CONFIRMED',
      enrolledAt: new Date(Date.now() - 3600000 * (5 - i)),
      confirmedAt: new Date(),
      createdBy: superAdmin._id,
    });
  }

  // Seed 1 PENDING_PAYMENT (to be cancelled)
  const sPendC = await getOrCreateStudent('studentC_pend@esa.dev', 'Student C Pending');
  const appPendC = await Application.create({
    student: sPendC._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'ELIGIBLE_PAYMENT_PENDING',
    decision: 'ACCEPT',
  });
  const enrToCancel = await Enrollment.create({
    application: appPendC._id,
    student: sPendC._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: new Date(Date.now() - 1800000),
    createdBy: superAdmin._id,
  });

  // Seed 2 WAITLISTED (Waitlist #1 created earlier than Waitlist #2)
  const sWait1 = await getOrCreateStudent('studentC_wait1@esa.dev', 'Student C Oldest Waitlist');
  const appWait1 = await Application.create({
    student: sWait1._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'WAITLISTED',
    decision: 'ACCEPT',
  });
  const enrWait1 = await Enrollment.create({
    application: appWait1._id,
    student: sWait1._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'WAITLISTED',
    enrolledAt: new Date(Date.now() - 1200000),
    createdAt: new Date(Date.now() - 1200000),
    createdBy: superAdmin._id,
  });

  const sWait2 = await getOrCreateStudent('studentC_wait2@esa.dev', 'Student C Newer Waitlist');
  const appWait2 = await Application.create({
    student: sWait2._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'WAITLISTED',
    decision: 'ACCEPT',
  });
  const enrWait2 = await Enrollment.create({
    application: appWait2._id,
    student: sWait2._id,
    program: courseC._id,
    division: 'PRE_UNIVERSITY',
    status: 'WAITLISTED',
    enrolledAt: new Date(Date.now() - 600000),
    createdAt: new Date(Date.now() - 600000),
    createdBy: superAdmin._id,
  });

  const occBeforeC = await Enrollment.countDocuments({
    program: courseC._id,
    status: { $in: ['PENDING_PAYMENT', 'CONFIRMED'] },
  });
  const waitBeforeC = await Enrollment.countDocuments({
    program: courseC._id,
    status: 'WAITLISTED',
  });
  console.log(`Pre-condition occupied seats: ${occBeforeC} / ${courseC.capacity} | Waitlisted: ${waitBeforeC}`);

  // Cancel the 1 PENDING_PAYMENT enrollment via API
  const resCancel = await fetch(`${BASE_URL}/admin/enrollments/${enrToCancel._id}/cancel`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${superToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Student withdrew application before payment' }),
  });
  const bodyCancel = await resCancel.json();
  const cancelledEnr = bodyCancel.data?.enrollment;
  const promotedEnr = bodyCancel.data?.promotedEnrollment;
  const capC = bodyCancel.data?.capacity;

  console.log(`Cancellation Response Status: ${resCancel.status}`);
  console.log(`Cancelled Enrollment Status: ${cancelledEnr?.status}`);
  console.log(`Promoted Enrollment ID: ${promotedEnr?._id} (Expected: ${enrWait1._id})`);
  console.log(`Promoted Enrollment New Status: ${promotedEnr?.status}`);
  console.log(`Final Occupied Count: ${capC?.occupied} / ${capC?.capacity}`);
  console.log(`Remaining Waitlist Count: ${capC?.waitlisted}`);

  // Verify DB state for waitlist 1 and 2
  const updatedWait1 = await Enrollment.findById(enrWait1._id);
  const updatedWait2 = await Enrollment.findById(enrWait2._id);
  const updatedAppWait1 = await Application.findById(appWait1._id);

  console.log(`DB Waitlist 1 Status: ${updatedWait1.status}`);
  console.log(`DB Waitlist 1 Application Status: ${updatedAppWait1.status}`);
  console.log(`DB Waitlist 2 Status: ${updatedWait2.status} (should remain WAITLISTED)`);

  const passC =
    resCancel.status === 200 &&
    cancelledEnr?.status === 'CANCELLED' &&
    promotedEnr?._id?.toString() === enrWait1._id.toString() &&
    updatedWait1.status === 'PENDING_PAYMENT' &&
    updatedWait2.status === 'WAITLISTED' &&
    updatedAppWait1.status === 'ELIGIBLE_PAYMENT_PENDING' &&
    capC?.occupied === 5 &&
    capC?.waitlisted === 1;

  console.log(`[${passC ? 'PASS' : 'FAIL'}] Scenario C Verification\n`);
  if (!passC) process.exit(1);

  console.log('====================================================');
  console.log('CAPACITY MATRIX RESULT: ALL 3 SCENARIOS (A, B, C) PASSED');
  console.log('====================================================');

  await mongoose.disconnect();
}

runCapacityMatrix().catch((err) => {
  console.error(err);
  process.exit(1);
});
