import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from './NotificationBell';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.brand}>
        <i className={`fa-solid fa-satellite ${styles.brandIcon}`} aria-hidden="true"></i>
        <span className={styles.brandText}>
          Egyptian Space Agency
          <small>Academy Training Management Platform</small>
        </span>
      </Link>
      {user && (
        <div className={styles.right}>
          {user.role === 'STUDENT' && (
            <>
              <Link to="/student/cohorts" className="btn btn-sm btn-outline-info me-2 text-white border-white-50">
                <i className="fa-solid fa-graduation-cap me-1" aria-hidden="true"></i>
                My Classes
              </Link>
              <Link to="/student/invoices" className="btn btn-sm btn-outline-info me-2 text-white border-white-50">
                <i className="fa-solid fa-file-invoice me-1" aria-hidden="true"></i>
                My Invoices
              </Link>
              <Link to="/student/certificates" className="btn btn-sm btn-outline-info me-2 text-white border-white-50">
                <i className="fa-solid fa-award me-1" aria-hidden="true"></i>
                My Certificates
              </Link>
            </>
          )}
          {user.role === 'INSTRUCTOR' && (
            <Link to="/instructor/cohorts" className="btn btn-sm btn-outline-info me-2 text-white border-white-50">
              <i className="fa-solid fa-chalkboard-user me-1" aria-hidden="true"></i>
              My Cohorts
            </Link>
          )}
          <div className="me-2">
            <NotificationBell />
          </div>
          <span className={styles.userName}>
            {user.fullName}
            <span className={styles.roleTag}>{user.role.replace(/_/g, ' ')}</span>
          </span>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={handleLogout}>
            <i className="fa-solid fa-right-from-bracket me-1" aria-hidden="true"></i>
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}

