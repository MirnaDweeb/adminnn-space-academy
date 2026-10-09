import styles from './EmptyState.module.css';

export default function EmptyState({ icon = 'fa-inbox', title = 'No records found', description }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}><i className={`fa-solid ${icon}`} aria-hidden="true"></i></div>
      <div className={styles.title}>{title}</div>
      {description && <div>{description}</div>}
    </div>
  );
}
