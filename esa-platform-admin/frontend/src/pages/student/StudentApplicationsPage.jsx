import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import applicationService from '../../services/api/applicationService';
import { DIVISION_LABELS } from '../../constants/divisions';
import styles from './StudentApplicationsPage.module.css';

export default function StudentApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await applicationService.listMyApplications();
      setApplications(res?.applications || []);
    } catch (err) {
      console.error('Failed to load applications:', err);
      setError(err.response?.data?.message || err.message || 'Unable to retrieve applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Program Applications"
        subtitle="Track the review progress, readiness evaluations, and admission status of your program submissions."
        actions={
          <Link to="/programs" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1">
            <i className="fa-solid fa-satellite-dish" />
            Browse More Programs
          </Link>
        }
      />

      {loading ? (
        <LoadingState message="Loading your applications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchApplications} />
      ) : applications.length === 0 ? (
        <EmptyState
          icon="fa-file-lines"
          title="No Applications Submitted"
          message="You have not submitted any program applications yet. Browse the catalog to find available tracks."
          action={
            <Link to="/programs" className="btn btn-primary btn-sm mt-3">
              Browse Program Catalog
            </Link>
          }
        />
      ) : (
        <div className={styles.tableWrap}>
          {applications.map((app) => {
            const program = app.program || {};
            const isAdmitted = ['CONFIRMED', 'ACTIVE', 'ENROLLED'].includes(app.status);
            const isPendingPayment = app.status === 'PENDING_PAYMENT';

            return (
              <div key={app._id} className={styles.appItem}>
                <div className={styles.titleArea}>
                  <div className={styles.programTitle}>
                    {program.title || 'Academy Program'}
                  </div>
                  <div className={styles.subInfo}>
                    <span>
                      <i className="fa-solid fa-layer-group me-1 text-muted" />
                      {DIVISION_LABELS[program.division || app.division] || app.division}
                    </span>
                    <span>&middot;</span>
                    <span>
                      <i className="fa-regular fa-calendar me-1 text-muted" />
                      Submitted on {new Date(app.submittedAt || app.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className={styles.statusArea}>
                  <StatusBadge status={app.status} />

                  {isPendingPayment && (
                    <Link to="/student/invoices" className={`btn btn-sm btn-outline-warning ${styles.actionBtn}`}>
                      <i className="fa-solid fa-receipt" />
                      Pay Tuition
                    </Link>
                  )}

                  {isAdmitted && (
                    <Link to="/student/cohorts" className={`btn btn-sm btn-outline-success ${styles.actionBtn}`}>
                      <i className="fa-solid fa-chalkboard-user" />
                      Access Classes
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
