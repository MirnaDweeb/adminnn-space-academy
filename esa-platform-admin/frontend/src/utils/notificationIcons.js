/**
 * notificationIcons.js
 *
 * Centralized Font Awesome icon and target navigation route mapping
 * for all notification types in the Space Academy platform.
 * 
 * Complies with strict architectural rule:
 * - Uses existing Font Awesome icons only.
 * - Does NOT use emoji, Lucide, React Icons, or random SVGs.
 * - Single source of truth across all components.
 */

import { NOTIFICATION_TYPE } from '../constants/notifications';

export const NOTIFICATION_ICON_MAP = Object.freeze({
  APPLICATION_DECISION: {
    icon: 'fa-file-signature',
    label: 'Application Decision',
    accentColor: '#3A6985',
    bgClass: 'bg-primary-subtle text-primary',
  },
  PAYMENT_CONFIRMED: {
    icon: 'fa-receipt',
    label: 'Payment Confirmed',
    accentColor: '#1E7C85',
    bgClass: 'bg-success-subtle text-success',
  },
  PAYMENT_EXPIRED: {
    icon: 'fa-clock-rotate-left',
    label: 'Payment Expired',
    accentColor: '#996814',
    bgClass: 'bg-warning-subtle text-warning',
  },
  ENROLLMENT_WAITLISTED: {
    icon: 'fa-hourglass-half',
    label: 'Enrollment Waitlisted',
    accentColor: '#4E83A4',
    bgClass: 'bg-info-subtle text-info',
  },
  ENROLLMENT_PROMOTED: {
    icon: 'fa-user-check',
    label: 'Enrollment Promoted',
    accentColor: '#1E7C85',
    bgClass: 'bg-primary-subtle text-primary',
  },
  EVALUATION_PUBLISHED: {
    icon: 'fa-chart-pie',
    label: 'Evaluation Published',
    accentColor: '#3A6985',
    bgClass: 'bg-primary-subtle text-primary',
  },
  CERTIFICATE_ISSUED: {
    icon: 'fa-award',
    label: 'Certificate Issued',
    accentColor: '#1E7C85',
    bgClass: 'bg-success-subtle text-success',
  },
  CERTIFICATE_REVOKED: {
    icon: 'fa-triangle-exclamation',
    label: 'Certificate Revoked',
    accentColor: '#DF4F4C',
    bgClass: 'bg-danger-subtle text-danger',
  },
  PAYMENT_REMINDER_DUE_SOON: {
    icon: 'fa-clock',
    label: 'Payment Due Soon',
    accentColor: '#996814',
    bgClass: 'bg-warning-subtle text-warning',
  },
  PAYMENT_REMINDER_OVERDUE: {
    icon: 'fa-circle-exclamation',
    label: 'Payment Overdue',
    accentColor: '#DF4F4C',
    bgClass: 'bg-danger-subtle text-danger',
  },
});

/**
 * Returns Font Awesome icon class for a notification type.
 */
export function getNotificationIcon(type) {
  return NOTIFICATION_ICON_MAP[type]?.icon || 'fa-bell';
}

/**
 * Returns config object for a notification type.
 */
export function getNotificationConfig(type) {
  return (
    NOTIFICATION_ICON_MAP[type] || {
      icon: 'fa-bell',
      label: 'Notification',
      accentColor: '#64748b',
      bgClass: 'bg-secondary-subtle text-secondary',
    }
  );
}

/**
 * Resolves destination route when clicking a notification.
 * Respects user role, active division scoping, and resource type.
 *
 * @param {Object} item Notification object
 * @param {Object} user Current authenticated user
 * @param {string} [currentDivision] Currently selected division in admin context
 * @returns {string} Route path to navigate to
 */
export function getNotificationTargetRoute(item, user, currentDivision) {
  if (!item) return '/notifications';

  const role = user?.role;
  const isStudent = role === 'STUDENT';
  const isInstructor = role === 'INSTRUCTOR';

  // 1. Student navigation targets
  if (isStudent) {
    switch (item.type) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_EXPIRED':
        return '/student/invoices';
      case 'CERTIFICATE_ISSUED':
      case 'CERTIFICATE_REVOKED':
        return '/student/certificates';
      case 'ENROLLMENT_PROMOTED':
      case 'ENROLLMENT_WAITLISTED':
      case 'EVALUATION_PUBLISHED':
        return '/student/cohorts';
      case 'APPLICATION_DECISION':
      default:
        return '/dashboard';
    }
  }

  // 2. Instructor navigation targets
  if (isInstructor) {
    return '/instructor/cohorts';
  }

  // 3. Admin navigation targets (Division-scoped or Super Admin)
  const division = currentDivision || item.division || user?.division;
  const prefix = division ? `/admin/${division}` : '/admin';

  switch (item.type) {
    case 'APPLICATION_DECISION':
      return `${prefix}/applications`;
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_EXPIRED':
      return `${prefix}/invoices`;
    case 'ENROLLMENT_PROMOTED':
    case 'ENROLLMENT_WAITLISTED':
      return `${prefix}/cohorts`;
    case 'EVALUATION_PUBLISHED':
      return `${prefix}/cohorts`;
    case 'CERTIFICATE_ISSUED':
    case 'CERTIFICATE_REVOKED':
      return `${prefix}/certificates`;
    default:
      if (item.relatedResource?.resourceType === 'Certificate') {
        return `${prefix}/certificates`;
      }
      if (item.relatedResource?.resourceType === 'Invoice') {
        return `${prefix}/invoices`;
      }
      if (item.relatedResource?.resourceType === 'Cohort') {
        return `${prefix}/cohorts`;
      }
      if (item.relatedResource?.resourceType === 'Application') {
        return `${prefix}/applications`;
      }
      return '/notifications';
  }
}
