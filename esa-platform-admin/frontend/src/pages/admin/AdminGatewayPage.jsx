import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import adminService from '../../services/api/adminService';
import styles from './AdminGatewayPage.module.css';

const DIVISION_META = {
  PRE_UNIVERSITY: {
    icon: 'fa-school',
    path: '/admin/PRE_UNIVERSITY',
    badge: 'K-12 & Pre-College',
  },
  UNIVERSITY: {
    icon: 'fa-graduation-cap',
    path: '/admin/UNIVERSITY',
    badge: 'Undergraduate & Professional',
  },
};

const MANAGED_ITEMS = [
  'Students',
  'Programs',
  'Cohorts',
  'Applications',
  'Instructors',
  'Assessments',
  'Training Delivery',
];

// The Super Admin Administration Gateway (/admin).
// All figures come straight from GET /api/admin/gateway — real,
// database-derived counts, zero when the database is empty.
export default function AdminGatewayPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getGatewayOverview();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load administration gateway');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState message="Loading administration gateway..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Super Admin Administration Gateway"
        subtitle="Full platform control across academy divisions. Select a division to enter scoped operational workflows."
        actions={
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => navigate('/admin/administrators')}
            >
              <i className="fa-solid fa-users-gear me-1" aria-hidden="true"></i>
              Manage Administrators
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => navigate('/admin/assessments')}
            >
              <i className="fa-solid fa-clipboard-check me-1" aria-hidden="true"></i>
              Assessments Builder
            </button>
          </div>
        }
      />

      <div className={styles.grid}>
        {data.divisions.map((division) => {
          const meta = DIVISION_META[division.key] || {
            icon: 'fa-building-columns',
            path: `/admin/${division.key}`,
            badge: 'Division',
          };

          return (
            <div className={styles.card} key={division.key}>
              <div className={styles.cardHeader}>
                <div className={styles.iconWrap}>
                  <i className={`fa-solid ${meta.icon}`} aria-hidden="true"></i>
                </div>
                <div>
                  <div className={styles.cardTitle}>{division.name}</div>
                  <span className={styles.divisionBadge}>{meta.badge}</span>
                </div>
              </div>

              <div className={styles.cardDesc}>
                Manage {division.name.toLowerCase()} students, programs, cohorts, applications, instructors, assessments, and training delivery.
              </div>

              <div className={styles.managedPills}>
                {MANAGED_ITEMS.map((item) => (
                  <span key={item} className={styles.managedPill}>
                    <i className="fa-solid fa-check text-success me-1" style={{ fontSize: '0.65rem' }}></i>
                    {item}
                  </span>
                ))}
              </div>

              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <div className={styles.statValue}>{division.studentCount ?? 0}</div>
                  <div className={styles.statLabel}>Students</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statValue}>{division.activePrograms ?? 0}</div>
                  <div className={styles.statLabel}>Active Programs</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statValue}>{division.pendingApplications ?? 0}</div>
                  <div className={styles.statLabel}>Pending Apps</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statValue}>{division.activeCohorts ?? 0}</div>
                  <div className={styles.statLabel}>Active Cohorts</div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary w-100 mt-auto py-2"
                onClick={() => navigate(meta.path)}
              >
                Enter {division.name} <i className="fa-solid fa-arrow-right ms-1" aria-hidden="true"></i>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
