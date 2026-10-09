import { Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.css';

export default function AuthLayout() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <i className="fa-solid fa-satellite" aria-hidden="true"></i>
          <span className={styles.brandText}>
            Egyptian Space Agency
            <small>Academy Training Management Platform</small>
          </span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
