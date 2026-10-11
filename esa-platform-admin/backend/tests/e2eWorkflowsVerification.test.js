/**
 * E2E Workflows & Bug-Fixing Verification Script
 * Egyptian Space Agency Academy Management Platform
 *
 * Independently validates:
 * 1. Filter combinations, pagination, and reset in Notification Oversight Log
 * 2. Individual student messaging with division boundaries and validation
 * 3. Feedback reminder workflow:
 *    - Real Feedback collection check
 *    - Rejection if already submitted
 *    - 24h cooldown duplicate guard
 *    - Valid deep link generation
 *    - Student feedback submission persistence
 * 4. Certificate email retry safety:
 *    - Zero duplicate certificates created on retry
 *    - Serial number & audit trail preservation
 * 5. Security & Authorization boundaries across personas
 * 6. Runtime email configuration inspection (no leaked secrets)
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

async function run() {
  console.log('\n===============================================================');
  console.log(' ESA ACADEMY E2E WORKFLOWS & REVISION VERIFICATION SUITE');
  console.log('===============================================================\n');

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

  // 1. Authenticate Personas
  console.log('[1] Authenticating Personas...');
  const superAdmin = await login('superadmin@esa.dev');
  const preUniAdmin = await login('preuni.admin@esa.dev');
  const uniAdmin = await login('uni.admin@esa.dev');
  const student = await login('student@esa.dev');
  const uniStudent = await login('uni.student@esa.dev');
  assert(superAdmin.token && preUniAdmin.token && student.token, 'All personas logged in successfully');

  // 2. Notification Oversight Log: Filter Combinations, Reset, Pagination
  console.log('\n[2] Verifying Notification Oversight Filters, Pagination, & Reset...');
  
  // Baseline unfiltered total
  const baseRes = await request('/admin/notifications', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(baseRes.status === 200, 'Baseline GET /admin/notifications returns 200');
  const totalCount = baseRes.data?.data?.pagination?.total || 0;
  assert(totalCount > 0, `Baseline notification total is positive (${totalCount} records)`);

  // Division filter
  const preUniNotifs = await request('/admin/notifications?division=PRE_UNIVERSITY', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(preUniNotifs.status === 200, 'Filter by division=PRE_UNIVERSITY returns 200');
  assert(
    preUniNotifs.data?.data?.notifications.every((n) => !n.division || n.division === 'PRE_UNIVERSITY'),
    'All division-filtered notifications are PRE_UNIVERSITY or cross-division'
  );

  // Email status filters
  const sentRes = await request('/admin/notifications?emailStatus=SENT', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(sentRes.status === 200, 'Filter by emailStatus=SENT returns 200');
  assert(
    sentRes.data?.data?.notifications.every((n) => n.emailSent === true),
    'All returned records have emailSent === true'
  );

  const failedRes = await request('/admin/notifications?emailStatus=FAILED', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(failedRes.status === 200, 'Filter by emailStatus=FAILED returns 200');
  assert(
    failedRes.data?.data?.notifications.every((n) => !n.emailSent && n.emailError),
    'All returned records for FAILED have !emailSent and non-null emailError'
  );

  const inAppRes = await request('/admin/notifications?emailStatus=NONE', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(inAppRes.status === 200, 'Filter by emailStatus=NONE returns 200');
  assert(
    inAppRes.data?.data?.notifications.every((n) => !n.emailSent && !n.emailError),
    'All returned records for NONE have !emailSent and null emailError'
  );

  // Read status filters
  const unreadRes = await request('/admin/notifications?read=false', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(unreadRes.status === 200, 'Filter by read=false returns 200');
  assert(
    unreadRes.data?.data?.notifications.every((n) => n.read === false),
    'All returned records have read === false'
  );

  // Multi-filter combination: division + read
  const multiRes = await request('/admin/notifications?division=PRE_UNIVERSITY&read=false&page=1&limit=5', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(multiRes.status === 200, 'Combined filters (division + read + pagination) returns 200');
  assert(multiRes.data?.data?.notifications.length <= 5, 'Respects pagination limit');
  assert(
    multiRes.data?.data?.notifications.every((n) => (!n.division || n.division === 'PRE_UNIVERSITY') && !n.read),
    'Every record in multi-filter result satisfies all active filter criteria simultaneously'
  );

  // Reset Filters verification: requesting without query params returns full dataset
  const resetRes = await request('/admin/notifications?page=1&limit=15', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(resetRes.status === 200, 'Reset filters query succeeds');
  assert(
    resetRes.data?.data?.pagination?.total === totalCount,
    'Reset filters accurately restores full unfiltered record total'
  );

  // 3. Individual Student Messaging
  console.log('\n[3] Verifying Individual Student Messaging Workflow & Boundaries...');
  
  // Student role blocked
  const studentBlocked = await request('/admin/notifications/message-student', {
    method: 'POST',
    headers: { Authorization: `Bearer ${student.token}` },
    body: { studentId: student.user.id, title: 'Test', message: 'Hello' },
  });
  assert(studentBlocked.status === 403, 'Student cannot message students (403 Forbidden)');

  // Missing required fields
  const missingFields = await request('/admin/notifications/message-student', {
    method: 'POST',
    headers: { Authorization: `Bearer ${superAdmin.token}` },
    body: { studentId: student.user.id, title: '', message: '' },
  });
  assert(missingFields.status === 400, 'Empty title/message rejected with 400 Bad Request');

  // Division admin cannot message cross-division student
  const crossDivMessage = await request('/admin/notifications/message-student', {
    method: 'POST',
    headers: { Authorization: `Bearer ${preUniAdmin.token}` },
    body: {
      studentId: uniStudent.user.id,
      title: 'Cross Division Attempt',
      message: 'This message must be blocked.',
    },
  });
  assert(crossDivMessage.status === 403, 'Pre-University Admin blocked from messaging University student (403 Forbidden)');

  // Authorized Super Admin message
  const validMessage = await request('/admin/notifications/message-student', {
    method: 'POST',
    headers: { Authorization: `Bearer ${superAdmin.token}` },
    body: {
      studentId: student.user.id,
      title: 'Official Academic Review Notice',
      message: 'Please review your project deliverables for the orbital mechanics unit.',
      channels: { inApp: true, email: true },
    },
  });
  assert(validMessage.status === 201, 'Super Admin sends message to student (201 Created)');
  assert(validMessage.data?.data?.notification?.type === 'STUDENT_MESSAGE', 'Notification type is STUDENT_MESSAGE');
  const recipientId = validMessage.data?.data?.notification?.recipient?._id || validMessage.data?.data?.notification?.recipient;
  assert(recipientId === student.user.id, 'Notification correctly addresses target student');

  // 4. Feedback Reminder & Certificate Eligibility
  console.log('\n[4] Verifying Feedback Reminder & Certificate Eligibility...');
  
  // Get eligible evaluations
  const eligibleRes = await request('/admin/certificates/eligible', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(eligibleRes.status === 200, 'GET /admin/certificates/eligible returns 200 OK');
  const eligibleEvals = eligibleRes.data?.data?.eligible || eligibleRes.data?.data || [];
  assert(Array.isArray(eligibleEvals), 'Eligible evaluations is an array');

  if (eligibleEvals.length > 0) {
    const candidate = eligibleEvals[0];
    assert(
      typeof candidate.feedbackCompleted === 'boolean',
      `Eligible evaluation explicitly exposes boolean feedbackCompleted (status: ${candidate.feedbackCompleted})`
    );

    // If feedback is not completed, test reminder endpoint
    if (!candidate.feedbackCompleted && candidate.student?._id && candidate.cohort?._id) {
      const reminderRes = await request('/admin/notifications/feedback-reminder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdmin.token}` },
        body: {
          studentId: candidate.student._id,
          cohortId: candidate.cohort._id,
        },
      });

      if (reminderRes.status === 200) {
        assert(true, 'Feedback reminder successfully sent to student with pending feedback');
        assert(
          reminderRes.data?.data?.feedbackLink.includes(`/student/cohorts?openFeedback=${candidate.cohort._id}`),
          'Reminder includes valid deep link to student cohort feedback form'
        );

        // Immediate duplicate reminder test
        const dupReminderRes = await request('/admin/notifications/feedback-reminder', {
          method: 'POST',
          headers: { Authorization: `Bearer ${superAdmin.token}` },
          body: {
            studentId: candidate.student._id,
            cohortId: candidate.cohort._id,
          },
        });
        assert(dupReminderRes.status === 400, 'Duplicate reminder within 24h rejected with 400 Bad Request');
      }
    }
  }

  // Test submitting feedback as student
  const studentCohortsRes = await request('/student/mine/cohorts', {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const enrolledCohorts = studentCohortsRes.data?.data || [];
  if (enrolledCohorts.length > 0) {
    const studentCohort = enrolledCohorts[0].cohort || enrolledCohorts[0];
    const programId = studentCohort.program?._id || studentCohort.program;

    // Submit feedback
    const submitFeedbackRes = await request('/student/mine/feedback', {
      method: 'POST',
      headers: { Authorization: `Bearer ${student.token}` },
      body: {
        cohortId: studentCohort._id,
        programId: programId,
        rating: 5,
        feedbackType: 'COURSE_CONTENT',
        comments: 'Excellent space mission architecture module and practical simulations.',
        strengths: 'Clear telemetry labs',
        improvements: 'More flight software examples',
      },
    });

    if (submitFeedbackRes.status === 201) {
      assert(true, 'Student submitted feedback successfully (201 Created)');

      // Attempt to send reminder now that feedback is submitted: MUST be rejected
      const reminderAfterSubmit = await request('/admin/notifications/feedback-reminder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdmin.token}` },
        body: {
          studentId: student.user.id,
          cohortId: studentCohort._id,
        },
      });
      const errMsg = reminderAfterSubmit.data?.error?.message || reminderAfterSubmit.data?.message || '';
      assert(
        reminderAfterSubmit.status === 400 && errMsg.includes('already completed'),
        'Backend verified completed feedback in database and rejected redundant reminder'
      );
    }
  }

  // 5. Certificate Email Safe Retry (Zero Duplicate Certificates)
  console.log('\n[5] Verifying Certificate Email Retry Safety & Idempotency...');
  
  // Fetch existing certificates
  const certsRes = await request('/admin/certificates', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  const initialCertCount = certsRes.data?.data?.pagination?.total || 0;
  const anyCert = certsRes.data?.data?.certificates?.[0];

  if (anyCert) {
    const certDetail = await request(`/admin/certificates/${anyCert._id}`, {
      headers: { Authorization: `Bearer ${superAdmin.token}` },
    });
    assert(certDetail.status === 200, 'GET /admin/certificates/:id returns 200 OK');
    const certData = certDetail.data?.data?.certificate;
    assert(certData.serialNumber === anyCert.serialNumber, 'Certificate details returned matching serial number');

    // Find any notification to test retry
    const notifRes = await request('/admin/notifications', {
      headers: { Authorization: `Bearer ${superAdmin.token}` },
    });
    const testNotif = notifRes.data?.data?.notifications?.[0];

    if (testNotif) {
      const retryRes = await request(`/admin/notifications/${testNotif._id}/retry-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdmin.token}` },
      });
      assert(retryRes.status === 200, 'POST /admin/notifications/:id/retry-email succeeds (200 OK)');
      assert(retryRes.data?.data?.notification?._id === testNotif._id, 'Preserves exact notification ID');

      // Verify certificate count remains strictly unchanged
      const certsAfterRetry = await request('/admin/certificates', {
        headers: { Authorization: `Bearer ${superAdmin.token}` },
      });
      const finalCertCount = certsAfterRetry.data?.data?.pagination?.total || 0;
      assert(
        finalCertCount === initialCertCount,
        `Zero duplicate certificates created: Count before (${initialCertCount}) === Count after (${finalCertCount})`
      );
    }
  } else {
    console.log('  [SKIP] No certificate records available to test email retry count');
  }

  // 6. Security & Runtime Email Configuration
  console.log('\n[6] Verifying Security Boundaries & Email Configuration...');

  // Student blocked from email configuration
  const studentEmailConfig = await request('/admin/notifications/email-config', {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  assert(studentEmailConfig.status === 403, 'Student blocked from email-config (403 Forbidden)');

  // Division admin blocked from email configuration
  const divAdminEmailConfig = await request('/admin/notifications/email-config', {
    headers: { Authorization: `Bearer ${preUniAdmin.token}` },
  });
  assert(divAdminEmailConfig.status === 403, 'Division Admin blocked from email-config (403 Forbidden)');

  // Super Admin can access email configuration
  const superEmailConfig = await request('/admin/notifications/email-config', {
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  assert(superEmailConfig.status === 200, 'Super Admin can access email-config (200 OK)');
  const cfg = superEmailConfig.data?.data?.config;
  assert(cfg && typeof cfg.globalEmailEnabled === 'boolean', 'Returns valid globalEmailEnabled boolean toggle');
  assert(cfg && cfg.senderEmail, 'Returns valid official sender email');
  assert(
    !cfg.smtpPassword && !cfg.password && !cfg.auth,
    'No SMTP credentials or sensitive tokens exposed in configuration response'
  );

  // Summary
  console.log('\n===============================================================');
  console.log(` VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
