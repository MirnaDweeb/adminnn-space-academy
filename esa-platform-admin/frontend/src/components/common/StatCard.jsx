import styles from './StatCard.module.css';

export default function StatCard({ icon, label, title, value, subtitle, helper, tone = 'default' }) {
  const displayLabel = title || label;
  const displaySub = subtitle || helper || (title && label ? label : null);
  return (
    <div className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.iconWrap}>
        <i className={`fa-solid ${icon}`} aria-hidden="true"></i>
      </div>
      <div>
        <div className={styles.value}>{value}</div>
        <div className={styles.label}>{displayLabel}</div>
        {displaySub && <div className={styles.subtext} style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{displaySub}</div>}
      </div>
    </div>
  );
}

