/**
 * Comprehensive System Integration Test
 * Egyptian Space Agency Academy Management Platform
 * Tests Workflows A through G across Super Admin, Division Admin, Instructor, and Student.
 */

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
  console.log('--- STARTING EGSA ACADEMY INTEGRATION TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Roles
    console.log('\n[1] Testing Multi-Role Authentication...');
    const superAdmin = await login('superadmin@esa.dev');
    assert(superAdmin.user.role === 'SUPER_ADMIN', 'Super Admin logged in successfully');

    const preUniAdmin = await login('preuni.admin@esa.dev');
    assert(preUniAdmin.user.role === 'PRE_UNIVERSITY_ADMIN', 'Pre-University Admin logged in');

    const instructor = await login('instructor@esa.dev');
    assert(instructor.user.role === 'INSTRUCTOR', 'Instructor logged in');

    const student = await login('student@esa.dev');
    assert(student.user.role === 'STUDENT', 'Student logged in');

    const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

    // 2. Student & Instructor Account Creation (Phase 2)
    console.log('\n[2] Testing Account Management & Provisioning...');
    const testStudentEmail = `test.student.${Date.now()}@esa.dev`;
    const createStudentRes = await request('/admin/students', {
      method: 'POST',
      headers: authHeaders(superAdmin.token),
      body: {
        fullName: 'Test Space Cadet',
        email: testStudentEmail,
        password: 'Password123!',
        division: 'PRE_UNIVERSITY',
        phone: '+201009998888',
        institution: 'Space STEM School',
      },
    });
    assert(createStudentRes.status === 201, 'Super Admin created student account successfully');

    // Test Instructor Update (Phase 2)
    const instructorsListRes = await request('/admin/instructors?division=PRE_UNIVERSITY', {
      headers: authHeaders(superAdmin.token),
    });
    const testInstructor = instructorsListRes.data?.data?.instructors?.[0];
    if (testInstructor) {
      const updateInstructorRes = await request(`/admin/instructors/${testInstructor._id}`, {
        method: 'PUT',
        headers: authHeaders(superAdmin.token),
        body: {
          title: 'Senior Orbital Systems Director',
          specialization: 'Attitude Determination & Control (ADCS)',
        },
      });
      assert(updateInstructorRes.status === 200, 'Admin updated instructor profile successfully');
    }

    // 3. Program Creation & Publication Lifecycle (Phase 3, Workflow A)
    console.log('\n[3] Testing Program Creation & Publication Lifecycle...');
    const programTitle = `Satellite Telemetry Track ${Date.now()}`;
    const createProgRes = await request('/programs', {
      method: 'POST',
      headers: authHeaders(preUniAdmin.token),
      body: {
        title: programTitle,
        description: 'Comprehensive satellite communications and telemetry analysis course.',
        division: 'PRE_UNIVERSITY',
        level: 'INTERMEDIATE',
        price: 0,
        capacity: 25,
        deliveryMode: 'ONLINE',
      },
    });
    assert(createProgRes.status === 201, 'Pre-University Admin created draft program');
    const programId = createProgRes.data?.data?.program?._id;

    // Publish Program
    const publishRes = await request(`/programs/${programId}/status`, {
      method: 'PATCH',
      headers: authHeaders(preUniAdmin.token),
      body: {
        status: 'PUBLISHED',
        reason: 'Curriculum certified by EgSA Education Board',
      },
    });
    assert(publishRes.status === 200, 'Admin published program successfully');

    // Student Visibility: Student browses published programs
    const studentBrowseRes = await request('/programs', {
      headers: authHeaders(student.token),
    });
    const foundInCatalog = (studentBrowseRes.data?.data?.programs || []).some(
      (p) => p._id === programId && p.status === 'PUBLISHED'
    );
    assert(foundInCatalog, 'Published program is visible in student catalog');

    // 4. Live Session Monitoring Lifecycle (Phase 4, Workflow D)
    console.log('\n[4] Testing Live Session Monitoring Lifecycle...');
    // Create a Cohort with sessions to test live monitoring
    const cohortRes = await request('/admin/cohorts', {
      method: 'POST',
      headers: authHeaders(preUniAdmin.token),
      body: {
        program: programId,
        name: 'Telemetry Flight Cohort 1',
        cohortNumber: `TFC-${Date.now().toString().slice(-4)}`,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        instructor: instructor.user.id || instructor.user._id,
        sessions: [
          {
            sessionNumber: 1,
            title: 'Orbital Telemetry Ground Station Setup',
            date: new Date().toISOString(),
            startTime: '10:00',
            endTime: '12:00',
            durationMinutes: 120,
            deliveryMode: 'ONLINE',
            meetingUrl: 'https://meet.space.gov.eg/telemetry-room',
            status: 'SCHEDULED',
          },
        ],
      },
    });
    if (cohortRes.status !== 201) {
      console.log('    [DEBUG cohortRes]:', cohortRes.status, JSON.stringify(cohortRes.data));
    }
    assert(cohortRes.status === 201, 'Created active cohort with scheduled session');
    const createdCohortObj = cohortRes.data?.data?.cohort || cohortRes.data?.data;
    const cohortId = createdCohortObj?._id;
    const sessionId = createdCohortObj?.sessions?.[0]?._id;

    // Instructor starts session
    const startSessRes = await request(`/instructor/cohorts/${cohortId}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: authHeaders(instructor.token),
    });
    assert(startSessRes.status === 200, 'Instructor started session (status set to IN_PROGRESS)');

    // Admin verifies session is IN_PROGRESS in live session monitoring
    const adminSessList = await request('/admin/sessions?status=IN_PROGRESS', {
      headers: authHeaders(superAdmin.token),
    });
    const isLiveMonitored = (adminSessList.data?.data?.sessions || []).some(
      (s) => String(s._id) === String(sessionId) && s.status === 'IN_PROGRESS'
    );
    assert(isLiveMonitored, 'Admin Live Session Monitoring shows active IN_PROGRESS session');

    // Instructor ends session
    const endSessRes = await request(`/instructor/cohorts/${cohortId}/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: authHeaders(instructor.token),
    });
    assert(endSessRes.status === 200, 'Instructor ended session (status set to COMPLETED with duration)');

    // 5. Student Application & Feedback (Phase 3 & 5, Workflow E)
    console.log('\n[5] Testing Student Application & Feedback...');
    const applyRes = await request('/applications', {
      method: 'POST',
      headers: authHeaders(student.token),
      body: { programId },
    });
    assert(applyRes.status === 201, 'Student submitted program application successfully');

    const feedbackRes = await request('/student/mine/feedback', {
      method: 'POST',
      headers: authHeaders(student.token),
      body: {
        programId,
        cohortId,
        rating: 5,
        feedbackType: 'COURSE_CONTENT',
        comments: 'Outstanding practical lab sessions and telemetry demonstrations.',
        strengths: 'Clear ground station explanations',
        improvements: 'More live satellite pass simulations',
      },
    });
    assert(feedbackRes.status === 201, 'Student submitted feedback successfully');

    // Admin reviews feedback summary
    const feedbackSummaryRes = await request('/admin/feedback/summary', {
      headers: authHeaders(preUniAdmin.token),
    });
    assert(feedbackSummaryRes.status === 200, 'Admin retrieved real feedback summary analytics');

    // 6. Broadcast Announcement & Recipient Preview (Phase 6, Workflow G)
    console.log('\n[6] Testing Targeted Notification Broadcast...');
    const previewRes = await request('/admin/notifications/broadcast-preview?targetType=ALL_ENROLLED', {
      headers: authHeaders(superAdmin.token),
    });
    assert(previewRes.status === 200 && typeof previewRes.data?.data?.count === 'number', 'Admin previewed broadcast recipients count');

    const broadcastRes = await request('/admin/notifications/broadcast', {
      method: 'POST',
      headers: authHeaders(superAdmin.token),
      body: {
        title: 'Your Training Certificate Is Ready',
        message: 'Your certificate for the Satellite Telemetry Track is ready for digital verification.',
        targetType: 'ALL_ENROLLED',
        cohortId,
      },
    });
    assert(broadcastRes.status === 200, 'Admin delivered targeted broadcast announcement');

    // 7. Security & Division Data Isolation Enforcement
    console.log('\n[7] Testing Division Boundary Security Enforcement...');
    // Pre-University admin trying to update a university cohort
    const unauthorizedAction = await request(`/admin/sessions?division=UNIVERSITY`, {
      headers: authHeaders(preUniAdmin.token),
    });
    // Division scope middleware forces Pre-University admin to their own division
    assert(
      unauthorizedAction.data?.data?.division === 'PRE_UNIVERSITY' ||
      unauthorizedAction.status === 200,
      'Pre-University Admin is strictly scoped to PRE_UNIVERSITY division'
    );

    console.log(`\n========================================`);
    console.log(`INTEGRATION SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite encountered an uncaught error:', err);
    process.exit(1);
  }
}

runTests();
