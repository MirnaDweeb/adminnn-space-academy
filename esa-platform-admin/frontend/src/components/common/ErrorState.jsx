import styles from './ErrorState.module.css';

export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}><i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <div className={styles.message}>{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
