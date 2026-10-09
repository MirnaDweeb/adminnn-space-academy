import styles from './LoadingState.module.css';

export default function LoadingState({ message = 'Loading...', fullPage = false }) {
  return (
    <div className={`${styles.wrap} ${fullPage ? styles.fullPage : ''}`}>
      <div className="spinner-border text-primary mb-2" role="status" aria-hidden="true"></div>
      <div>{message}</div>
    </div>
  );
}
