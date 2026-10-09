import { Outlet } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import styles from './MainLayout.module.css';

// Generic authenticated layout for Student / Instructor dashboards.
export default function MainLayout() {
  return (
    <div className="esa-page">
      <Navbar />
      <div className={styles.content}>
        <div className="esa-container">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
