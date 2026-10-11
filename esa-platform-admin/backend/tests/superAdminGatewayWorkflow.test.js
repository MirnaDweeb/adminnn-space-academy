/**
 * Super Admin Gateway, Isolated Division Workspaces & Admin Access Management
 * End-to-End Regression Test Suite
 * Egyptian Space Agency Academy Training Management Platform
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
  console.log('\n========================================================================');
  console.log(' SUPER ADMIN GATEWAY & DIVISION ISOLATION REGRESSION TEST SUITE');
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

  // 2. Gateway Access and Metrics
  console.log('\n[2] Testing Administration Gateway Access & Metrics...');
  {
    // Unauthenticated
    const unauth = await request('/admin/gateway');
    assert('Unauthenticated access blocked (401)', unauth.status === 401);

    // Student blocked
    const studentGateway = await request('/admin/gateway', studentAuth);
    assert('Student role blocked from Gateway (403)', studentGateway.status === 403);

    // Pre-Uni Admin blocked from Gateway
    const preUniGateway = await request('/admin/gateway', preUniAuth);
    assert('Pre-University Admin blocked from Gateway (403)', preUniGateway.status === 403);

    // University Admin blocked from Gateway
    const uniGateway = await request('/admin/gateway', uniAuth);
    assert('University Admin blocked from Gateway (403)', uniGateway.status === 403);

    // Super Admin Gateway 200 OK
    const res = await request('/admin/gateway', superAuth);
    assert('Super Admin access to /admin/gateway succeeds (200)', res.status === 200);

    const divisions = res.data?.data?.divisions;
    assert('Gateway returns array with exactly 2 divisions', Array.isArray(divisions) && divisions.length === 2);

    const preUni = divisions?.find((d) => d.key === 'PRE_UNIVERSITY');
    const uni = divisions?.find((d) => d.key === 'UNIVERSITY');

    assert('Pre-University division card present with correct name', preUni?.name === 'Pre-University Administration');
    assert('University division card present with correct name', uni?.name === 'University Administration');

    // Metrics are real numbers, non-negative
    assert('Pre-University studentCount is a valid number', typeof preUni?.studentCount === 'number' && preUni.studentCount >= 0);
    assert('Pre-University activePrograms is a valid number', typeof preUni?.activePrograms === 'number' && preUni.activePrograms >= 0);
    assert('Pre-University pendingApplications is a valid number', typeof preUni?.pendingApplications === 'number' && preUni.pendingApplications >= 0);
    assert('Pre-University activeCohorts is a valid number', typeof preUni?.activeCohorts === 'number' && preUni.activeCohorts >= 0);

    assert('University studentCount is a valid number', typeof uni?.studentCount === 'number' && uni.studentCount >= 0);
    assert('University activePrograms is a valid number', typeof uni?.activePrograms === 'number' && uni.activePrograms >= 0);
    assert('University pendingApplications is a valid number', typeof uni?.pendingApplications === 'number' && uni.pendingApplications >= 0);
    assert('University activeCohorts is a valid number', typeof uni?.activeCohorts === 'number' && uni.activeCohorts >= 0);
  }

  // 3. Workspace Data Isolation (Super Admin scoping)
  console.log('\n[3] Testing Workspace Data Isolation (Pre-University vs University)...');
  {
    // Super Admin queries Pre-University students
    const preUniStudentsRes = await request('/admin/students?division=PRE_UNIVERSITY', superAuth);
    assert('GET /admin/students?division=PRE_UNIVERSITY succeeds (200)', preUniStudentsRes.status === 200);
    const preUniStudents = preUniStudentsRes.data?.data?.students || [];

    // All returned students belong to PRE_UNIVERSITY
    const preUniViolations = preUniStudents.filter((s) => s.division && s.division !== 'PRE_UNIVERSITY');
    assert('Zero University students leak into Pre-University student list', preUniViolations.length === 0);

    // Super Admin queries University students
    const uniStudentsRes = await request('/admin/students?division=UNIVERSITY', superAuth);
    assert('GET /admin/students?division=UNIVERSITY succeeds (200)', uniStudentsRes.status === 200);
    const uniStudents = uniStudentsRes.data?.data?.students || [];

    // All returned students belong to UNIVERSITY
    const uniViolations = uniStudents.filter((s) => s.division && s.division !== 'UNIVERSITY');
    assert('Zero Pre-University students leak into University student list', uniViolations.length === 0);

    // Super Admin queries Pre-University programs
    const preUniProgramsRes = await request('/programs?division=PRE_UNIVERSITY', superAuth);
    assert('GET /programs?division=PRE_UNIVERSITY succeeds (200)', preUniProgramsRes.status === 200);
    const preUniPrograms = preUniProgramsRes.data?.data?.courses || [];
    const preUniProgViolations = preUniPrograms.filter((p) => p.division && p.division !== 'PRE_UNIVERSITY');
    assert('Zero University programs leak into Pre-University programs list', preUniProgViolations.length === 0);

    // Super Admin queries University programs
    const uniProgramsRes = await request('/programs?division=UNIVERSITY', superAuth);
    assert('GET /programs?division=UNIVERSITY succeeds (200)', uniProgramsRes.status === 200);
    const uniPrograms = uniProgramsRes.data?.data?.courses || [];
    const uniProgViolations = uniPrograms.filter((p) => p.division && p.division !== 'UNIVERSITY');
    assert('Zero Pre-University programs leak into University programs list', uniProgViolations.length === 0);
  }

  // 4. Division Admin Boundary Security (Server-enforced division lock)
  console.log('\n[4] Testing Division Admin Boundary Enforcement...');
  {
    // Pre-University Admin attempts to query ?division=UNIVERSITY
    const preUniSpoofRes = await request('/admin/students?division=UNIVERSITY', preUniAuth);
    assert('Pre-University Admin request with ?division=UNIVERSITY returns 200 (overridden by server)', preUniSpoofRes.status === 200);
    const spoofedStudents = preUniSpoofRes.data?.data?.students || [];
    const leakedUniversity = spoofedStudents.filter((s) => s.division === 'UNIVERSITY');
    assert('Server ignores spoofed ?division=UNIVERSITY and locks response to PRE_UNIVERSITY', leakedUniversity.length === 0);

    // Pre-University Admin attempts to access /admin/UNIVERSITY/overview route
    const preUniCrossRoute = await request('/admin/UNIVERSITY/overview', preUniAuth);
    assert('Pre-University Admin blocked from /admin/UNIVERSITY/overview (403 Forbidden)', preUniCrossRoute.status === 403);

    // University Admin attempts to access /admin/PRE_UNIVERSITY/overview route
    const uniCrossRoute = await request('/admin/PRE_UNIVERSITY/overview', uniAuth);
    assert('University Admin blocked from /admin/PRE_UNIVERSITY/overview (403 Forbidden)', uniCrossRoute.status === 403);
  }

  // 5. Super Admin Administrator Account & Permission Management
  console.log('\n[5] Testing Platform Administrator Management & Role Boundaries...');
  {
    // Pre-University Admin blocked from listing administrators
    const preUniListAdmins = await request('/admin/administrators', preUniAuth);
    assert('Pre-University Admin blocked from /admin/administrators (403 Forbidden)', preUniListAdmins.status === 403);

    // University Admin blocked from listing administrators
    const uniListAdmins = await request('/admin/administrators', uniAuth);
    assert('University Admin blocked from /admin/administrators (403 Forbidden)', uniListAdmins.status === 403);

    // Super Admin lists administrators
    const listRes = await request('/admin/administrators', superAuth);
    assert('Super Admin lists administrators successfully (200 OK)', listRes.status === 200);
    assert('Response contains administrators array', Array.isArray(listRes.data?.data?.administrators));

    // Super Admin gets available permissions
    const permsRes = await request('/admin/administrators/permissions', superAuth);
    assert('Super Admin fetches available permissions catalog (200 OK)', permsRes.status === 200);
    assert('Permissions catalog contains array of permission keys', Array.isArray(permsRes.data?.data?.permissions));

    // Pre-University Admin cannot create administrator
    const testAdminPayload = {
      fullName: 'Test Auditor Admin',
      email: `test.admin.${Date.now()}@esa.dev`,
      password: 'SecurePassword123!',
      role: 'PRE_UNIVERSITY_ADMIN',
      division: 'PRE_UNIVERSITY',
      permissions: ['STUDENTS_VIEW', 'PROGRAMS_VIEW'],
    };
    const unauthCreate = await request('/admin/administrators', {
      ...preUniAuth,
      method: 'POST',
      body: testAdminPayload,
    });
    assert('Pre-University Admin blocked from POST /admin/administrators (403 Forbidden)', unauthCreate.status === 403);

    // Super Admin creates an administrator
    const createRes = await request('/admin/administrators', {
      ...superAuth,
      method: 'POST',
      body: testAdminPayload,
    });
    assert('Super Admin creates new administrator (201 Created)', createRes.status === 201);
    const newAdmin = createRes.data?.data?.administrator;
    assert('Created admin has assigned role PRE_UNIVERSITY_ADMIN', newAdmin?.role === 'PRE_UNIVERSITY_ADMIN');
    assert('Created admin has assigned division PRE_UNIVERSITY', newAdmin?.division === 'PRE_UNIVERSITY');
    assert('Created admin is active by default', newAdmin?.isActive === true);

    const newAdminId = newAdmin?.id || newAdmin?._id;

    // Duplicate email conflict check
    const duplicateRes = await request('/admin/administrators', {
      ...superAuth,
      method: 'POST',
      body: testAdminPayload,
    });
    assert('Duplicate administrator email rejected with 409 Conflict', duplicateRes.status === 409);

    // Super Admin cannot assign SUPER_ADMIN role to ordinary admin provisioning
    const illegalSuperAdminRes = await request('/admin/administrators', {
      ...superAuth,
      method: 'POST',
      body: {
        ...testAdminPayload,
        email: `illegal.super.${Date.now()}@esa.dev`,
        role: 'SUPER_ADMIN',
      },
    });
    assert('Assigning SUPER_ADMIN role in provisioning rejected (400 Bad Request)', illegalSuperAdminRes.status === 400);

    // Super Admin updates administrator division & permissions
    const updateRes = await request(`/admin/administrators/${newAdminId}`, {
      ...superAuth,
      method: 'PUT',
      body: {
        fullName: 'Updated Auditor Admin',
        role: 'UNIVERSITY_ADMIN',
        division: 'UNIVERSITY',
        permissions: ['STUDENTS_VIEW', 'STUDENTS_MANAGE', 'COHORTS_VIEW'],
      },
    });
    assert('Super Admin updates administrator division and permissions (200 OK)', updateRes.status === 200);
    const updatedAdmin = updateRes.data?.data?.administrator;
    assert('Updated admin division is now UNIVERSITY', updatedAdmin?.division === 'UNIVERSITY');
    assert('Updated admin role is now UNIVERSITY_ADMIN', updatedAdmin?.role === 'UNIVERSITY_ADMIN');

    // Super Admin toggles status (deactivate)
    const deactivateRes = await request(`/admin/administrators/${newAdminId}/status`, {
      ...superAuth,
      method: 'PATCH',
      body: { isActive: false },
    });
    assert('Super Admin deactivates administrator account (200 OK)', deactivateRes.status === 200);
    assert('Administrator status is now isActive=false', deactivateRes.data?.data?.administrator?.isActive === false);

    // Self-elevation / self-deactivation protection
    const selfDeactivateRes = await request(`/admin/administrators/${superAdmin.user.id}/status`, {
      ...superAuth,
      method: 'PATCH',
      body: { isActive: false },
    });
    assert('Super Admin cannot deactivate own account (400 Bad Request)', selfDeactivateRes.status === 400);
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
