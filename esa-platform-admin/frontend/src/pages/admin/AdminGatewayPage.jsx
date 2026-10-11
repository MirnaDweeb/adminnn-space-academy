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
    description: 'Pre-college student admissions, secondary education programs, and foundational training delivery.',
    accentClass: styles.preUniAccent,
    btnId: 'btn-enter-pre-university',
  },
  UNIVERSITY: {
    icon: 'fa-graduation-cap',
    path: '/admin/UNIVERSITY',
    badge: 'Undergraduate & Professional',
    description: 'Undergraduate engineering cohorts, university partnerships, and advanced space systems curricula.',
    accentClass: styles.uniAccent,
    btnId: 'btn-enter-university',
  },
};

// The Super Admin Administration Gateway (/admin).
// Displays real, database-derived operational metrics for each academy division.
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
    <div className={styles.container}>
      {/* Official Academy Emblem & Gateway Title Banner */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          <img
            src="/esa-logo.png"
            alt="Egyptian Space Agency Academy Official Emblem"
            className={styles.heroLogo}
          />
          <div>
            <h1 className={styles.heroTitle}>Administration Gateway</h1>
            <p className={styles.heroSubtitle}>
              Manage academy divisions and access their administrative workspaces.
            </p>
          </div>
        </div>
        <div className={styles.heroActions}>
          <button
            type="button"
            id="btn-gateway-manage-admins"
            className="btn btn-primary"
            onClick={() => navigate('/admin/administrators')}
            title="Configure platform administrators, roles, and granular permissions"
          >
            <i className="fa-solid fa-user-shield me-1.5" aria-hidden="true"></i>
            Manage Administrators
          </button>
        </div>
      </div>

      {/* Two Primary Division Workspace Cards */}
      <div className={styles.grid}>
        {data.divisions.map((division) => {
          const meta = DIVISION_META[division.key] || {
            icon: 'fa-building-columns',
            path: `/admin/${division.key}`,
            badge: 'Division',
            description: `Administrative operations and training delivery for ${division.name.toLowerCase()}.`,
            accentClass: '',
            btnId: `btn-enter-${division.key.toLowerCase().replace(/_/g, '-')}`,
          };

          return (
            <div className={`${styles.panel} ${meta.accentClass}`} key={division.key}>
              <div className={styles.panelHeader}>
                <div className={styles.iconWrap} aria-hidden="true">
                  <i className={`fa-solid ${meta.icon}`}></i>
                </div>
                <div className={styles.titleArea}>
                  <div className={styles.titleRow}>
                    <h2 className={styles.divisionTitle}>{division.name}</h2>
                    <span className={styles.educationBadge}>{meta.badge}</span>
                  </div>
                  <p className={styles.divisionDesc}>{meta.description}</p>
                </div>
              </div>

              {/* Compact Metrics Row with Live Calculated Statistics */}
              <div className={styles.metricsRow}>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Students</span>
                  <span className={styles.metricValue}>{division.studentCount ?? 0}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Active Programs</span>
                  <span className={styles.metricValue}>{division.activePrograms ?? 0}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Pending Applications</span>
                  <span className={styles.metricValue}>{division.pendingApplications ?? 0}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Active Cohorts</span>
                  <span className={styles.metricValue}>{division.activeCohorts ?? 0}</span>
                </div>
              </div>

              {/* Concise Secondary Feature Note */}
              <div className={styles.operationsScope}>
                <i className="fa-solid fa-layer-group me-1.5 text-muted" aria-hidden="true"></i>
                <span>Managed operations: Students · Programs · Cohorts · Applications · Instructors · Assessments · Delivery</span>
              </div>

              {/* Panel Action Button */}
              <div className={styles.panelFooter}>
                <button
                  type="button"
                  id={meta.btnId}
                  className={styles.entryButton}
                  onClick={() => navigate(meta.path)}
                  aria-label={`Enter ${division.name} workspace`}
                >
                  <span>Enter Workspace</span>
                  <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
