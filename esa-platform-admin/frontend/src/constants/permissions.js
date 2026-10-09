export const PERMISSIONS = {
  // Students
  STUDENTS_VIEW: 'STUDENTS_VIEW',
  STUDENTS_MANAGE: 'STUDENTS_MANAGE',

  // Instructors
  INSTRUCTORS_VIEW: 'INSTRUCTORS_VIEW',
  INSTRUCTORS_MANAGE: 'INSTRUCTORS_MANAGE',

  // Programs
  PROGRAMS_VIEW: 'PROGRAMS_VIEW',
  PROGRAMS_MANAGE: 'PROGRAMS_MANAGE',

  // Cohorts & Delivery
  COHORTS_VIEW: 'COHORTS_VIEW',
  COHORTS_MANAGE: 'COHORTS_MANAGE',

  // Applications & Readiness
  APPLICATIONS_VIEW: 'APPLICATIONS_VIEW',
  APPLICATIONS_REVIEW: 'APPLICATIONS_REVIEW',

  // Assessments & Evaluations
  ASSESSMENTS_VIEW: 'ASSESSMENTS_VIEW',
  ASSESSMENTS_MANAGE: 'ASSESSMENTS_MANAGE',

  // Enrollments & Capacity
  ENROLLMENTS_VIEW: 'ENROLLMENTS_VIEW',
  ENROLLMENTS_MANAGE: 'ENROLLMENTS_MANAGE',

  // Finance & Invoices
  FINANCE_VIEW: 'FINANCE_VIEW',
  FINANCE_MANAGE: 'FINANCE_MANAGE',

  // Certificates
  CERTIFICATES_VIEW: 'CERTIFICATES_VIEW',
  CERTIFICATES_MANAGE: 'CERTIFICATES_MANAGE',

  // System & Oversight
  NOTIFICATIONS_VIEW: 'NOTIFICATIONS_VIEW',
  REPORTS_VIEW: 'REPORTS_VIEW',
  AUDIT_LOGS_VIEW: 'AUDIT_LOGS_VIEW',
};

export const PERMISSION_GROUPS = [
  {
    group: 'Students',
    permissions: [
      { key: PERMISSIONS.STUDENTS_VIEW, label: 'View Students' },
      { key: PERMISSIONS.STUDENTS_MANAGE, label: 'Manage & Activate Students' },
    ],
  },
  {
    group: 'Instructors',
    permissions: [
      { key: PERMISSIONS.INSTRUCTORS_VIEW, label: 'View Instructors' },
      { key: PERMISSIONS.INSTRUCTORS_MANAGE, label: 'Manage & Provision Instructors' },
    ],
  },
  {
    group: 'Programs & Courses',
    permissions: [
      { key: PERMISSIONS.PROGRAMS_VIEW, label: 'View Programs' },
      { key: PERMISSIONS.PROGRAMS_MANAGE, label: 'Create, Edit & Archive Programs' },
    ],
  },
  {
    group: 'Cohorts & Training Delivery',
    permissions: [
      { key: PERMISSIONS.COHORTS_VIEW, label: 'View Cohorts & Sessions' },
      { key: PERMISSIONS.COHORTS_MANAGE, label: 'Manage Schedules & Sessions' },
    ],
  },
  {
    group: 'Applications & Admissions',
    permissions: [
      { key: PERMISSIONS.APPLICATIONS_VIEW, label: 'View Applications' },
      { key: PERMISSIONS.APPLICATIONS_REVIEW, label: 'Review & Decide Applications' },
    ],
  },
  {
    group: 'Assessments & Evaluations',
    permissions: [
      { key: PERMISSIONS.ASSESSMENTS_VIEW, label: 'View Assessments & Attempts' },
      { key: PERMISSIONS.ASSESSMENTS_MANAGE, label: 'Create Assessments & Grade' },
    ],
  },
  {
    group: 'Enrollments & Capacity',
    permissions: [
      { key: PERMISSIONS.ENROLLMENTS_VIEW, label: 'View Enrollments & Capacity' },
      { key: PERMISSIONS.ENROLLMENTS_MANAGE, label: 'Manage Seats & Waitlist' },
    ],
  },
  {
    group: 'Finance & Invoices',
    permissions: [
      { key: PERMISSIONS.FINANCE_VIEW, label: 'View Invoices & Payments' },
      { key: PERMISSIONS.FINANCE_MANAGE, label: 'Generate Invoices & Record Payments' },
    ],
  },
  {
    group: 'Certificates',
    permissions: [
      { key: PERMISSIONS.CERTIFICATES_VIEW, label: 'View & Download Certificates' },
      { key: PERMISSIONS.CERTIFICATES_MANAGE, label: 'Issue & Revoke Certificates' },
    ],
  },
  {
    group: 'System Oversight',
    permissions: [
      { key: PERMISSIONS.NOTIFICATIONS_VIEW, label: 'View System Notifications' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports & Analytics' },
      { key: PERMISSIONS.AUDIT_LOGS_VIEW, label: 'View Platform Audit Logs' },
    ],
  },
];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Checks whether a user possesses a specific permission.
 * - SUPER_ADMIN always has full platform permissions.
 * - Division admins with an explicit permissions array must include the permission.
 * - Division admins with no permissions array (legacy) default to true.
 */
export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }
  return true;
}
