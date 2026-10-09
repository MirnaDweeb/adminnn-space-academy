const http = require('http');
const bcrypt = require('../backend/node_modules/bcrypt');
require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const connectDB = require('../backend/src/config/db');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Application = require('../backend/src/models/Application');
const Enrollment = require('../backend/src/models/Enrollment');
const Invoice = require('../backend/src/models/Invoice');
const AuditLog = require('../backend/src/models/AuditLog');
const ProgramAssessment = require('../backend/src/models/ProgramAssessment');
const AssessmentAttempt = require('../backend/src/models/AssessmentAttempt');
const InstructorProfile = require('../backend/src/models/InstructorProfile');
const { PERMISSIONS } = require('../backend/src/constants/permissions');

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
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runSuperAdminMatrix() {
  console.log('========================================================================');
  console.log('SUPER ADMIN — GATEWAY, PERMISSIONS & PLATFORM CONTROL VERIFICATION MATRIX');
  console.log('========================================================================\n');

  await connectDB();

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // 1. Tokens
    const superToken = await login('superadmin@esa.dev');
    const preUniToken = await login('preuni.admin@esa.dev');
    const uniToken = await login('uni.admin@esa.dev');
    const studentToken = await login('student@esa.dev');

    // -------------------------------------------------------------------------
    // 1. GATEWAY & UNIFIED PLATFORM CONTROL
    // -------------------------------------------------------------------------
    console.log('\n--- Section 1: Super Admin Gateway & Division Access ---');

    // 1.1 Unauthenticated -> 401
    const unauthGateway = await request('/admin/gateway');
    assert('1.1 Unauthenticated /admin/gateway -> 401', unauthGateway.status === 401, `Status: ${unauthGateway.status}`);

    // 1.2 Student -> 403
    const studentGateway = await request('/admin/gateway', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('1.2 Student /admin/gateway -> 403', studentGateway.status === 403, `Status: ${studentGateway.status}`);

    // 1.3 Pre-Uni Admin -> 403 (Gateway is Super Admin only)
    const preUniGateway = await request('/admin/gateway', {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('1.3 Pre-Uni Admin /admin/gateway -> 403', preUniGateway.status === 403, `Status: ${preUniGateway.status}`);

    // 1.4 Super Admin -> 200 with live DB metrics for both divisions
    const superGateway = await request('/admin/gateway', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('1.4 Super Admin /admin/gateway -> 200', superGateway.status === 200, `Status: ${superGateway.status}`);
    const gData = superGateway.data?.data;
    const preUni = gData?.divisions?.find((d) => d.key === 'PRE_UNIVERSITY') || gData?.divisions?.[0];
    const uni = gData?.divisions?.find((d) => d.key === 'UNIVERSITY') || gData?.divisions?.[1];

    assert('1.4b Gateway has preUniversity metrics', preUni?.studentCount >= 0 && preUni?.activePrograms >= 0);
    assert('1.4c Gateway has university metrics', uni?.studentCount >= 0 && uni?.activeCohorts >= 0);

    // Verify DB consistency
    const preUniProgCount = await Course.countDocuments({ division: 'PRE_UNIVERSITY', status: 'ACTIVE' });
    assert('1.4d Gateway active programs match DB count', preUni?.activePrograms === preUniProgCount, `DB: ${preUniProgCount}, API: ${preUni?.activePrograms}`);

    // -------------------------------------------------------------------------
    // 2. ADMINISTRATOR PROVISIONING & GRANULAR PERMISSIONS
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Administrator Provisioning & Permissions ---');

    // 2.1 Available permissions endpoint
    const permRes = await request('/admin/administrators/permissions', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('2.1 GET /admin/administrators/permissions -> 200', permRes.status === 200 && Array.isArray(permRes.data?.data?.permissions));

    // 2.2 Pre-Uni Admin cannot provision administrators -> 403
    const unauthorizedCreateAdmin = await request('/admin/administrators', {
      method: 'POST',
      headers: { Authorization: `Bearer ${preUniToken}` },
      body: {
        fullName: 'Rogue Admin',
        email: 'rogue@esa.dev',
        role: 'PRE_UNIVERSITY_ADMIN',
        division: 'PRE_UNIVERSITY',
      },
    });
    assert('2.2 Pre-Uni Admin cannot create administrator -> 403', unauthorizedCreateAdmin.status === 403, `Status: ${unauthorizedCreateAdmin.status}`);

    // Clean up any test admin from prior runs
    const testAdminEmail = 'test.perm.admin@esa.dev';
    await User.deleteMany({ email: testAdminEmail });

    // 2.3 Super Admin creates an administrator with limited permissions: [PROGRAMS_VIEW]
    const createAdminRes = await request('/admin/administrators', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        fullName: 'Perm Restricted Admin',
        email: testAdminEmail,
        password: 'Password123!',
        role: 'PRE_UNIVERSITY_ADMIN',
        division: 'PRE_UNIVERSITY',
        permissions: [PERMISSIONS.PROGRAMS_VIEW],
      },
    });
    assert('2.3 Super Admin provisions administrator with [PROGRAMS_VIEW] -> 201', createAdminRes.status === 201, `Status: ${createAdminRes.status}`);
    const newAdminId = createAdminRes.data?.data?.administrator?.id || createAdminRes.data?.data?.administrator?._id;

    // Check AuditLog for admin creation
    const adminCreatedLog = await AuditLog.findOne({ action: 'ADMIN_CREATED', 'target.id': newAdminId });
    assert('2.3b AuditLog recorded ADMIN_CREATED', Boolean(adminCreatedLog));

    // Log in as the new restricted admin
    const restrictedToken = await login(testAdminEmail);

    // 2.4 Restricted Admin can VIEW programs (has PROGRAMS_VIEW)
    const viewProgRes = await request('/programs?division=PRE_UNIVERSITY', {
      headers: { Authorization: `Bearer ${restrictedToken}` },
    });
    assert('2.4 Restricted Admin can view programs -> 200', viewProgRes.status === 200);

    // 2.5 Restricted Admin CANNOT CREATE program (missing PROGRAMS_MANAGE) -> 403
    const forbiddenCreateProg = await request('/programs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${restrictedToken}` },
      body: {
        title: 'Unauthorized Course',
        division: 'PRE_UNIVERSITY',
        description: 'Should fail',
        capacity: 20,
      },
    });
    assert('2.5 Missing PROGRAMS_MANAGE returns 403 Forbidden', forbiddenCreateProg.status === 403, `Status: ${forbiddenCreateProg.status}`);

    // 2.6 Self-elevation prevention: Restricted Admin tries to update own permissions -> 403
    const selfElevateRes = await request(`/admin/administrators/${newAdminId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${restrictedToken}` },
      body: {
        permissions: [PERMISSIONS.PROGRAMS_VIEW, PERMISSIONS.PROGRAMS_MANAGE, PERMISSIONS.AUDIT_LOGS_VIEW],
      },
    });
    assert('2.6 Administrator self-elevation is blocked -> 403', selfElevateRes.status === 403, `Status: ${selfElevateRes.status}`);

    // 2.7 Super Admin grants PROGRAMS_MANAGE
    const grantPermRes = await request(`/admin/administrators/${newAdminId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        permissions: [PERMISSIONS.PROGRAMS_VIEW, PERMISSIONS.PROGRAMS_MANAGE],
      },
    });
    assert('2.7 Super Admin updates permissions -> 200', grantPermRes.status === 200);
    const permChangedLog = await AuditLog.findOne({ action: 'ADMIN_PERMISSIONS_CHANGED', 'target.id': newAdminId });
    assert('2.7b AuditLog recorded ADMIN_PERMISSIONS_CHANGED', Boolean(permChangedLog));

    // Now re-login as the restricted admin to get updated token payload/session
    const updatedRestrictedToken = await login(testAdminEmail);

    // Now administrator CAN create program
    const allowedCreateProg = await request('/programs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${updatedRestrictedToken}` },
      body: {
        title: 'Authorized Test Course ' + Date.now(),
        division: 'PRE_UNIVERSITY',
        description: 'Now permitted by granted permission',
        capacity: 20,
      },
    });
    assert('2.8 With PROGRAMS_MANAGE granted, program creation -> 201', allowedCreateProg.status === 201, `Status: ${allowedCreateProg.status}`);
    const tempCreatedProgId = allowedCreateProg.data?.data?.program?._id || allowedCreateProg.data?.data?.program?.id;

    // 2.9 Super Admin disables administrator via PATCH /status
    const disableAdminRes = await request(`/admin/administrators/${newAdminId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        isActive: false,
      },
    });
    assert('2.9 Super Admin disables administrator -> 200', disableAdminRes.status === 200);
    const adminDisabledLog = await AuditLog.findOne({ action: 'ADMIN_DEACTIVATED', 'target.id': newAdminId });
    assert('2.9b AuditLog recorded ADMIN_DEACTIVATED', Boolean(adminDisabledLog));

    // Try logging in as disabled admin -> login failure
    let disabledLoginFailed = false;
    try {
      await login(testAdminEmail);
    } catch (e) {
      disabledLoginFailed = true;
    }
    assert('2.10 Disabled administrator cannot log in', disabledLoginFailed);

    // Re-enable administrator
    await request(`/admin/administrators/${newAdminId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: { isActive: true },
    });

    // -------------------------------------------------------------------------
    // 3. PROGRAM MANAGEMENT WITH EXTENDED FIELDS & SAFE ARCHIVE / PURGE
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Program CRUD & Safe Archive / Purge ---');

    // 3.1 Create program with full extended logistics and scheduling fields
    const testProgTitle = 'Super Admin Advanced CubeSat Robotics ' + Date.now();
    const createFullProgRes = await request('/programs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        title: testProgTitle,
        description: 'Comprehensive satellite engineering and telemetry course',
        division: 'UNIVERSITY',
        level: 'ADVANCED',
        category: 'Satellite Operations',
        transportationOption: 'BUS_SHUTTLE',
        capacity: 35,
        price: 5500,
        deliveryMode: 'HYBRID',
        targetAudience: 'Senior aerospace and electronics undergraduates',
        prerequisites: ['Orbital Mechanics 101', 'Python programming'],
        targetMajors: ['Aerospace Engineering', 'Mechatronics'],
        requiredEducation: 'B.Sc. in progress (Year 3+)',
        registrationStartDate: '2026-10-01',
        registrationEndDate: '2026-10-31',
        startDate: '2026-11-15',
        endDate: '2026-12-30',
        reopeningDate: '2026-11-01',
      },
    });
    assert('3.1 Super Admin creates program with extended fields -> 201', createFullProgRes.status === 201, `Status: ${createFullProgRes.status}`);
    const fullProgId = createFullProgRes.data?.data?.program?._id || createFullProgRes.data?.data?.program?.id;

    // Verify fields stored in DB
    const dbProg = await Course.findById(fullProgId);
    assert('3.1b DB verified category and transportationOption', dbProg?.category === 'Satellite Operations' && dbProg?.transportationOption === 'BUS_SHUTTLE');
    assert('3.1c DB verified prerequisites and requiredEducation', dbProg?.prerequisites?.some((p) => p.includes('Orbital')) && dbProg?.requiredEducation?.includes('B.Sc.'));
    assert('3.1d AuditLog recorded PROGRAM_CREATED', Boolean(await AuditLog.findOne({ action: 'PROGRAM_CREATED', 'target.id': fullProgId })));

    // 3.2 Update program fields
    const updateProgRes = await request(`/programs/${fullProgId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        capacity: 40,
        price: 6000,
      },
    });
    assert('3.2 Super Admin updates program -> 200', updateProgRes.status === 200);
    assert('3.2b AuditLog recorded PROGRAM_UPDATED', Boolean(await AuditLog.findOne({ action: 'PROGRAM_UPDATED', 'target.id': fullProgId })));

    // 3.3 Test Purge vs Safe Archive:
    // Create an unreferenced dummy program to test true deletion
    const superUser = await User.findOne({ email: 'superadmin@esa.dev' });
    const dummyProg = await Course.create({
      title: 'Unreferenced Temp Program ' + Date.now(),
      division: 'PRE_UNIVERSITY',
      capacity: 10,
      createdBy: superUser._id,
      updatedBy: superUser._id,
    });
    const deleteUnrefRes = await request(`/programs/${dummyProg._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('3.3 Deleting unreferenced program physically purges -> 200', deleteUnrefRes.status === 200 && deleteUnrefRes.data?.data?.deleted === true);
    assert('3.3b Program document no longer exists in DB', (await Course.findById(dummyProg._id)) === null);
    assert('3.3c AuditLog recorded PROGRAM_DELETED', Boolean(await AuditLog.findOne({ action: 'PROGRAM_DELETED', 'target.id': dummyProg._id.toString() })));

    // 3.4 Now create an application referencing fullProgId, then attempt delete
    const studentUser = await User.findOne({ email: 'student@esa.dev' });
    const refApp = await Application.create({
      student: studentUser._id,
      program: fullProgId,
      division: 'UNIVERSITY',
      status: 'SUBMITTED',
      answers: [],
    });

    const deleteRefRes = await request(`/programs/${fullProgId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('3.4 Deleting referenced program triggers safe archive -> 200', deleteRefRes.status === 200 && deleteRefRes.data?.data?.archived === true);
    const archivedProg = await Course.findById(fullProgId);
    assert('3.4b Program document preserved in DB with status ARCHIVED', archivedProg?.status === 'ARCHIVED' && archivedProg?.isArchived === true);
    assert('3.4c AuditLog recorded PROGRAM_ARCHIVED with reference protection note', Boolean(await AuditLog.findOne({ action: 'PROGRAM_ARCHIVED', 'target.id': fullProgId })));

    // Clean up refApp and temp created program
    await Application.deleteOne({ _id: refApp._id });
    if (tempCreatedProgId) await Course.deleteOne({ _id: tempCreatedProgId });

    // -------------------------------------------------------------------------
    // 4. COHORT / SCHEDULE MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Cohort & Schedule Management ---');

    // Find an existing cohort to test schedule update
    const sampleCohort = await Cohort.findOne({ status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } });
    if (sampleCohort) {
      const updateCohortRes = await request(`/admin/cohorts/${sampleCohort._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${superToken}` },
        body: {
          startDate: '2026-11-01',
          endDate: '2026-12-15',
          capacity: 32,
          status: sampleCohort.status,
        },
      });
      assert('4.1 Super Admin updates cohort schedule -> 200', updateCohortRes.status === 200, `Status: ${updateCohortRes.status}`);
      const updatedDbCohort = await Cohort.findById(sampleCohort._id);
      assert('4.1b Cohort capacity and dates updated in DB', updatedDbCohort?.capacity === 32 && Boolean(updatedDbCohort?.startDate));
      assert('4.1c AuditLog recorded COHORT_SCHEDULE_CHANGED', Boolean(await AuditLog.findOne({ action: 'COHORT_SCHEDULE_CHANGED', 'target.id': sampleCohort._id.toString() })));
    } else {
      console.log('Skipping 4.1: No active/scheduled cohort found in DB');
    }

    // -------------------------------------------------------------------------
    // 5. INSTRUCTOR ACCOUNT LIFECYCLE & COURSE-LIMITED ACCESS
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Instructor Lifecycle & Access Sync ---');

    // Find or inspect instructors
    const instructorsListRes = await request('/admin/instructors?limit=5', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('5.1 GET /admin/instructors -> 200', instructorsListRes.status === 200);

    // Call sync-all-access endpoint
    const syncAllRes = await request('/admin/instructors/sync-access', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('5.2 POST /admin/instructors/sync-access -> 200', syncAllRes.status === 200, `Count: ${syncAllRes.data?.data?.count}`);

    // Test specific instructor lifecycle:
    // Create a temporary instructor account with an expired cohort assignment
    const tempInstEmail = 'temp.expired.inst@esa.dev';
    await User.deleteMany({ email: tempInstEmail });
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const tempInstUser = await User.create({
      fullName: 'Dr. Expired Instructor',
      email: tempInstEmail,
      passwordHash,
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      division: 'PRE_UNIVERSITY',
    });

    const activeProg = await Course.findOne({ status: 'ACTIVE' });
    const pastCohort = await Cohort.create({
      cohortNumber: 'PAST-COHORT-' + Date.now(),
      name: 'Past Mission Cohort',
      program: activeProg._id,
      division: 'PRE_UNIVERSITY',
      status: 'COMPLETED',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-02-01'),
      capacity: 20,
      instructor: tempInstUser._id,
      createdBy: superUser._id,
    });

    const tempProfile = await InstructorProfile.create({
      user: tempInstUser._id,
      division: 'PRE_UNIVERSITY',
      assignedPrograms: [activeProg._id],
      assignedCohorts: [pastCohort._id],
      accessExpiresAt: new Date('2025-02-01'),
    });

    // Sync this instructor's access
    const syncSingleRes = await request(`/admin/instructors/${tempInstUser._id}/sync-access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('5.3 Instructor with only past cohort evaluated -> 200', syncSingleRes.status === 200);
    assert('5.3b Access valid evaluated to false', syncSingleRes.data?.data?.result?.hasActiveAccess === false);

    // Verify User account status transitioned to inactive
    const refreshedInstUser = await User.findById(tempInstUser._id);
    assert('5.3c Instructor user status automatically set to inactive', refreshedInstUser?.isActive === false);
    assert('5.3d AuditLog recorded INSTRUCTOR_DEACTIVATED', Boolean(await AuditLog.findOne({ action: 'INSTRUCTOR_DEACTIVATED', 'target.id': tempInstUser._id })));

    // Clean up temporary instructor & cohort
    await User.deleteOne({ _id: tempInstUser._id });
    await InstructorProfile.deleteOne({ _id: tempProfile._id });
    await Cohort.deleteOne({ _id: pastCohort._id });

    // -------------------------------------------------------------------------
    // 6. ASSESSMENT BUILDER & STUDENT ASSESSMENT WORKFLOW
    // -------------------------------------------------------------------------
    console.log('\n--- Section 6: Assessment Builder & Student Assessment Flow ---');

    // Find an active program for the assessment
    const assessmentProg = await Course.findOne({ status: 'ACTIVE' });
    assert('6.0 Active program exists for assessment test', Boolean(assessmentProg));

    // 6.1 Create assessment with multiple question types, weights, thresholds
    const createAssessRes = await request('/admin/assessments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
      body: {
        title: 'CubeSat Mission Readiness Assessment ' + Date.now(),
        programId: assessmentProg._id,
        program: assessmentProg._id,
        division: assessmentProg.division,
        description: 'Evaluates applicant aptitude for orbital mechanics and satellite telemetry',
        instructions: 'Please answer all questions honestly within the allocated time window.',
        thresholds: {
          recommended: 85,
          foundation: 65,
          manualReview: 45,
        },
        timeLimitMinutes: 45,
        isActive: true,
        questions: [
          {
            questionText: 'What is Kepler’s Third Law relationship between orbital period T and semi-major axis a?',
            questionType: 'SINGLE_CHOICE',
            options: ['T^2 proportional to a^3', 'T proportional to a', 'T^3 proportional to a^2', 'T^2 proportional to a'],
            correctAnswer: 'T^2 proportional to a^3',
            weight: 30,
          },
          {
            questionText: 'Select the primary telemetry parameters typically transmitted via satellite beacon:',
            questionType: 'MULTIPLE_CHOICE',
            options: ['Battery Bus Voltage', 'Solar Array Temperatures', 'Cosmic Background Radiation Map', 'Flight Computer Uptime'],
            correctAnswer: ['Battery Bus Voltage', 'Solar Array Temperatures', 'Flight Computer Uptime'],
            weight: 30,
          },
          {
            questionText: 'A geostationary satellite has an orbital period of approximately 24 hours.',
            questionType: 'TRUE_FALSE',
            options: ['True', 'False'],
            correctAnswer: 'True',
            weight: 20,
          },
          {
            questionText: 'Rate your prior hands-on experience with microcontroller programming (C++/Python):',
            questionType: 'RATING',
            options: ['1', '2', '3', '4', '5'],
            correctAnswer: '5',
            weight: 20,
          },
        ],
      },
    });
    assert('6.1 Super Admin creates assessment with 4 question types -> 201', createAssessRes.status === 201, `Status: ${createAssessRes.status}`);
    const assessId = createAssessRes.data?.data?.assessment?._id || createAssessRes.data?.data?.assessment?.id;
    assert('6.1b AuditLog recorded ASSESSMENT_CREATED', Boolean(await AuditLog.findOne({ action: 'ASSESSMENT_CREATED', 'target.id': assessId })));

    // 6.2 Pre-Uni Admin cannot edit University assessment if cross-division
    if (assessmentProg.division === 'UNIVERSITY') {
      const crossDivRes = await request(`/admin/assessments/${assessId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${preUniToken}` },
        body: { title: 'Cross division tamper attempt' },
      });
      assert('6.2 Division isolation enforced on assessments -> 403', crossDivRes.status === 403, `Status: ${crossDivRes.status}`);
    }

    // 6.3 Student fetches the assessment
    const studentAssessRes = await request(`/assessments/${assessId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('6.3 Student retrieves assessment -> 200', studentAssessRes.status === 200);
    const fetchedQ = studentAssessRes.data?.data?.assessment?.questions;
    assert('6.3b Correct answers masked from student response', fetchedQ && !fetchedQ[0].correctAnswer);

    // 6.4 Student submits attempt with correct answers (Score > 85 -> RECOMMENDED)
    const submitAttemptRes = await request(`/assessments/${assessId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        answers: [
          { questionIndex: 0, selectedAnswer: 'T^2 proportional to a^3' },
          { questionIndex: 1, selectedAnswer: ['Battery Bus Voltage', 'Solar Array Temperatures', 'Flight Computer Uptime'] },
          { questionIndex: 2, selectedAnswer: 'True' },
          { questionIndex: 3, selectedAnswer: '5' },
        ],
        completionTimeMinutes: 12,
      },
    });
    assert('6.4 Student submits assessment attempt -> 201', submitAttemptRes.status === 201, `Status: ${submitAttemptRes.status}`);
    const attemptData = submitAttemptRes.data?.data?.attempt || submitAttemptRes.data?.data;
    assert('6.4b Score calculated correctly (100%)', attemptData?.score === 100, `Score: ${attemptData?.score}`);
    assert('6.4c Recommendation calculated as RECOMMENDED', attemptData?.result === 'RECOMMENDED', `Recommendation: ${attemptData?.result}`);

    // 6.5 Verify admission logic: Human admission review preserved!
    const studentApp = await Application.findOne({ student: studentUser._id, program: assessmentProg._id });
    if (studentApp) {
      assert('6.5 Human admission preserved: Application status not auto-accepted', studentApp.status !== 'ACCEPTED', `App status: ${studentApp.status}`);
    }

    // 6.6 Admin views attempts list
    const adminAttemptsRes = await request(`/admin/assessments/${assessId}/attempts`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert('6.6 Admin can view assessment attempts -> 200', adminAttemptsRes.status === 200 && adminAttemptsRes.data?.data?.attempts?.length >= 1);

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = results.filter((r) => r.pass).length;
    const failedCount = results.filter((r) => !r.pass).length;
    console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      console.error('FAILURES DETECTED:');
      results.filter((r) => !r.pass).forEach((r) => console.error(` - ${r.testName}: ${r.detail}`));
      process.exit(1);
    } else {
      console.log('ALL SUPER ADMIN VERIFICATION TESTS PASSED PERFECTLY!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Test matrix execution error:', err);
    process.exit(1);
  }
}

runSuperAdminMatrix();
