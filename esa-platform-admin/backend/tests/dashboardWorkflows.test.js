/**
 * Pre-University & University Admin Dashboards Comprehensive Verification Test Suite
 * Egyptian Space Agency Academy Training Management Platform
 */

const mongoose = require('mongoose');
const StudentProfile = require('../src/models/StudentProfile');
const Course = require('../src/models/Course');
const Application = require('../src/models/Application');
const Cohort = require('../src/models/Cohort');
const Certificate = require('../src/models/Certificate');
const AuditLog = require('../src/models/AuditLog');
const { getDivisionDashboard } = require('../src/services/statsService');

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
  console.log('\n========================================================================');
  console.log(' ESA ACADEMY DASHBOARDS ACCEPTANCE & ISOLATION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // Connect to DB for direct ground-truth comparison
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  // 1. Authenticate Personas
  console.log('[1] Authenticating Test Personas...');
  let superAdmin, preUniAdmin, uniAdmin, student;
  try {
    superAdmin = await login('superadmin@esa.dev');
    preUniAdmin = await login('preuni.admin@esa.dev');
    uniAdmin = await login('uni.admin@esa.dev');
    student = await login('student@esa.dev');
    assert('All test personas authenticated successfully', true);
  } catch (err) {
    assert('Persona authentication failed', false, err.message);
    process.exit(1);
  }

  const superAuth = { headers: { Authorization: `Bearer ${superAdmin.token}` } };
  const preUniAuth = { headers: { Authorization: `Bearer ${preUniAdmin.token}` } };
  const uniAuth = { headers: { Authorization: `Bearer ${uniAdmin.token}` } };
  const studentAuth = { headers: { Authorization: `Bearer ${student.token}` } };

  // 2. Authorization & Security Boundary Checks
  console.log('\n[2] Testing Endpoint Authorization & Security Boundaries...');
  {
    // Unauthenticated request
    const unauthRes = await request('/admin/PRE_UNIVERSITY/overview');
    assert('Unauthenticated GET /admin/PRE_UNIVERSITY/overview rejected (401)', unauthRes.status === 401);

    // Student role forbidden
    const studentRes = await request('/admin/PRE_UNIVERSITY/overview', studentAuth);
    assert('Student role blocked from division overview (403)', studentRes.status === 403);

    // Pre-University Admin cross-access blocked
    const preUniCrossRes = await request('/admin/UNIVERSITY/overview', preUniAuth);
    assert('Pre-University Admin blocked from University overview (403 Forbidden)', preUniCrossRes.status === 403);

    // University Admin cross-access blocked
    const uniCrossRes = await request('/admin/PRE_UNIVERSITY/overview', uniAuth);
    assert('University Admin blocked from Pre-University overview (403 Forbidden)', uniCrossRes.status === 403);

    // Pre-University Admin can access own division (both casing/hyphen variants)
    const preUniOwnUpper = await request('/admin/PRE_UNIVERSITY/overview', preUniAuth);
    assert('Pre-University Admin accesses own PRE_UNIVERSITY overview (200 OK)', preUniOwnUpper.status === 200);

    const preUniOwnKebab = await request('/admin/pre-university/overview', preUniAuth);
    assert('Pre-University Admin accesses own pre-university normalized overview (200 OK)', preUniOwnKebab.status === 200);

    // University Admin can access own division
    const uniOwnRes = await request('/admin/UNIVERSITY/overview', uniAuth);
    assert('University Admin accesses own UNIVERSITY overview (200 OK)', uniOwnRes.status === 200);

    // Super Admin accesses both divisions
    const superPreUni = await request('/admin/PRE_UNIVERSITY/overview', superAuth);
    assert('Super Admin accesses PRE_UNIVERSITY overview (200 OK)', superPreUni.status === 200);

    const superUni = await request('/admin/UNIVERSITY/overview', superAuth);
    assert('Super Admin accesses UNIVERSITY overview (200 OK)', superUni.status === 200);

    // Invalid division parameter
    const invalidDivRes = await request('/admin/INVALID_DIVISION/overview', superAuth);
    assert('Invalid division parameter rejected with 400 Bad Request', invalidDivRes.status === 400);
  }

  // 3. Pre-University Dashboard Data Correctness & Completeness
  console.log('\n[3] Testing Pre-University Dashboard Persisted Data Correctness...');
  {
    const res = await request('/admin/PRE_UNIVERSITY/overview', preUniAuth);
    assert('Response contains status 200', res.status === 200);
    const data = res.data?.data;

    // Ground-truth database checks
    const expectedStudents = await StudentProfile.countDocuments({ division: 'PRE_UNIVERSITY' });
    const expectedPrograms = await Course.countDocuments({ division: 'PRE_UNIVERSITY', status: 'ACTIVE' });

    assert('Reported studentCount matches database count', data?.studentCount === expectedStudents, `got ${data?.studentCount}, expected ${expectedStudents}`);
    assert('Reported activePrograms matches database count', data?.activePrograms === expectedPrograms, `got ${data?.activePrograms}, expected ${expectedPrograms}`);
    assert('Reported pendingApplications is a valid number', typeof data?.pendingApplications === 'number' && data.pendingApplications >= 0);
    assert('Reported activeCohorts is a valid number', typeof data?.activeCohorts === 'number' && data.activeCohorts >= 0);
    assert('Reported upcomingSessionsCount is a valid number', typeof data?.upcomingSessionsCount === 'number' && data.upcomingSessionsCount >= 0);
    assert('Reported completedSessionsCount is a valid number', typeof data?.completedSessionsCount === 'number' && data.completedSessionsCount >= 0);
    assert('Reported issuedCertificatesCount is a valid number', typeof data?.issuedCertificatesCount === 'number' && data.issuedCertificatesCount >= 0);

    // Upcoming Sessions Array
    assert('upcomingSessions is an array', Array.isArray(data?.upcomingSessions));
    const upcomingSessions = data?.upcomingSessions || [];
    assert('upcomingSessions contains records', upcomingSessions.length > 0);

    // Check chronological order (ascending date)
    let isChronological = true;
    for (let i = 0; i < upcomingSessions.length - 1; i++) {
      if (new Date(upcomingSessions[i].date) > new Date(upcomingSessions[i + 1].date)) {
        isChronological = false;
        break;
      }
    }
    assert('Upcoming sessions are sorted chronologically', isChronological);

    // Check session record schema
    const firstSession = upcomingSessions[0];
    assert('Session contains valid topic', typeof firstSession.topic === 'string' && firstSession.topic.length > 0);
    assert('Session contains cohortNumber', typeof firstSession.cohortNumber === 'string' && firstSession.cohortNumber.startsWith('COH-PRE'));
    assert('Session contains programTitle', typeof firstSession.programTitle === 'string' && firstSession.programTitle.length > 0);
    assert('Session contains instructorName', typeof firstSession.instructorName === 'string' && firstSession.instructorName.length > 0);
    assert('Session contains deliveryMode', ['ONLINE', 'OFFLINE', 'HYBRID', 'ONSITE'].includes(firstSession.deliveryMode));
    assert('Session status is upcoming (SCHEDULED or IN_PROGRESS)', ['SCHEDULED', 'IN_PROGRESS'].includes(firstSession.status));

    // Exclude completed or cancelled sessions from upcoming list
    const invalidStatusCount = upcomingSessions.filter((s) => s.status === 'COMPLETED' || s.status === 'CANCELLED').length;
    assert('Zero COMPLETED or CANCELLED sessions in upcomingSessions list', invalidStatusCount === 0);

    // Recent Activity Feed
    assert('recentActivity is an array', Array.isArray(data?.recentActivity));
    const recentActivity = data?.recentActivity || [];
    assert('recentActivity contains records', recentActivity.length > 0);

    // Check activity record schema
    const firstActivity = recentActivity[0];
    assert('Activity contains actionLabel', typeof firstActivity.actionLabel === 'string' && firstActivity.actionLabel.length > 0);
    assert('Activity contains actor fullName', typeof firstActivity.actor?.fullName === 'string' && firstActivity.actor.fullName.length > 0);
    assert('Activity contains timestamp', !!firstActivity.timestamp && !isNaN(new Date(firstActivity.timestamp).getTime()));
    assert('Activity contains destination link', typeof firstActivity.link === 'string' && firstActivity.link.startsWith('/admin/PRE_UNIVERSITY/'));

    // Check activity order (descending timestamp)
    let isDescOrder = true;
    for (let i = 0; i < recentActivity.length - 1; i++) {
      if (new Date(recentActivity[i].timestamp) < new Date(recentActivity[i + 1].timestamp)) {
        isDescOrder = false;
        break;
      }
    }
    assert('Recent activity items are sorted latest-first', isDescOrder);

    // Admissions Pipeline & Recent Applications
    assert('applicationBreakdown is an object', typeof data?.applicationBreakdown === 'object' && data.applicationBreakdown !== null);
    assert('recentApplications is an array', Array.isArray(data?.recentApplications));
    assert('recentApplications contains records', data?.recentApplications.length > 0);
  }

  // 4. University Dashboard Data Correctness & Completeness
  console.log('\n[4] Testing University Dashboard Persisted Data Correctness...');
  {
    const res = await request('/admin/UNIVERSITY/overview', uniAuth);
    assert('Response contains status 200', res.status === 200);
    const data = res.data?.data;

    // Ground-truth database checks
    const expectedStudents = await StudentProfile.countDocuments({ division: 'UNIVERSITY' });
    const expectedPrograms = await Course.countDocuments({ division: 'UNIVERSITY', status: 'ACTIVE' });

    assert('Reported studentCount matches database count', data?.studentCount === expectedStudents, `got ${data?.studentCount}, expected ${expectedStudents}`);
    assert('Reported activePrograms matches database count', data?.activePrograms === expectedPrograms, `got ${data?.activePrograms}, expected ${expectedPrograms}`);
    assert('Reported pendingApplications is a valid number', typeof data?.pendingApplications === 'number' && data.pendingApplications >= 0);
    assert('Reported activeCohorts is a valid number', typeof data?.activeCohorts === 'number' && data.activeCohorts >= 0);
    assert('Reported upcomingSessionsCount is a valid number', typeof data?.upcomingSessionsCount === 'number' && data.upcomingSessionsCount >= 0);
    assert('Reported completedSessionsCount is a valid number', typeof data?.completedSessionsCount === 'number' && data.completedSessionsCount >= 0);
    assert('Reported issuedCertificatesCount is a valid number', typeof data?.issuedCertificatesCount === 'number' && data.issuedCertificatesCount >= 0);

    // Upcoming Sessions Array
    assert('University upcomingSessions is an array', Array.isArray(data?.upcomingSessions));
    const upcomingSessions = data?.upcomingSessions || [];
    assert('University upcomingSessions contains records', upcomingSessions.length > 0);

    // All university sessions belong to COH-UNI
    const nonUniSessions = upcomingSessions.filter((s) => !s.cohortNumber.startsWith('COH-UNI'));
    assert('Zero non-university sessions in University upcoming list', nonUniSessions.length === 0);

    // Recent Activity Feed
    assert('University recentActivity is an array', Array.isArray(data?.recentActivity));
    const recentActivity = data?.recentActivity || [];
    assert('University recentActivity contains records', recentActivity.length > 0);
    assert('University activity destination links point to /admin/UNIVERSITY', recentActivity.every((a) => a.link.startsWith('/admin/UNIVERSITY/')));
  }

  // 5. Strict Division Data Isolation Verification
  console.log('\n[5] Testing Strict Server-Side Division Isolation...');
  {
    const preRes = await request('/admin/PRE_UNIVERSITY/overview', superAuth);
    const uniRes = await request('/admin/UNIVERSITY/overview', superAuth);

    const preData = preRes.data?.data;
    const uniData = uniRes.data?.data;

    // Sessions isolation: No Pre-Uni session in Uni list and vice versa
    const preSessionIds = new Set((preData?.upcomingSessions || []).map((s) => String(s.sessionId)));
    const uniSessionIds = new Set((uniData?.upcomingSessions || []).map((s) => String(s.sessionId)));

    let sessionOverlap = 0;
    preSessionIds.forEach((id) => {
      if (uniSessionIds.has(id)) sessionOverlap++;
    });
    assert('Zero upcoming session overlap between divisions', sessionOverlap === 0);

    // Activity isolation: No Pre-Uni activity in Uni list and vice versa
    const preActivityIds = new Set((preData?.recentActivity || []).map((a) => String(a._id)));
    const uniActivityIds = new Set((uniData?.recentActivity || []).map((a) => String(a._id)));

    let activityOverlap = 0;
    preActivityIds.forEach((id) => {
      if (uniActivityIds.has(id)) activityOverlap++;
    });
    assert('Zero activity log overlap between divisions', activityOverlap === 0);

    // Applications isolation: No Pre-Uni application in Uni list and vice versa
    const preAppIds = new Set((preData?.recentApplications || []).map((a) => String(a._id)));
    const uniAppIds = new Set((uniData?.recentApplications || []).map((a) => String(a._id)));

    let appOverlap = 0;
    preAppIds.forEach((id) => {
      if (uniAppIds.has(id)) appOverlap++;
    });
    assert('Zero recent application overlap between divisions', appOverlap === 0);
  }

  // 6. Direct Service & Empty State Resilience Testing
  console.log('\n[6] Testing Direct Service & Empty State Resilience...');
  {
    // Calling getDivisionDashboard directly with a non-existent division
    const emptyResult = await getDivisionDashboard('NON_EXISTENT_DIVISION');
    assert('Service handles empty collections cleanly without throwing', !!emptyResult);
    assert('Empty division returns studentCount === 0', emptyResult.studentCount === 0);
    assert('Empty division returns activePrograms === 0', emptyResult.activePrograms === 0);
    assert('Empty division returns pendingApplications === 0', emptyResult.pendingApplications === 0);
    assert('Empty division returns activeCohorts === 0', emptyResult.activeCohorts === 0);
    assert('Empty division returns upcomingSessions as empty array []', Array.isArray(emptyResult.upcomingSessions) && emptyResult.upcomingSessions.length === 0);
    assert('Empty division returns recentActivity as empty array []', Array.isArray(emptyResult.recentActivity) && emptyResult.recentActivity.length === 0);
    assert('Empty division returns recentApplications as empty array []', Array.isArray(emptyResult.recentApplications) && emptyResult.recentApplications.length === 0);
  }

  // 7. Gateway Integration Verification
  console.log('\n[7] Testing Super Admin Gateway Integration...');
  {
    const gatewayRes = await request('/admin/gateway', superAuth);
    assert('GET /admin/gateway returns 200 OK', gatewayRes.status === 200);
    const divisions = gatewayRes.data?.data?.divisions || [];
    assert('Gateway returns 2 division cards', divisions.length === 2);

    const preCard = divisions.find((d) => d.key === 'PRE_UNIVERSITY');
    const uniCard = divisions.find((d) => d.key === 'UNIVERSITY');

    assert('Pre-University card present with studentCount > 0', preCard && preCard.studentCount > 0);
    assert('University card present with studentCount >= 0', uniCard && typeof uniCard.studentCount === 'number');
  }

  await mongoose.disconnect();

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal error running dashboard tests:', err);
  process.exit(1);
});
