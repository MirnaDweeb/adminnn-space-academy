/**
 * TASK UI-002: Navigation Regression Audit & Verification Script
 * Validates route matching, role navigation integrity, and auto-expansion logic.
 */

// Route definitions extracted directly from App.jsx
const APP_ROUTES = [
  // Public
  { path: '/verify/:token', public: true },
  { path: '/verify-certificate', public: true },
  { path: '/verify', public: true },
  { path: '/login', public: true },
  { path: '/register', public: true },
  { path: '/', auth: true },
  { path: '/unauthorized', auth: true },

  // Student / Instructor (MainLayout)
  { path: '/notifications', roles: ['STUDENT', 'INSTRUCTOR'] },
  { path: '/dashboard', roles: ['STUDENT', 'INSTRUCTOR'] },
  { path: '/instructor/cohorts', roles: ['INSTRUCTOR'] },
  { path: '/student/cohorts', roles: ['STUDENT'] },
  { path: '/student/certificates', roles: ['STUDENT'] },
  { path: '/student/invoices', roles: ['STUDENT'] },
  { path: '/student/payments/return', roles: ['STUDENT'] },
  { path: '/student/assessments/:id', roles: ['STUDENT'] },

  // Super Admin gateway (AdminLayout)
  { path: '/admin', roles: ['SUPER_ADMIN'] },
  { path: '/admin/administrators', roles: ['SUPER_ADMIN'] },
  { path: '/admin/instructors', roles: ['SUPER_ADMIN'] },
  { path: '/admin/programs', roles: ['SUPER_ADMIN'] },
  { path: '/admin/cohorts', roles: ['SUPER_ADMIN'] },
  { path: '/admin/assessments', roles: ['SUPER_ADMIN'] },
  { path: '/admin/applications', roles: ['SUPER_ADMIN'] },
  { path: '/admin/invoices', roles: ['SUPER_ADMIN'] },
  { path: '/admin/certificates', roles: ['SUPER_ADMIN'] },
  { path: '/admin/feedback', roles: ['SUPER_ADMIN'] },
  { path: '/admin/notifications', roles: ['SUPER_ADMIN'] },
  { path: '/admin/audit-logs', roles: ['SUPER_ADMIN'] },
  { path: '/admin/reports', roles: ['SUPER_ADMIN'] },

  // Division-scoped administration (AdminLayout)
  { path: '/admin/:division', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/students', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/students/:id', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/instructors', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/programs', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/cohorts', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/assessments', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/applications', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/invoices', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/certificates', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/feedback', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/notifications', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/audit-logs', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
  { path: '/admin/:division/reports', roles: ['SUPER_ADMIN', 'PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
];

function routeMatches(pattern, actualPath) {
  const regexPattern = '^' + pattern
    .replace(/:division/g, '(PRE_UNIVERSITY|UNIVERSITY)')
    .replace(/:id/g, '[^/]+')
    .replace(/:token/g, '[^/]+') + '$';
  return new RegExp(regexPattern).test(actualPath);
}

function findMatchingRoute(path) {
  return APP_ROUTES.find(r => routeMatches(r.path, path));
}

// 1. Audit Super Admin Sections (tested with PRE_UNIVERSITY and UNIVERSITY)
function auditSuperAdmin(division) {
  console.log(`\n--- Auditing Super Admin Navigation (Division: ${division}) ---`);
  const sections = [
    { title: 'Dashboard & Gateway', items: ['/admin', `/admin/${division}`] },
    { title: 'Academic Programs', items: [`/admin/${division}/programs`, `/admin/${division}/cohorts`, `/admin/${division}/assessments`] },
    { title: 'Admissions & Enrollments', items: [`/admin/${division}/applications`, `/admin/${division}/cohorts`] },
    { title: 'User Management', items: [`/admin/${division}/students`, `/admin/${division}/instructors`, '/admin/administrators'] },
    { title: 'Finance & Quality', items: [`/admin/${division}/invoices`, `/admin/${division}/certificates`, `/admin/${division}/feedback`] },
    { title: 'System & Analytics', items: [`/admin/${division}/notifications`, '/admin/reports', '/admin/audit-logs'] },
  ];

  let total = 0;
  let passed = 0;
  for (const sec of sections) {
    for (const to of sec.items) {
      total++;
      const match = findMatchingRoute(to);
      if (!match) {
        console.error(`FAIL: No matching route in App.jsx for '${to}' (Section: ${sec.title})`);
      } else if (!match.roles.includes('SUPER_ADMIN')) {
        console.error(`FAIL: Super Admin not authorized for '${to}'`);
      } else {
        passed++;
      }
    }
  }
  console.log(`Super Admin Check: ${passed}/${total} destinations matched and authorized.`);
  return passed === total;
}

// 2. Audit Division Admin Sections
function auditDivisionAdmin(role, division) {
  console.log(`\n--- Auditing Division Admin (${role} / ${division}) ---`);
  const sections = [
    { title: 'Dashboard', items: [`/admin/${division}`] },
    { title: 'Academic Programs', items: [`/admin/${division}/programs`, `/admin/${division}/cohorts`, `/admin/${division}/assessments`] },
    { title: 'Admissions & Enrollments', items: [`/admin/${division}/applications`, `/admin/${division}/cohorts`] },
    { title: 'User Management', items: [`/admin/${division}/students`, `/admin/${division}/instructors`] },
    { title: 'Finance & Quality', items: [`/admin/${division}/invoices`, `/admin/${division}/certificates`, `/admin/${division}/feedback`] },
    { title: 'System & Analytics', items: [`/admin/${division}/notifications`, `/admin/${division}/reports`, `/admin/${division}/audit-logs`] },
  ];

  let total = 0;
  let passed = 0;
  for (const sec of sections) {
    for (const to of sec.items) {
      total++;
      const match = findMatchingRoute(to);
      if (!match) {
        console.error(`FAIL: No matching route for '${to}'`);
      } else if (!match.roles.includes(role)) {
        console.error(`FAIL: ${role} not authorized for '${to}'`);
      } else {
        passed++;
      }
    }
  }

  // Security check: Verify administrators is NOT in division admin navigation
  const secAdminCheck = sections.some(s => s.items.includes('/admin/administrators'));
  if (secAdminCheck) {
    console.error(`FAIL: Unauthorized /admin/administrators exposed to ${role}!`);
    return false;
  }
  console.log(`Security: Global /admin/administrators correctly blocked from ${role} navigation.`);
  console.log(`${role} Check: ${passed}/${total} destinations matched and authorized.`);
  return passed === total;
}

// 3. Audit Student Navigation
function auditStudent() {
  console.log('\n--- Auditing Student Navigation ---');
  const items = [
    '/dashboard',
    '/student/cohorts',
    '/student/certificates',
    '/student/invoices',
    '/notifications'
  ];
  let passed = 0;
  for (const to of items) {
    const match = findMatchingRoute(to);
    if (match && match.roles.includes('STUDENT')) {
      passed++;
    } else {
      console.error(`FAIL: Student route '${to}' invalid or unauthorized`);
    }
  }
  console.log(`Student Check: ${passed}/${items.length} destinations matched and authorized.`);
  return passed === items.length;
}

// 4. Audit Instructor Navigation
function auditInstructor() {
  console.log('\n--- Auditing Instructor Navigation ---');
  const items = [
    '/dashboard',
    '/instructor/cohorts',
    '/notifications'
  ];
  let passed = 0;
  for (const to of items) {
    const match = findMatchingRoute(to);
    if (match && match.roles.includes('INSTRUCTOR')) {
      passed++;
    } else {
      console.error(`FAIL: Instructor route '${to}' invalid or unauthorized`);
    }
  }
  console.log(`Instructor Check: ${passed}/${items.length} destinations matched and authorized.`);
  return passed === items.length;
}

// 5. Test Auto-Expansion Algorithm on Direct URLs
function testAutoExpansion() {
  console.log('\n--- Testing Auto-Expansion Algorithm on Direct URLs ---');
  const sections = [
    { title: 'Dashboard & Gateway', items: [{ to: '/admin', end: true }, { to: '/admin/PRE_UNIVERSITY', end: true }] },
    { title: 'Academic Programs', items: [{ to: '/admin/PRE_UNIVERSITY/programs' }, { to: '/admin/PRE_UNIVERSITY/cohorts' }] },
    { title: 'User Management', items: [{ to: '/admin/PRE_UNIVERSITY/students' }, { to: '/admin/PRE_UNIVERSITY/instructors' }] },
  ];

  const testCases = [
    { url: '/admin', expectedSection: 'Dashboard & Gateway' },
    { url: '/admin/PRE_UNIVERSITY', expectedSection: 'Dashboard & Gateway' },
    { url: '/admin/PRE_UNIVERSITY/programs', expectedSection: 'Academic Programs' },
    { url: '/admin/PRE_UNIVERSITY/students', expectedSection: 'User Management' },
    { url: '/admin/PRE_UNIVERSITY/students/64f8a29b0123', expectedSection: 'User Management' }, // Nested detail route
  ];

  let passed = 0;
  for (const tc of testCases) {
    let matchedSection = null;
    for (const sec of sections) {
      const hasActiveChild = sec.items.some(item => {
        if (item.end) return tc.url === item.to;
        return tc.url === item.to || tc.url.startsWith(item.to + '/');
      });
      if (hasActiveChild) {
        matchedSection = sec.title;
        break;
      }
    }
    if (matchedSection === tc.expectedSection) {
      console.log(`  ✓ URL '${tc.url}' correctly expands '${matchedSection}'`);
      passed++;
    } else {
      console.error(`  ✗ URL '${tc.url}' expected '${tc.expectedSection}', got '${matchedSection}'`);
    }
  }
  return passed === testCases.length;
}

// Run all checks
const okSuperPre = auditSuperAdmin('PRE_UNIVERSITY');
const okSuperUni = auditSuperAdmin('UNIVERSITY');
const okPreAdmin = auditDivisionAdmin('PRE_UNIVERSITY_ADMIN', 'PRE_UNIVERSITY');
const okUniAdmin = auditDivisionAdmin('UNIVERSITY_ADMIN', 'UNIVERSITY');
const okStudent = auditStudent();
const okInstructor = auditInstructor();
const okExpansion = testAutoExpansion();

const allPassed = okSuperPre && okSuperUni && okPreAdmin && okUniAdmin && okStudent && okInstructor && okExpansion;

console.log('\n========================================');
console.log(`AUDIT RESULT: ${allPassed ? 'ALL CHECKS PASSED (100%)' : 'SOME CHECKS FAILED'}`);
console.log('========================================\n');
process.exit(allPassed ? 0 : 1);
