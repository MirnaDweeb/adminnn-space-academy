import { useAuth } from '../../hooks/useAuth';
import EmptyState from '../../components/common/EmptyState';
import styles from './DashboardPage.module.css';

// Generic landing dashboard for Student and Instructor roles.
// Kept intentionally minimal in this foundation phase — student-facing
// program browsing/application flows and instructor tools are future work.
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className={styles.welcome}>
        <h1>Welcome, {user?.fullName}</h1>
        <p>{user?.role === 'STUDENT' ? 'Your Academy student dashboard.' : 'Your Academy instructor dashboard.'}</p>
      </div>
      <EmptyState
        icon="fa-rocket"
        title="Your dashboard is being built"
        description="Program browsing, applications, and course tools will appear here in a future phase."
      />
    </div>
  );
}
