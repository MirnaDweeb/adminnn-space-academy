import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import adminService from '../../services/api/adminService';
import { DIVISION_LABELS } from '../../constants/divisions';
import styles from './DivisionOverviewPage.module.css';

/**
 * Maps audit actions to distinct visual icons
 */
function getActionIcon(action) {
  if (!action) return 'fa-clock-rotate-left';
  if (action.includes('STUDENT')) return 'fa-user-graduate';
  if (action.includes('PROGRAM')) return 'fa-book-open';
  if (action.includes('COHORT')) return 'fa-people-group';
  if (action.includes('SESSION')) return 'fa-tower-broadcast';
  if (action.includes('ATTENDANCE')) return 'fa-clipboard-user';
  if (action.includes('APPLICATION') || action.includes('READINESS')) return 'fa-file-lines';
  if (action.includes('CERTIFICATE')) return 'fa-certificate';
  if (action.includes('INVOICE') || action.includes('PAYMENT')) return 'fa-receipt';
  if (action.includes('INSTRUCTOR')) return 'fa-chalkboard-user';
  if (action.includes('NOTIFICATION') || action.includes('MESSAGE') || action.includes('REMINDER')) return 'fa-bell';
  if (action.includes('ADMIN')) return 'fa-user-shield';
  return 'fa-shield-halved';
}

/**
 * Formats ISO date into human-readable date & time
 */
function formatSessionDate(dateStr, startTime) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const formattedDate = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return startTime ? `${formattedDate} · ${startTime}` : formattedDate;
}

