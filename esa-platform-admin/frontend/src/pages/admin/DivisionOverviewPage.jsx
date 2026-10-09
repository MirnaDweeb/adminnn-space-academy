import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import adminService from '../../services/api/adminService';
import { DIVISION_LABELS } from '../../constants/divisions';
import styles from './DivisionOverviewPage.module.css';

// Renders /admin/pre-university and /admin/university.
// Backend enforces the division scope via enforceDivisionParam — a division
// admin cannot see the other division's numbers here even by editing the URL.
export default function DivisionOverviewPage() {
  const { division } = useParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getDivisionOverview(division);
      setStats(result);
    } catch (err) {
      setError(err.message || 'Failed to load division overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [division]);

  if (loading) return <LoadingState message="Loading division overview..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title={`${DIVISION_LABELS[division] || division} Administration`}
        subtitle="Overview of students, programs, and applications for this division."
      />

      <div className={styles.statsGrid}>
        <StatCard icon="fa-user-graduate" label="Students" value={stats.studentCount} tone="cyan" />
        <StatCard icon="fa-book-open" label="Active Programs" value={stats.activePrograms} tone="gold" />
        <StatCard icon="fa-file-lines" label="Pending Applications" value={stats.pendingApplications} />
      </div>

      <div className={styles.sectionsGrid}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Upcoming Sessions</div>
          <EmptyState icon="fa-calendar-days" title="No upcoming sessions" description="Session scheduling is planned for a future phase." />
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Recent Activity</div>
          <EmptyState icon="fa-clock-rotate-left" title="No recent activity" description="Activity will appear here as admins take actions." />
        </div>
      </div>
    </div>
  );
}
