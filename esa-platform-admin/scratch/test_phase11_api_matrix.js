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

async function run() {
  console.log('===============================================================');
  console.log('PHASE 11: TRAINING DELIVERY, ATTENDANCE & ASSESSMENTS API MATRIX');
  console.log('===============================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = require('../backend/src/models/Course');
  const Application = require('../backend/src/models/Application');
  const Enrollment = require('../backend/src/models/Enrollment');
  const Invoice = require('../backend/src/models/Invoice');
  const User = require('../backend/src/models/User');
  const Cohort = require('../backend/src/models/Cohort');
  const Attendance = require('../backend/src/models/Attendance');
  const Assignment = require('../backend/src/models/Assignment');
  const Assessment = require('../backend/src/models/Assessment');
  const AuditLog = require('../backend/src/models/AuditLog');

  // Obtain tokens
  const superToken = await login('superadmin@esa.dev');
  const preUniAdminToken = await login('preuni.admin@esa.dev');
  const uniAdminToken = await login('uni.admin@esa.dev');
  const preUniInstructor = await User.findOne({ email: 'instructor@esa.dev' });
  const uniInstructor = await User.findOne({ email: 'uni.instructor@esa.dev' });
  const studentUser = await User.findOne({ email: 'student@esa.dev' });

  const preUniInstructorToken = await login('instructor@esa.dev');
  const uniInstructorToken = await login('uni.instructor@esa.dev');
  const studentToken = await login('student@esa.dev');

  const testResults = [];
  function assert(name, pass, detail) {
    testResults.push({ name, pass, detail });
    console.log(`[${pass ? '✓' : '✗'}] ${name}: ${detail || ''}`);
  }

  // Clean old Phase 11 test data
  await Cohort.deleteMany({ name: /^API Matrix/ });
  await Course.deleteMany({ title: /^API Matrix Program/ });

  const now = new Date();

  // Create confirmed program & enrollment for pre-university
  const preUniAdminUser = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const testCourse = await Course.create({
    title: `API Matrix Program ${Date.now()}`,
    description: 'Testing Phase 11 Cohorts, Attendance and Assignments',
    division: 'PRE_UNIVERSITY',
    level: 'BEGINNER',
    price: 3500,
    currency: 'EGP',
    capacity: 10,
    occupiedSeats: 1,
    status: 'ACTIVE',
    createdBy: preUniAdminUser._id,
  });

  const testApp = await Application.create({
    student: studentUser._id,
    program: testCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'CONFIRMED',
    decision: 'ACCEPT',
    submittedAt: now,
  });

  const confirmedEnrollment = await Enrollment.create({
    student: studentUser._id,
    program: testCourse._id,
    application: testApp._id,
    division: 'PRE_UNIVERSITY',
    status: 'CONFIRMED',
    enrolledAt: now,
    confirmedAt: now,
    createdBy: preUniAdminUser._id,
  });

  // Create a second student with a PENDING_PAYMENT enrollment (not confirmed!) to test business rule rejection
  const unconfirmedStudent = await User.findOne({ role: 'STUDENT', _id: { $ne: studentUser._id } }) || studentUser;
  const testApp2 = await Application.create({
    student: unconfirmedStudent._id,
    program: testCourse._id,
    division: 'PRE_UNIVERSITY',
    status: 'SUBMITTED',
    decision: 'ACCEPT',
    submittedAt: now,
  });

  const unconfirmedEnrollment = await Enrollment.create({
    student: unconfirmedStudent._id,
    program: testCourse._id,
    application: testApp2._id,
    division: 'PRE_UNIVERSITY',
    status: 'PENDING_PAYMENT',
    enrolledAt: now,
    createdBy: preUniAdminUser._id,
  });

  console.log(`[SEED] Created Course: "${testCourse.title}"`);
  console.log(`[SEED] Confirmed Enrollment for student: ${studentUser.email} (ID: ${confirmedEnrollment._id})`);
  console.log(`[SEED] Non-confirmed Enrollment: ${unconfirmedEnrollment._id} (Status: PENDING_PAYMENT)\n`);

  let createdCohort = null;
  let testAssignment = null;

  // 1. Unauthenticated request
  const unauthRes = await request({
    method: 'POST',
    path: '/api/admin/cohorts',
    body: {},
  });
  assert('UNAUTH_401', unauthRes.status === 401, 'Unauthenticated cohort creation rejected with 401');

  // 2. Student attempting to create cohort
  const studentCreateRes = await request({
    method: 'POST',
    path: '/api/admin/cohorts',
    token: studentToken,
    body: {},
  });
  assert('STUDENT_CREATE_403', studentCreateRes.status === 403, 'Student cannot create cohorts (403 Forbidden)');

  // 3. Valid Cohort Creation by Division Admin
  const startDate = new Date(now.getTime() + 86400000);
  const endDate = new Date(now.getTime() + 30 * 86400000);
  const createCohortRes = await request({
    method: 'POST',
    path: '/api/admin/cohorts',
    token: preUniAdminToken,
    body: {
      programId: testCourse._id,
      name: `API Matrix Spring Batch 2026`,
      instructorId: preUniInstructor._id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      capacity: 10,
      sessions: [
        { sessionNumber: 1, date: startDate.toISOString(), topic: 'Introduction to Orbit Propagation', durationMinutes: 120 },
        { sessionNumber: 2, date: new Date(startDate.getTime() + 7 * 86400000).toISOString(), topic: 'Keplerian Elements Simulation', durationMinutes: 120 },
      ],
    },
  });
  assert(
    'ADMIN_CREATE_COHORT_SUCCESS',
    createCohortRes.status === 201 && createCohortRes.data?.data?.cohortNumber,
    `Cohort created: ${createCohortRes.data?.data?.cohortNumber} (${createCohortRes.data?.data?.name})`
  );
  createdCohort = createCohortRes.data?.data;

  // 4. Verify Automatic Confirmed Student Enrollment Linkage
  const refreshedEnrollment = await Enrollment.findById(confirmedEnrollment._id);
  assert(
    'ENROLLMENT_COHORT_LINKAGE',
    String(refreshedEnrollment.cohort) === String(createdCohort._id),
    `Confirmed student enrollment automatically linked to cohort ${createdCohort.cohortNumber}`
  );

  // 5. Cross-Division Cohort Creation Attempt (University Admin on Pre-University Course)
  const crossDivCreateRes = await request({
    method: 'POST',
    path: '/api/admin/cohorts',
    token: uniAdminToken,
    body: {
      programId: testCourse._id,
      name: 'Cross Division Attempt',
      instructorId: uniInstructor._id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  });
  assert('CROSS_DIVISION_CREATE_403', crossDivCreateRes.status === 403, 'University Admin blocked from creating Pre-University cohort (403)');

  // 6. Cross-Division Cohort Detail View Attempt
  const crossDivGetRes = await request({
    method: 'GET',
    path: `/api/admin/cohorts/${createdCohort._id}`,
    token: uniAdminToken,
  });
  assert('CROSS_DIVISION_VIEW_403', crossDivGetRes.status === 403, 'University Admin blocked from viewing Pre-University cohort (403)');

  // 7. Instructor lists only their assigned cohorts
  const instructorListRes = await request({
    method: 'GET',
    path: '/api/instructor/cohorts',
    token: preUniInstructorToken,
  });
  const instructorCohorts = instructorListRes.data?.data?.cohorts || [];
  const foundAssigned = instructorCohorts.some((c) => String(c._id) === String(createdCohort._id));
  assert('INSTRUCTOR_LIST_ASSIGNED', instructorListRes.status === 200 && foundAssigned, `Instructor sees assigned cohort ${createdCohort.cohortNumber}`);

  // 8. Other Instructor (University Instructor) attempts to view/act on Pre-Uni cohort
  const wrongInstructorGetRes = await request({
    method: 'GET',
    path: `/api/instructor/cohorts/${createdCohort._id}`,
    token: uniInstructorToken,
  });
  assert('WRONG_INSTRUCTOR_VIEW_403', wrongInstructorGetRes.status === 403, 'Unassigned instructor blocked from cohort (403 Forbidden)');

  // 9. Session 1 Attendance: Student with non-confirmed enrollment rejected (400 Bad Request)
  const firstSession = createdCohort.sessions[0];
  const invalidAttendanceRes = await request({
    method: 'POST',
    path: `/api/instructor/cohorts/${createdCohort._id}/attendance`,
    token: preUniInstructorToken,
    body: {
      sessionId: firstSession._id,
      records: [{ studentId: unconfirmedStudent._id, status: 'PRESENT' }],
    },
  });
  assert(
    'ATTENDANCE_NON_CONFIRMED_STUDENT_400',
    invalidAttendanceRes.status === 400,
    'Non-confirmed student rejected with 400 Bad Request'
  );

  // 10. Valid Attendance Recording by Assigned Instructor
  const validAttendanceRes = await request({
    method: 'POST',
    path: `/api/instructor/cohorts/${createdCohort._id}/attendance`,
    token: preUniInstructorToken,
    body: {
      sessionId: firstSession._id,
      records: [
        { studentId: studentUser._id, status: 'PRESENT', notes: 'Participated actively in session lab' },
      ],
    },
  });
  assert(
    'INSTRUCTOR_RECORD_ATTENDANCE_SUCCESS',
    validAttendanceRes.status === 200 && validAttendanceRes.data?.data?.records?.length === 1,
    'Attendance marked as PRESENT for confirmed student'
  );

  // 11. Attendance Correction: Updates record and pushes old state to history (no silent overwrite)
  const correctedAttendanceRes = await request({
    method: 'POST',
    path: `/api/instructor/cohorts/${createdCohort._id}/attendance`,
    token: preUniInstructorToken,
    body: {
      sessionId: firstSession._id,
      records: [
        { studentId: studentUser._id, status: 'LATE', notes: 'Arrived 15 minutes late due to traffic', reason: 'Tardy correction' },
      ],
    },
  });
  assert(
    'ATTENDANCE_CORRECTION_HISTORY',
    correctedAttendanceRes.status === 200,
    'Attendance updated to LATE'
  );

  const dbAttendance = await Attendance.findOne({ cohort: createdCohort._id, student: studentUser._id });
  const hasHistory = dbAttendance && dbAttendance.history.length > 0 && dbAttendance.history[0].status === 'PRESENT';
  assert(
    'ATTENDANCE_HISTORY_PRESERVED',
    hasHistory,
    `Original status PRESENT preserved in history array; current status: ${dbAttendance.status}`
  );

  // 12. Create Assignment by Instructor
  const createAssignRes = await request({
    method: 'POST',
    path: `/api/instructor/cohorts/${createdCohort._id}/assignments`,
    token: preUniInstructorToken,
    body: {
      title: 'Satellite Orbital Ephemeris Calculation',
      description: 'Compute Cartesian state vectors from Two-Line Elements (TLE)',
      dueDate: new Date(now.getTime() + 14 * 86400000).toISOString(),
      maxScore: 100,
    },
  });
  assert(
    'INSTRUCTOR_CREATE_ASSIGNMENT_SUCCESS',
    createAssignRes.status === 201 && createAssignRes.data?.data?.title,
    `Assignment created: "${createAssignRes.data?.data?.title}" (Max score: ${createAssignRes.data?.data?.maxScore})`
  );
  testAssignment = createAssignRes.data?.data;

  // 13. Other Instructor attempts to grade assignment (403 Forbidden)
  const wrongInstructorGradeRes = await request({
    method: 'POST',
    path: `/api/instructor/assignments/${testAssignment._id}/grades`,
    token: uniInstructorToken,
    body: {
      grades: [{ studentId: studentUser._id, score: 90 }],
    },
  });
  assert('WRONG_INSTRUCTOR_GRADE_403', wrongInstructorGradeRes.status === 403, 'Unassigned instructor cannot grade assignment (403)');

  // 14. Invalid score (> maxScore) rejected with 400
  const invalidScoreRes = await request({
    method: 'POST',
    path: `/api/instructor/assignments/${testAssignment._id}/grades`,
    token: preUniInstructorToken,
    body: {
      grades: [{ studentId: studentUser._id, score: 150 }], // max is 100
    },
  });
  assert('INVALID_SCORE_OVER_MAX_400', invalidScoreRes.status === 400, 'Score 150 > maxScore 100 rejected with 400');

  // 15. Valid Grading by Assigned Instructor
  const validGradeRes = await request({
    method: 'POST',
    path: `/api/instructor/assignments/${testAssignment._id}/grades`,
    token: preUniInstructorToken,
    body: {
      grades: [
        { studentId: studentUser._id, score: 95, feedback: 'Excellent state vector calculations and clean Python implementation' },
      ],
    },
  });
  assert(
    'INSTRUCTOR_RECORD_GRADE_SUCCESS',
    validGradeRes.status === 200 && validGradeRes.data?.data?.grades?.length === 1,
    'Assessment recorded: Score 95/100'
  );

  // 16. Grade Correction: Updates score and pushes previous state to history
  const correctedGradeRes = await request({
    method: 'POST',
    path: `/api/instructor/assignments/${testAssignment._id}/grades`,
    token: preUniInstructorToken,
    body: {
      grades: [
        { studentId: studentUser._id, score: 98, feedback: 'Revised after bonus task verification', reason: 'Bonus points awarded' },
      ],
    },
  });
  assert('GRADE_CORRECTION_SUCCESS', correctedGradeRes.status === 200, 'Grade revised to 98/100');

  const dbAssessment = await Assessment.findOne({ assignment: testAssignment._id, student: studentUser._id });
  const hasGradeHistory = dbAssessment && dbAssessment.history.length > 0 && dbAssessment.history[0].score === 95;
  assert(
    'GRADE_HISTORY_PRESERVED',
    hasGradeHistory,
    `Prior score 95 preserved in history array; current score: ${dbAssessment.score}/100`
  );

  // 17. Student Read-Only Access to Own Cohort, Attendance & Grades
  const studentCohortsRes = await request({
    method: 'GET',
    path: '/api/students/mine/cohorts',
    token: studentToken,
  });
  const studentData = studentCohortsRes.data?.data || [];
  const studentCohortItem = studentData.find((item) => String(item.cohort?._id) === String(createdCohort._id));
  assert(
    'STUDENT_VIEW_OWN_RECORDS',
    studentCohortsRes.status === 200 && !!studentCohortItem,
    `Student retrieved personal cohort records: Rate=${studentCohortItem?.attendance?.attendanceRate}%, Deliverables=${studentCohortItem?.assignments?.length}`
  );

  // 18. Student cannot modify attendance or grades (403)
  const studentAttendanceAttempt = await request({
    method: 'POST',
    path: `/api/instructor/cohorts/${createdCohort._id}/attendance`,
    token: studentToken,
    body: { sessionId: firstSession._id, records: [{ studentId: studentUser._id, status: 'PRESENT' }] },
  });
  assert('STUDENT_ATTENDANCE_WRITE_403', studentAttendanceAttempt.status === 403, 'Student writing attendance rejected (403 Forbidden)');

  const studentGradeAttempt = await request({
    method: 'POST',
    path: `/api/instructor/assignments/${testAssignment._id}/grades`,
    token: studentToken,
    body: { grades: [{ studentId: studentUser._id, score: 100 }] },
  });
  assert('STUDENT_GRADE_WRITE_403', studentGradeAttempt.status === 403, 'Student writing grades rejected (403 Forbidden)');

  // 19. Super Admin Cross-Division Management (Super Admin can view and create assignments for any division)
  const superAdminCohortGet = await request({
    method: 'GET',
    path: `/api/admin/cohorts/${createdCohort._id}`,
    token: superToken,
  });
  assert('SUPER_ADMIN_CROSS_DIVISION', superAdminCohortGet.status === 200, 'Super Admin can access Pre-University cohort (200 OK)');

  // 20. Audit Log Verification
  const auditCohort = await AuditLog.findOne({ resource: 'Cohort', resourceId: createdCohort._id, action: 'COHORT_CREATED' });
  const auditAttendance = await AuditLog.findOne({ resource: 'Cohort', resourceId: createdCohort._id, action: 'ATTENDANCE_RECORDED' });
  const auditAssignment = await AuditLog.findOne({ resource: 'Assignment', resourceId: testAssignment._id, action: 'ASSIGNMENT_CREATED' });
  const auditAssessment = await AuditLog.findOne({ resource: 'Assignment', resourceId: testAssignment._id, action: 'ASSESSMENT_RECORDED' });

  assert(
    'AUDIT_LOGS_VERIFIED',
    !!auditCohort && !!auditAttendance && !!auditAssignment && !!auditAssessment,
    'COHORT_CREATED, ATTENDANCE_RECORDED, ASSIGNMENT_CREATED, ASSESSMENT_RECORDED all present in AuditLog'
  );

  console.log('\n===============================================================');
  const passed = testResults.filter((r) => r.pass).length;
  const failed = testResults.filter((r) => !r.pass).length;
  console.log(`TOTAL PHASE 11 TESTS: ${testResults.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal API matrix error:', err);
  process.exit(1);
});