/**
 * Human-readable relative time formatting (e.g., '10m ago', '2h ago')
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DivisionOverviewPage() {
  const { division } = useParams();
  const normDivision = (division || '').replace(/-/g, '_').toUpperCase();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const result = await adminService.getDivisionOverview(normDivision);
      setStats(result);
    } catch (err) {
      setError(err.message || 'Failed to load division overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normDivision]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <LoadingState message="Loading division overview..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => load(false)} />;
  }

  const divisionName = DIVISION_LABELS[normDivision] || normDivision;
  const upcomingSessions = stats?.upcomingSessions || [];
  const recentActivity = stats?.recentActivity || [];
  const recentApplications = stats?.recentApplications || [];
  const appBreakdown = stats?.applicationBreakdown || {};

  return (
    <div className={styles.dashboardContainer}>
      {/* Page Header with Quick Actions & Live Refresh */}
      <PageHeader
        title={`${divisionName} Administration`}
        subtitle={`Operational overview of students, programs, live sessions, and applications for ${divisionName}.`}
        actions={
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => load(true)}
              disabled={refreshing}
              title="Refresh live dashboard metrics"
              aria-label="Refresh Dashboard Data"
            >
              <i
                className={`fa-solid fa-rotate-right ${refreshing ? 'fa-spin' : ''}`}
                aria-hidden="true"
              ></i>
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <Link
              to={`/admin/${normDivision}/sessions`}
              className="btn btn-outline-primary btn-sm"
              title="View all scheduled and live sessions"
            >
              <i className="fa-solid fa-tower-broadcast me-1.5" aria-hidden="true"></i>
              Live Sessions
            </Link>
            <Link
              to={`/admin/${normDivision}/applications`}
              className="btn btn-primary btn-sm"
              title="Review student applications"
            >
              <i className="fa-solid fa-file-lines me-1.5" aria-hidden="true"></i>
              Applications
            </Link>
          </div>
        }
      />

      {/* KPI Summary Section: 6 Database-Derived Metric Cards */}
      <div className={styles.kpiGrid}>
        <StatCard
          icon="fa-user-graduate"
          label="Registered Students"
          value={stats.studentCount ?? 0}
          tone="cyan"
          helper="Enrolled division trainees"
        />
        <StatCard
          icon="fa-book-open"
          label="Active Programs"
          value={stats.activePrograms ?? 0}
          tone="gold"
          helper="Published active curricula"
        />
        <StatCard
          icon="fa-id-card"
          label="Pending Applications"
          value={stats.pendingApplications ?? 0}
          tone="default"
          helper="Awaiting review or decision"
        />
        <StatCard
          icon="fa-people-group"
          label="Active Cohorts"
          value={stats.activeCohorts ?? 0}
          tone="cyan"
          helper="Scheduled & running cohorts"
        />
        <StatCard
          icon="fa-calendar-days"
          label="Upcoming Sessions"
          value={stats.upcomingSessionsCount ?? 0}
          tone="gold"
          helper="Scheduled & in-progress"
        />
        <StatCard
          icon="fa-certificate"
          label="Issued Certificates"
          value={stats.issuedCertificatesCount ?? 0}
          tone="default"
          helper={`${stats.completedSessionsCount ?? 0} sessions completed`}
        />
      </div>

      {/* Primary Operational Grid: Upcoming Sessions & Recent Activity */}
      <div className={styles.operationalGrid}>
        {/* Left Column: Upcoming Academic Sessions */}
        <section className={styles.sectionCard} aria-labelledby="upcoming-sessions-heading">
          <div className={styles.sectionHeader}>
            <div className={styles.headerTitleGroup}>
              <i className={`fa-solid fa-calendar-days ${styles.sectionIcon}`} aria-hidden="true"></i>
              <h2 id="upcoming-sessions-heading" className={styles.sectionTitle}>
                Upcoming Sessions
              </h2>
              <span className={styles.countBadge} title="Scheduled & in-progress sessions">
                {stats.upcomingSessionsCount ?? upcomingSessions.length}
              </span>
            </div>
            <Link
              to={`/admin/${normDivision}/sessions`}
              className={styles.sectionActionLink}
              title="Navigate to Session Monitoring Dashboard"
            >
              <span>View all sessions</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>

          <div className={styles.sectionBody}>
            {upcomingSessions.length > 0 ? (
              <div className={styles.sessionsList}>
                {upcomingSessions.map((session) => (
                  <div key={session.sessionId || session._id} className={styles.sessionCard}>
                    <div className={styles.sessionTopRow}>
                      <div className={styles.sessionTopicWrap}>
                        <span className={styles.sessionNumTag}>
                          Session #{session.sessionNumber}
                        </span>
                        <span className={styles.sessionTopic}>{session.topic}</span>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>

                    <div className={styles.sessionMetaRow}>
                      <span className={styles.metaItem}>
                        <i className="fa-solid fa-calendar" aria-hidden="true"></i>
                        <span>{formatSessionDate(session.date, session.startTime)}</span>
                      </span>
                      <span className={styles.metaItem}>
                        <i className="fa-solid fa-chalkboard-user" aria-hidden="true"></i>
                        <span>{session.instructorName}</span>
                      </span>
                      <span className={styles.metaItem}>
                        <i
                          className={`fa-solid ${
                            session.deliveryMode === 'ONLINE' ? 'fa-video' : 'fa-location-dot'
                          }`}
                          aria-hidden="true"
                        ></i>
                        <span>{session.deliveryMode} · {session.location}</span>
                      </span>
                    </div>

                    <div className={styles.sessionFooterRow}>
                      <span className={styles.cohortTag}>
                        <i className="fa-solid fa-graduation-cap me-1 text-muted" aria-hidden="true"></i>
                        <span>{session.cohortNumber} · {session.programTitle}</span>
                      </span>
                      <Link
                        to={`/admin/${normDivision}/sessions`}
                        className={styles.sessionDetailsLink}
                        title="Monitor live academic session"
                      >
                        <span>Monitor Session</span>
                        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyStateContainer}>
                <EmptyState
                  icon="fa-calendar-days"
                  title="No sessions currently scheduled"
                  description="There are no upcoming scheduled sessions in this division. Sessions will appear here once scheduled for active cohorts."
                />
                <Link
                  to={`/admin/${normDivision}/cohorts`}
                  className={styles.emptyStateLink}
                  title="Manage training cohorts"
                >
                  <i className="fa-solid fa-people-group me-1" aria-hidden="true"></i>
                  <span>Manage Cohorts & Scheduling</span>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Recent Administrative Activity */}
        <section className={styles.sectionCard} aria-labelledby="recent-activity-heading">
          <div className={styles.sectionHeader}>
            <div className={styles.headerTitleGroup}>
              <i className={`fa-solid fa-clock-rotate-left ${styles.sectionIcon}`} aria-hidden="true"></i>
              <h2 id="recent-activity-heading" className={styles.sectionTitle}>
                Recent Activity
              </h2>
            </div>
            <Link
              to={`/admin/${normDivision}/audit-logs`}
              className={styles.sectionActionLink}
              title="Navigate to Security Audit Logs"
            >
              <span>View full audit log</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>

          <div className={styles.sectionBody}>
            {recentActivity.length > 0 ? (
              <div className={styles.activityList}>
                {recentActivity.map((activity) => (
                  <div key={activity._id} className={styles.activityItem}>
                    <div className={styles.activityIconWrap} aria-hidden="true">
                      <i className={`fa-solid ${getActionIcon(activity.action)}`}></i>
                    </div>

                    <div className={styles.activityContent}>
                      <div className={styles.activityHeader}>
                        <span className={styles.activityActionLabel}>
                          {activity.actionLabel || activity.action}
                        </span>
                        <span className={styles.activityTime} title={new Date(activity.timestamp).toLocaleString()}>
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                      </div>

                      <div className={styles.activityActorRow}>
                        <span className={styles.actorName}>
                          {activity.actor?.fullName || 'System Admin'}
                        </span>
                        {activity.actor?.role && (
                          <span className={styles.actorRoleBadge}>
                            {activity.actor.role.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      {activity.reason && (
                        <div className={styles.activityReason} title={activity.reason}>
                          {activity.reason}
                        </div>
                      )}
                    </div>

                    {activity.link && (
                      <Link
                        to={activity.link}
                        className={styles.activityActionLink}
                        title="View affected operational entity"
                      >
                        <span>View</span>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyStateContainer}>
                <EmptyState
                  icon="fa-clock-rotate-left"
                  title="No recent activity recorded"
                  description="No administrative actions have been logged for this division yet. Activity entries will appear as admins perform operations."
                />
                <Link
                  to={`/admin/${normDivision}/audit-logs`}
                  className={styles.emptyStateLink}
                  title="Inspect audit log repository"
                >
                  <i className="fa-solid fa-shield-halved me-1" aria-hidden="true"></i>
                  <span>Inspect Security Audit Logs</span>
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Secondary Operational Summary: Application Pipeline & Recent Applications */}
      <div className={styles.secondaryGrid}>
        {/* Left Box: Application Pipeline Breakdown */}
        <section className={styles.sectionCard} aria-labelledby="pipeline-breakdown-heading">
          <div className={styles.sectionHeader}>
            <div className={styles.headerTitleGroup}>
              <i className={`fa-solid fa-bars-progress ${styles.sectionIcon}`} aria-hidden="true"></i>
              <h2 id="pipeline-breakdown-heading" className={styles.sectionTitle}>
                Admissions Pipeline
              </h2>
              <span className={styles.countBadge} title="Total applications in this division">
                {stats.totalApplicationsCount ?? 0} Total
              </span>
            </div>
            <Link
              to={`/admin/${normDivision}/applications`}
              className={styles.sectionActionLink}
              title="Manage student applications"
            >
              <span>Manage Applications</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>

          <div className={styles.sectionBody}>
            <div className={styles.pipelineBreakdown}>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Submitted</span>
                <span className={styles.pipelineCount}>{appBreakdown.SUBMITTED ?? 0}</span>
              </div>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Manual Review</span>
                <span className={styles.pipelineCount}>{appBreakdown.MANUAL_REVIEW ?? 0}</span>
              </div>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Payment Pending</span>
                <span className={styles.pipelineCount}>{appBreakdown.ELIGIBLE_PAYMENT_PENDING ?? 0}</span>
              </div>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Confirmed</span>
                <span className={styles.pipelineCount}>{appBreakdown.CONFIRMED ?? 0}</span>
              </div>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Waitlisted</span>
                <span className={styles.pipelineCount}>{appBreakdown.WAITLISTED ?? 0}</span>
              </div>
              <div className={styles.pipelineCard}>
                <span className={styles.pipelineStatusName}>Cancelled</span>
                <span className={styles.pipelineCount}>{appBreakdown.CANCELLED ?? 0}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Box: Recent Student Applications */}
        <section className={styles.sectionCard} aria-labelledby="recent-applications-heading">
          <div className={styles.sectionHeader}>
            <div className={styles.headerTitleGroup}>
              <i className={`fa-solid fa-user-plus ${styles.sectionIcon}`} aria-hidden="true"></i>
              <h2 id="recent-applications-heading" className={styles.sectionTitle}>
                Recent Applications
              </h2>
            </div>
            <Link
              to={`/admin/${normDivision}/applications`}
              className={styles.sectionActionLink}
              title="Review all student applications"
            >
              <span>View all</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </Link>
          </div>

          <div className={styles.sectionBody}>
            {recentApplications.length > 0 ? (
              <div className={styles.appTableWrap}>
                <table className={styles.appTable}>
                  <thead>
                    <tr>
                      <th scope="col">Applicant</th>
                      <th scope="col">Program</th>
                      <th scope="col">Status</th>
                      <th scope="col">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApplications.map((app) => (
                      <tr key={app._id}>
                        <td>
                          <div className={styles.applicantName}>{app.studentName}</div>
                          {app.studentEmail && (
                            <div className={styles.applicantEmail}>{app.studentEmail}</div>
                          )}
                        </td>
                        <td>
                          <div className={styles.appProgramTitle} title={app.programTitle}>
                            {app.programTitle}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={app.status} />
                        </td>
                        <td title={app.createdAt ? new Date(app.createdAt).toLocaleString() : ''}>
                          {formatRelativeTime(app.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyStateContainer}>
                <EmptyState
                  icon="fa-file-lines"
                  title="No applications submitted yet"
                  description="Student applications will appear here as candidates submit registrations."
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
