import styles from './StatusBadge.module.css';

const TONE_MAP = {
  ACTIVE: 'success',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  SUBMITTED: 'info',
  IN_PROGRESS: 'info',
  RECORDED: 'info',
  INITIATED: 'info',
  MANUAL_REVIEW: 'warning',
  NEEDS_INFORMATION: 'warning',
  WAITLISTED: 'warning',
  DRAFT: 'warning',
  PENDING: 'warning',
  PENDING_PAYMENT: 'warning',
  READINESS_REQUIRED: 'warning',
  FOUNDATION_RECOMMENDED: 'info',
  ARCHIVED: 'danger',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  VOIDED: 'danger',
  FAILED: 'danger',
  FAIL: 'danger',
  PASS: 'success',
  NO_SHOW: 'danger',
  INCOMPLETE: 'warning',
  SCHEDULED: 'info',
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  EXCUSED: 'info',
  INACTIVE: 'danger',
  DEACTIVATED: 'danger',
  ISSUED: 'success',
  REVOKED: 'danger',
};

export default function StatusBadge({ status }) {
  const tone = TONE_MAP[status] || 'neutral';
  const label = (status || '').replace(/_/g, ' ').toLowerCase();
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>;
}
