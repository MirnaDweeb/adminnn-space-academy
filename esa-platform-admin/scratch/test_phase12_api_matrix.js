const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');

const BASE_HOST = '127.0.0.1';
const BASE_PORT = 5000;

function request({ method, path, token, body }) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request(
      {
        host: BASE_HOST,
        port: BASE_PORT,
        method,
        path,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function login(email, password = 'Password123!') {
  const res = await request({
    method: 'POST',
    path: '/api/auth/login',
    body: { email, password },
  });
  if (res.status !== 200 || !res.data?.data?.token) {
    throw new Error(`Failed to login as ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runMatrix() {
  console.log('================================================================');
  console.log('PHASE 12: EVALUATIONS & LEARNING OUTCOMES — API TEST MATRIX');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const User = require('../backend/src/models/User');
  const Course = require('../backend/src/models/Course');
  const Application = require('../backend/src/models/Application');
  const Enrollment = require('../backend/src/models/Enrollment');
  const Cohort = require('../backend/src/models/Cohort');
  const Attendance = require('../backend/src/models/Attendance');
  const Assignment = require('../backend/src/models/Assignment');
  const Assessment = require('../backend/src/models/Assessment');
  const Evaluation = require('../backend/src/models/Evaluation');
  const AuditLog = require('../backend/src/models/AuditLog');

  // Obtain role tokens
  const superToken = await login('superadmin@esa.dev');
  const preUniAdminToken = await login('preuni.admin@esa.dev');
  const uniAdminToken = await login('uni.admin@esa.dev');
  const preUniInstructorToken = await login('instructor@esa.dev');
  const uniInstructorToken = await login('uni.instructor@esa.dev');
  const studentToken = await login('student@esa.dev');

  const preUniInstructor = await User.findOne({ email: 'instructor@esa.dev' });
  const uniInstructor = await User.findOne({ email: 'uni.instructor@esa.dev' });
  const studentUser1 = await User.findOne({ email: 'student@esa.dev' });

  // Create additional students for varied testing:
  // Student 2: Passes attendance (100%), high scores (95%) -> PASS
  // Student 3: Fails attendance (25%), high scores (100%) -> FAIL (Gate failure overrides score)
  // Student 4: Passes attendance (100%), low score (40%) -> FAIL (Score below 60%)
  // Student 5: Passes attendance (100%), unsubmitted assignments -> INCOMPLETE
  // Student 6: PENDING_PAYMENT (not confirmed) -> EXCLUDED
  async function getOrCreateStudent(email, fullName) {
    let u = await User.findOne({ email });
    if (!u) {
      const bcrypt = require('../backend/node_modules/bcrypt');
      const hash = await bcrypt.hash('Password123!', 10);
      u = await User.create({
        email,
        passwordHash: hash,
        fullName,
        role: 'STUDENT',
        division: 'PRE_UNIVERSITY',
        isActive: true,
      });
    }
    return u;
  }

  const studentUser2 = await getOrCreateStudent('student2.eval@esa.dev', 'Youssef High Achiever');
  const studentUser3 = await getOrCreateStudent('student3.eval@esa.dev', 'Mariam Gate Breaker');
  const studentUser4 = await getOrCreateStudent('student4.eval@esa.dev', 'Omar Diligent Attender');
  const studentUser5 = await getOrCreateStudent('student5.eval@esa.dev', 'Farida Partial Deliverable');
  const studentUser6 = await getOrCreateStudent('student6.unconfirmed@esa.dev', 'Karim Unconfirmed Student');

  const student2Token = await login('student2.eval@esa.dev');
  const student3Token = await login('student3.eval@esa.dev');

  // Clean old test cohorts for this matrix
  await Cohort.deleteMany({ name: /^Phase12 Matrix Cohort/ });
  await Course.deleteMany({ title: /^Phase12 Matrix Program/ });
  await Evaluation.deleteMany({});

  const now = new Date();
  const testCourse = await Course.create({
    title: `Phase12 Matrix Program ${Date.now()}`,
    description: 'Testing Phase 12 Evaluation Rules and Append-Only History',
    division: 'PRE_UNIVERSITY',
    level: 'BEGINNER',
    capacity: 25,
    price: 3500,
    deliveryMode: 'HYBRID',
    status: 'ACTIVE',
    createdBy: preUniInstructor._id,
  });

  // Create a 4-session cohort
  const cohort = await Cohort.create({
    cohortNumber: `COH-PRE-${now.getFullYear()}-P12`,
    name: `Phase12 Matrix Cohort ${Date.now()}`,
    program: testCourse._id,
    division: 'PRE_UNIVERSITY',
    instructor: preUniInstructor._id,
    startDate: new Date(now.getTime() - 20 * 86400000),
    endDate: new Date(now.getTime() - 2 * 86400000),
    status: 'COMPLETED',
    capacity: 25,
    sessions: [
      { sessionNumber: 1, date: new Date(now.getTime() - 18 * 86400000), topic: 'Session 1: Orbit Mechanics', durationMinutes: 120, location: 'Lab A' },
      { sessionNumber: 2, date: new Date(now.getTime() - 14 * 86400000), topic: 'Session 2: Satellite Bus', durationMinutes: 120, location: 'Lab A' },
      { sessionNumber: 3, date: new Date(now.getTime() - 10 * 86400000), topic: 'Session 3: Telemetry', durationMinutes: 120, location: 'Lab A' },
      { sessionNumber: 4, date: new Date(now.getTime() - 6 * 86400000), topic: 'Session 4: Payload Integration', durationMinutes: 120, location: 'Lab A' },
    ],
    createdBy: preUniInstructor._id,
  });

  // Create 2 cohort assignments (each maxScore 100)
  const assign1 = await Assignment.create({
    cohort: cohort._id,
    title: 'Orbital Ephemeris Calculator',
    dueDate: new Date(now.getTime() - 8 * 86400000),
    maxScore: 100,
    createdBy: preUniInstructor._id,
  });
  const assign2 = await Assignment.create({
    cohort: cohort._id,
    title: 'Payload Power Budget',
    dueDate: new Date(now.getTime() - 4 * 86400000),
    maxScore: 100,
    createdBy: preUniInstructor._id,
  });

  // Create applications and enrollments
  async function createEnrollmentForStudent(student, status = 'CONFIRMED') {
    const app = await Application.create({
      student: student._id,
      program: testCourse._id,
      division: 'PRE_UNIVERSITY',
      status: status === 'CONFIRMED' ? 'CONFIRMED' : 'SUBMITTED',
      decision: status === 'CONFIRMED' ? 'ACCEPT' : null,
    });
    return await Enrollment.create({
      application: app._id,
      student: student._id,
      program: testCourse._id,
      cohort: cohort._id,
      division: 'PRE_UNIVERSITY',
      status,
      confirmedAt: status === 'CONFIRMED' ? new Date() : null,
      enrolledAt: new Date(),
      createdBy: preUniInstructor._id,
    });
  }

  const enr1 = await createEnrollmentForStudent(studentUser1, 'CONFIRMED');
  const enr2 = await createEnrollmentForStudent(studentUser2, 'CONFIRMED');
  const enr3 = await createEnrollmentForStudent(studentUser3, 'CONFIRMED');
  const enr4 = await createEnrollmentForStudent(studentUser4, 'CONFIRMED');
  const enr5 = await createEnrollmentForStudent(studentUser5, 'CONFIRMED');
  const enr6 = await createEnrollmentForStudent(studentUser6, 'PENDING_PAYMENT'); // Unconfirmed!

  // Setup Attendance and Assessments:
  // Student 1: 4/4 sessions (100%), assign1 = 80, assign2 = 70 (avg 75%) -> PASS
  for (const s of cohort.sessions) {
    await Attendance.create({ cohort: cohort._id, sessionId: s._id, sessionNumber: s.sessionNumber, sessionDate: s.date, student: studentUser1._id, enrollment: enr1._id, status: 'PRESENT', recordedBy: preUniInstructor._id });
  }
  await Assessment.create({ assignment: assign1._id, cohort: cohort._id, student: studentUser1._id, enrollment: enr1._id, score: 80, gradedBy: preUniInstructor._id });
  await Assessment.create({ assignment: assign2._id, cohort: cohort._id, student: studentUser1._id, enrollment: enr1._id, score: 70, gradedBy: preUniInstructor._id });

  // Student 2: 4/4 sessions (100%), assign1 = 95, assign2 = 95 (avg 95%) -> PASS
  for (const s of cohort.sessions) {
    await Attendance.create({ cohort: cohort._id, sessionId: s._id, sessionNumber: s.sessionNumber, sessionDate: s.date, student: studentUser2._id, enrollment: enr2._id, status: 'PRESENT', recordedBy: preUniInstructor._id });
  }
  await Assessment.create({ assignment: assign1._id, cohort: cohort._id, student: studentUser2._id, enrollment: enr2._id, score: 95, gradedBy: preUniInstructor._id });
  await Assessment.create({ assignment: assign2._id, cohort: cohort._id, student: studentUser2._id, enrollment: enr2._id, score: 95, gradedBy: preUniInstructor._id });

  // Student 3: 1/4 sessions (25% attendance < 80% gate), assign1 = 100, assign2 = 100 (avg 100%) -> FAIL (Gate Override!)
  await Attendance.create({ cohort: cohort._id, sessionId: cohort.sessions[0]._id, sessionNumber: 1, sessionDate: cohort.sessions[0].date, student: studentUser3._id, enrollment: enr3._id, status: 'PRESENT', recordedBy: preUniInstructor._id });
  await Attendance.create({ cohort: cohort._id, sessionId: cohort.sessions[1]._id, sessionNumber: 2, sessionDate: cohort.sessions[1].date, student: studentUser3._id, enrollment: enr3._id, status: 'ABSENT', recordedBy: preUniInstructor._id });
  await Attendance.create({ cohort: cohort._id, sessionId: cohort.sessions[2]._id, sessionNumber: 3, sessionDate: cohort.sessions[2].date, student: studentUser3._id, enrollment: enr3._id, status: 'ABSENT', recordedBy: preUniInstructor._id });
  await Attendance.create({ cohort: cohort._id, sessionId: cohort.sessions[3]._id, sessionNumber: 4, sessionDate: cohort.sessions[3].date, student: studentUser3._id, enrollment: enr3._id, status: 'ABSENT', recordedBy: preUniInstructor._id });
  await Assessment.create({ assignment: assign1._id, cohort: cohort._id, student: studentUser3._id, enrollment: enr3._id, score: 100, gradedBy: preUniInstructor._id });
  await Assessment.create({ assignment: assign2._id, cohort: cohort._id, student: studentUser3._id, enrollment: enr3._id, score: 100, gradedBy: preUniInstructor._id });

  // Student 4: 4/4 sessions (100%), assign1 = 40, assign2 = 50 (avg 45% < 60%) -> FAIL (Score below threshold)
  for (const s of cohort.sessions) {
    await Attendance.create({ cohort: cohort._id, sessionId: s._id, sessionNumber: s.sessionNumber, sessionDate: s.date, student: studentUser4._id, enrollment: enr4._id, status: 'PRESENT', recordedBy: preUniInstructor._id });
  }
  await Assessment.create({ assignment: assign1._id, cohort: cohort._id, student: studentUser4._id, enrollment: enr4._id, score: 40, gradedBy: preUniInstructor._id });
  await Assessment.create({ assignment: assign2._id, cohort: cohort._id, student: studentUser4._id, enrollment: enr4._id, score: 50, gradedBy: preUniInstructor._id });

  // Student 5: 4/4 sessions (100%), NO assessments recorded -> INCOMPLETE
  for (const s of cohort.sessions) {
    await Attendance.create({ cohort: cohort._id, sessionId: s._id, sessionNumber: s.sessionNumber, sessionDate: s.date, student: studentUser5._id, enrollment: enr5._id, status: 'PRESENT', recordedBy: preUniInstructor._id });
  }

  const results = [];
  function assert(name, pass, detail) {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`[${pass ? '✓ PASS' : '✗ FAIL'}] ${name} ${detail ? `| ${detail}` : ''}`);
  }

  // =================================================================
  // TEST SUITE 1: AUTHENTICATION & ROLE AUTHORIZATION MATRIX
  // =================================================================
  console.log('\n--- 1. Authentication & Role Authorization Matrix ---');

  // 1.1 Unauthenticated attempt to evaluate
  const unauthEval = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
  });
  assert('1.1 Unauthenticated evaluate returns 401', unauthEval.status === 401, `Status: ${unauthEval.status}`);

  // 1.2 Instructor attempting to evaluate cohort
  const instructorEval = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
    token: preUniInstructorToken,
  });
  assert('1.2 Instructor attempting to trigger evaluate returns 403', instructorEval.status === 403, `Status: ${instructorEval.status}`);

  // 1.3 Student attempting to evaluate cohort
  const studentEval = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
    token: studentToken,
  });
  assert('1.3 Student attempting to trigger evaluate returns 403', studentEval.status === 403, `Status: ${studentEval.status}`);

  // 1.4 Cross-division admin attempting to evaluate cohort (UNI admin -> PRE-UNI cohort)
  const crossDivEval = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
    token: uniAdminToken,
  });
  assert('1.4 Cross-division admin attempt returns 403', crossDivEval.status === 403, `Status: ${crossDivEval.status}`);

  // 1.5 Invalid cohort ID returns 404
  const fakeId = new mongoose.Types.ObjectId();
  const invalidCohortEval = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${fakeId}/evaluate`,
    token: preUniAdminToken,
  });
  assert('1.5 Invalid cohort ID returns 404', invalidCohortEval.status === 404, `Status: ${invalidCohortEval.status}`);

  // =================================================================
  // TEST SUITE 2: EVALUATION COMPUTATION & BUSINESS LOGIC
  // =================================================================
  console.log('\n--- 2. Evaluation Computation & Business Logic Verification ---');

  // 2.1 Valid evaluation computation by Division Admin
  const evalRun1 = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
    token: preUniAdminToken,
  });
  assert('2.1 Division Admin executes evaluateCohort successfully', evalRun1.status === 200 && evalRun1.data?.success === true, `Status: ${evalRun1.status}`);

  const evals1 = evalRun1.data?.data?.evaluations || [];
  const summary1 = evalRun1.data?.data?.summary || {};
  assert('2.2 Evaluated count matches 5 confirmed students (excludes unconfirmed)', evals1.length === 5 && summary1.total === 5, `Total evaluated: ${evals1.length}`);

  // Check exclusion of unconfirmed student 6
  const unconfirmedEvaluated = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser6._id));
  assert('2.3 Unconfirmed student excluded from evaluation (not evaluated or defaulted to FAIL)', unconfirmedEvaluated === undefined);

  // Check Student 1: Attendance 100%, Score 75% -> PASS
  const s1Eval = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser1._id));
  assert(
    '2.4 Student 1: 100% attendance, 75% average score -> PASS',
    s1Eval?.outcome === 'PASS' && s1Eval?.attendanceRate === 100 && s1Eval?.averageScore === 75 && s1Eval?.attendanceThresholdMet === true,
    `Outcome: ${s1Eval?.outcome}, Rate: ${s1Eval?.attendanceRate}%, Avg: ${s1Eval?.averageScore}%`
  );

  // Check Student 2: Attendance 100%, Score 95% -> PASS
  const s2Eval = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser2._id));
  assert(
    '2.5 Student 2: 100% attendance, 95% average score -> PASS',
    s2Eval?.outcome === 'PASS' && s2Eval?.attendanceRate === 100 && s2Eval?.averageScore === 95 && s2Eval?.attendanceThresholdMet === true,
    `Outcome: ${s2Eval?.outcome}, Rate: ${s2Eval?.attendanceRate}%, Avg: ${s2Eval?.averageScore}%`
  );

  // Check Student 3: Attendance 25% (< 80%), Score 100% -> FAIL (Gate override verified!)
  const s3Eval = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser3._id));
  assert(
    '2.6 Student 3: 25% attendance (< 80% threshold), 100% score -> FAIL (Gate failure overrides score)',
    s3Eval?.outcome === 'FAIL' && s3Eval?.attendanceRate === 25 && s3Eval?.attendanceThresholdMet === false && s3Eval?.averageScore === 100,
    `Outcome: ${s3Eval?.outcome}, Rate: ${s3Eval?.attendanceRate}%, Avg: ${s3Eval?.averageScore}%, Reason: "${s3Eval?.outcomeReason}"`
  );

  // Check Student 4: Attendance 100%, Score 45% (< 60%) -> FAIL (Score below threshold)
  const s4Eval = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser4._id));
  assert(
    '2.7 Student 4: 100% attendance, 45% score (< 60% threshold) -> FAIL (Score failure)',
    s4Eval?.outcome === 'FAIL' && s4Eval?.attendanceRate === 100 && s4Eval?.attendanceThresholdMet === true && s4Eval?.averageScore === 45,
    `Outcome: ${s4Eval?.outcome}, Rate: ${s4Eval?.attendanceRate}%, Avg: ${s4Eval?.averageScore}%`
  );

  // Check Student 5: Attendance 100%, No assessments -> INCOMPLETE
  const s5Eval = evals1.find((e) => String(e.student?._id || e.student) === String(studentUser5._id));
  assert(
    '2.8 Student 5: 100% attendance, 0 assessments graded -> INCOMPLETE',
    s5Eval?.outcome === 'INCOMPLETE' && s5Eval?.attendanceRate === 100,
    `Outcome: ${s5Eval?.outcome}, Reason: "${s5Eval?.outcomeReason}"`
  );

  // Summary counts assertion
  assert(
    '2.9 Summary counts verified: 2 PASS, 2 FAIL, 1 INCOMPLETE',
    summary1.passCount === 2 && summary1.failCount === 2 && summary1.incompleteCount === 1,
    `Pass: ${summary1.passCount}, Fail: ${summary1.failCount}, Incomplete: ${summary1.incompleteCount}`
  );

  // =================================================================
  // TEST SUITE 3: APPEND-ONLY RE-EVALUATION & HISTORY
  // =================================================================
  console.log('\n--- 3. Append-Only Re-Evaluation & Non-Destructive History ---');

  // Verify total evaluation documents in DB after Run 1
  const countRun1 = await Evaluation.countDocuments({ cohort: cohort._id });
  assert('3.1 Exactly 5 evaluation documents in DB after Run 1', countRun1 === 5, `Count: ${countRun1}`);

  // Re-run evaluation via Super Admin
  const evalRun2 = await request({
    method: 'POST',
    path: `/api/admin/cohorts/${cohort._id}/evaluate`,
    token: superToken,
  });
  assert('3.2 Super Admin re-runs evaluateCohort successfully', evalRun2.status === 200);

  const countRun2 = await Evaluation.countDocuments({ cohort: cohort._id });
  assert('3.3 Database has 10 evaluation documents after Run 2 (Append-only, no overwrite)', countRun2 === 10, `Count: ${countRun2}`);

  // Query cohort evaluations endpoint: GET /api/admin/cohorts/:id/evaluations
  const getEvalsRes = await request({
    method: 'GET',
    path: `/api/admin/cohorts/${cohort._id}/evaluations`,
    token: preUniAdminToken,
  });
  assert('3.4 GET /api/admin/cohorts/:id/evaluations returns 200', getEvalsRes.status === 200);
  assert(
    '3.5 Returns latest evaluation per student (5 students) and full history (10 records)',
    getEvalsRes.data?.data?.evaluations?.length === 5 && getEvalsRes.data?.data?.history?.length === 10,
    `Latest: ${getEvalsRes.data?.data?.evaluations?.length}, History: ${getEvalsRes.data?.data?.history?.length}`
  );

  // Query with studentId filter: history per student
  const studentHistoryRes = await request({
    method: 'GET',
    path: `/api/admin/cohorts/${cohort._id}/evaluations?studentId=${studentUser1._id}`,
    token: preUniAdminToken,
  });
  assert(
    '3.6 History for Student 1 shows exactly 2 append-only evaluations',
    studentHistoryRes.data?.data?.history?.length === 2,
    `Student 1 runs: ${studentHistoryRes.data?.data?.history?.length}`
  );

  // =================================================================
  // TEST SUITE 4: INSTRUCTOR ACCESS MATRIX
  // =================================================================
  console.log('\n--- 4. Instructor Read-Only Scoped Access Matrix ---');

  // Assigned instructor can view evaluations for their assigned cohort
  const instructorAssignedView = await request({
    method: 'GET',
    path: `/api/instructor/cohorts/${cohort._id}/evaluations`,
    token: preUniInstructorToken,
  });
  assert('4.1 Assigned Instructor views evaluations for assigned cohort (200 OK)', instructorAssignedView.status === 200 && instructorAssignedView.data?.data?.evaluations?.length === 5);

  // Non-assigned instructor (UNI instructor) attempting to view pre-uni cohort evaluations
  const nonAssignedInstructorView = await request({
    method: 'GET',
    path: `/api/instructor/cohorts/${cohort._id}/evaluations`,
    token: uniInstructorToken,
  });
  assert('4.2 Non-assigned Instructor blocked from viewing cohort evaluations (403 Forbidden)', nonAssignedInstructorView.status === 403, `Status: ${nonAssignedInstructorView.status}`);

  // Instructor attempting to call admin evaluations endpoint directly
  const instructorAdminEndpoint = await request({
    method: 'GET',
    path: `/api/admin/cohorts/${cohort._id}/evaluations`,
    token: preUniInstructorToken,
  });
  assert('4.3 Instructor calling /api/admin/cohorts/:id/evaluations blocked (403 Forbidden)', instructorAdminEndpoint.status === 403, `Status: ${instructorAdminEndpoint.status}`);

  // =================================================================
  // TEST SUITE 5: STUDENT READ-ONLY EVALUATIONS ENDPOINT
  // =================================================================
  console.log('\n--- 5. Student Read-Only Evaluations Matrix ---');

  // Student 1 views own evaluations via /api/student/mine/evaluations
  const student1Evals = await request({
    method: 'GET',
    path: '/api/student/mine/evaluations',
    token: studentToken,
  });
  assert('5.1 Student 1 accesses GET /api/student/mine/evaluations (200 OK)', student1Evals.status === 200 && Array.isArray(student1Evals.data?.data));

  const s1History = student1Evals.data?.data || [];
  assert('5.2 Student 1 sees their own evaluations (2 runs) with PASS outcome', s1History.length === 2 && s1History[0].outcome === 'PASS');

  // Also test plural route /api/students/mine/evaluations
  const student1Plural = await request({
    method: 'GET',
    path: '/api/students/mine/evaluations',
    token: studentToken,
  });
  assert('5.3 Student accesses GET /api/students/mine/evaluations plural alias (200 OK)', student1Plural.status === 200 && student1Plural.data?.data?.length === 2);

  // Student 3 (gate failure) views own evaluation: confirms FAIL outcome visible
  const student3Evals = await request({
    method: 'GET',
    path: '/api/student/mine/evaluations',
    token: student3Token,
  });
  assert(
    '5.4 Student 3 sees their own FAIL outcome with gate failure explanation',
    student3Evals.status === 200 && student3Evals.data?.data?.[0]?.outcome === 'FAIL' && student3Evals.data?.data?.[0]?.attendanceThresholdMet === false,
    `Student 3 outcome: ${student3Evals.data?.data?.[0]?.outcome}`
  );

  // Unauthenticated student access
  const unauthStudent = await request({
    method: 'GET',
    path: '/api/student/mine/evaluations',
  });
  assert('5.5 Unauthenticated request to /api/student/mine/evaluations returns 401', unauthStudent.status === 401);

  // =================================================================
  // TEST SUITE 6: AUDIT LOG VERIFICATION
  // =================================================================
  console.log('\n--- 6. Audit Log Verification ---');

  const auditLogs = await AuditLog.find({
    action: 'EVALUATION_COMPUTED',
    resourceId: cohort._id,
  }).sort({ timestamp: -1 });

  assert('6.1 Exactly 2 EVALUATION_COMPUTED audit records created (one per evaluate execution)', auditLogs.length === 2, `Found: ${auditLogs.length}`);

  const latestAudit = auditLogs[0];
  assert(
    '6.2 Audit record captures actor, resource, division, and outcome summary',
    latestAudit &&
      latestAudit.action === 'EVALUATION_COMPUTED' &&
      latestAudit.resource === 'Cohort' &&
      latestAudit.division === 'PRE_UNIVERSITY' &&
      latestAudit.after?.totalEvaluated === 5 &&
      latestAudit.after?.passCount === 2 &&
      latestAudit.after?.failCount === 2,
    `Audit action: ${latestAudit?.action}, division: ${latestAudit?.division}, reason: "${latestAudit?.reason}"`
  );

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.pass);
  const passedCount = results.filter((r) => r.pass).length;
  console.log(`PHASE 12 API MATRIX RESULT: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  await mongoose.disconnect();

  if (!allPassed) {
    process.exit(1);
  }
}

runMatrix().catch((err) => {
  console.error('API matrix error:', err);
  process.exit(1);
});
