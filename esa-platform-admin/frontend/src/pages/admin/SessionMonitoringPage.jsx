import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISION_LABELS } from '../../constants/divisions';
import { SESSION_STATUS } from '../../constants/statuses';
import styles from './SessionMonitoringPage.module.css';

export default function SessionMonitoringPage() {
  const { user } = useAuth();
  const params = useParams();
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  // Active division from URL or state
  const routeDivision = params.division;
  const [selectedDivision, setSelectedDivision] = useState(routeDivision || 'all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deliveryModeFilter, setDeliveryModeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  // Data & loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sessionData, setSessionData] = useState({
    sessions: [],
    stats: { total: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 },
    pagination: { total: 0, page: 1, limit: 50, pages: 1 },
  });

  // Selected session for details modal
  const [activeSession, setActiveSession] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideLocation, setOverrideLocation] = useState('');
  const [overrideMeetingUrl, setOverrideMeetingUrl] = useState('');
  const [actionMessage, setActionMessage] = useState(null);

  const timerRef = useRef(null);

  const fetchSessions = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true);
        else setRefreshing(true);
        setError(null);

        const divisionParam = routeDivision || (selectedDivision !== 'all' ? selectedDivision : null);
        const queryParams = {
          search: searchTerm || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          deliveryMode: deliveryModeFilter !== 'ALL' ? deliveryModeFilter : undefined,
          limit: 100,
        };

        const result = await adminService.listSessions(divisionParam, queryParams);
        setSessionData(result || { sessions: [], stats: {}, pagination: {} });
        setLastRefreshedAt(new Date());
      } catch (err) {
        console.error('Failed to load session monitoring data:', err);
        setError(err.response?.data?.message || err.message || 'Unable to retrieve live session records.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [routeDivision, selectedDivision, statusFilter, deliveryModeFilter, searchTerm]
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Set up 10-second polling interval for live session status tracking
  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(() => {
      fetchSessions(true);
    }, 10000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchSessions]);

  const handleOpenDetails = (session) => {
    setActiveSession(session);
    setOverrideStatus(session.status);
    setOverrideLocation(session.location || '');
    setOverrideMeetingUrl(session.meetingUrl || '');
    setActionMessage(null);
  };

  const handleSaveSessionOverride = async (e) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      setIsUpdatingStatus(true);
      setActionMessage(null);
      await adminService.updateSessionStatus(activeSession.cohortId, activeSession._id, {
        status: overrideStatus,
        location: overrideLocation,
        meetingUrl: overrideMeetingUrl,
      });
      setActionMessage({ type: 'success', text: 'Session status updated successfully.' });
      setTimeout(() => {
        setActiveSession(null);
        fetchSessions(true);
      }, 700);
    } catch (err) {
      console.error('Failed to update session:', err);
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update session status.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const columns = [
    {
      header: 'Session',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--esa-navy-950, #09111f)' }}>
            {row.status === 'IN_PROGRESS' && <span className={styles.runningPulse} title="Live Now" />}
            {row.title}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--esa-text-secondary, #667085)', marginTop: '2px' }}>
            Cohort: <span style={{ fontWeight: 500 }}>{row.cohortName || `Cohort #${row.cohortNumber}`}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--esa-text-muted, #8a94a6)' }}>
            {row.programTitle}
          </div>
        </div>
      ),
    },
    {
      header: 'Division',
      render: (row) => (
        <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>
          {DIVISION_LABELS[row.division] || row.division}
        </span>
      ),
    },
    {
      header: 'Instructor',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: '0.86rem' }}>
            {row.instructor?.fullName || 'Not Assigned'}
          </div>
          {row.instructor?.title && (
            <div style={{ fontSize: '0.76rem', color: 'var(--esa-text-secondary, #667085)' }}>
              {row.instructor.title}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Delivery & Venue',
      render: (row) => {
        const isOnline = row.deliveryMode === 'ONLINE';
        return (
          <div>
            <span
              className={`${styles.deliveryBadge} ${
                isOnline ? styles.onlineBadge : styles.offlineBadge
              }`}
            >
              <i className={`fa-solid ${isOnline ? 'fa-video' : 'fa-building-columns'}`} />
              {row.deliveryMode || 'OFFLINE'}
            </span>
            {isOnline && row.meetingUrl ? (
              <div style={{ marginTop: '4px' }}>
                <a
                  href={row.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--esa-cosmos-blue, #3a6985)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                  Join Room
                </a>
              </div>
            ) : row.location ? (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
                <i className="fa-solid fa-location-dot me-1" />
                {row.location}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      header: 'Timeline & Duration',
      render: (row) => {
        const scheduledDate = row.date ? new Date(row.date).toLocaleDateString() : 'TBD';
        const durationText = row.actualDurationMinutes
          ? `${row.actualDurationMinutes} mins`
          : row.durationMinutes
          ? `${row.durationMinutes} mins (sched)`
          : '—';

        return (
          <div style={{ fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 500 }}>
              <i className="fa-regular fa-calendar me-1" />
              {scheduledDate}
            </div>
            <div style={{ color: 'var(--esa-text-secondary, #667085)', marginTop: '2px' }}>
              {row.startTime ? `${row.startTime} - ${row.endTime || 'end'}` : 'Time unscheduled'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
              Duration: <span style={{ fontWeight: 600 }}>{durationText}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Attendance',
      render: (row) => {
        if (!row.attendance) return <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>—</span>;
        const { presentCount = 0, totalStudents = 0, attendanceRate = 0 } = row.attendance;
        return (
          <div style={{ fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--esa-navy-800, #12223d)' }}>
              {presentCount} / {totalStudents} ({attendanceRate}%)
            </div>
            <div
              style={{
                width: '60px',
                height: '4px',
                background: '#e2e8f0',
                borderRadius: '2px',
                marginTop: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, attendanceRate)}%`,
                  height: '100%',
                  background: attendanceRate > 75 ? 'var(--esa-success, #1c7c4d)' : 'var(--esa-warning, #a3660c)',
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Status',
      render: (row) => <StatusBadge status={row.status || SESSION_STATUS.SCHEDULED} />,
    },
    {
      header: 'Actions',
      render: (row) => (
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => handleOpenDetails(row)}
          title="Inspect session logs & override status"
        >
          <i className="fa-solid fa-sliders me-1" />
          Manage
        </button>
      ),
    },
  ];

  const stats = sessionData.stats || {};

  return (
    <div className={styles.container}>
      <PageHeader
        title="Live Session Monitoring"
        subtitle="Real-time academy session operational dashboard, tracking instructor transitions, attendance, and delivery mode."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label className={styles.autoRefreshToggle} title="Poll backend every 10 seconds">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-Refresh (10s)
            </label>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => fetchSessions(false)}
              disabled={refreshing}
            >
              <i
                className={`fa-solid fa-arrows-rotate ${refreshing ? 'fa-spin' : ''}`}
                aria-hidden="true"
              />
              {refreshing ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        }
      />

      {/* Operational Summary Cards */}
      <div className={styles.statsGrid}>
        <StatCard
          icon="fa-tower-broadcast"
          title="In Progress"
          value={stats.inProgress || 0}
          subtitle="Currently live sessions"
          tone={stats.inProgress > 0 ? 'success' : 'default'}
        />
        <StatCard
          icon="fa-calendar-day"
          title="Scheduled"
          value={stats.scheduled || 0}
          subtitle="Upcoming academic sessions"
          tone="info"
        />
        <StatCard
          icon="fa-circle-check"
          title="Completed"
          value={stats.completed || 0}
          subtitle="Concluded training periods"
          tone="default"
        />
        <StatCard
          icon="fa-layer-group"
          title="Total Monitored"
          value={stats.total || 0}
          subtitle={`Updated: ${lastRefreshedAt.toLocaleTimeString()}`}
          tone="default"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <SearchBar
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by session title, cohort, instructor, or room..."
          />
        </div>

        <div className={styles.filterControls}>
          {isSuperAdmin && !routeDivision && (
            <select
              className={styles.selectInput}
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
            >
              <option value="all">All Divisions</option>
              <option value="PRE_UNIVERSITY">Pre-University Division</option>
              <option value="UNIVERSITY">University Division</option>
            </select>
          )}

          <select
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_PROGRESS">In Progress (Live)</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            className={styles.selectInput}
            value={deliveryModeFilter}
            onChange={(e) => setDeliveryModeFilter(e.target.value)}
          >
            <option value="ALL">All Delivery Modes</option>
            <option value="ONLINE">Online (Virtual)</option>
            <option value="OFFLINE">Offline (On-Premises)</option>
          </select>
        </div>
      </div>

      {/* Main Sessions Data Table */}
      {loading ? (
        <LoadingState message="Loading academy session monitoring stream..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchSessions(false)} />
      ) : sessionData.sessions.length === 0 ? (
        <EmptyState
          icon="fa-tower-broadcast"
          title="No Sessions Found"
          message="No active or scheduled sessions match your current filter criteria."
        />
      ) : (
        <DataTable
          columns={columns}
          data={sessionData.sessions}
          keyField="_id"
        />
      )}

      {/* Session Details & Administration Override Modal */}
      {activeSession && (
        <Modal
          title={`Session Details — ${activeSession.title}`}
          isOpen={Boolean(activeSession)}
          onClose={() => setActiveSession(null)}
        >
          <form onSubmit={handleSaveSessionOverride} className={styles.modalContent}>
            {actionMessage && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  backgroundColor:
                    actionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                  color:
                    actionMessage.type === 'success' ? '#166534' : '#991b1b',
                }}
              >
                {actionMessage.text}
              </div>
            )}

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Program:</span>
              <span className={styles.detailValue}>{activeSession.programTitle}</span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Cohort:</span>
              <span className={styles.detailValue}>
                {activeSession.cohortName || `Cohort #${activeSession.cohortNumber}`}
              </span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Instructor:</span>
              <span className={styles.detailValue}>
                {activeSession.instructor?.fullName || 'Unassigned'}
              </span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Started At:</span>
              <span className={styles.detailValue}>
                {activeSession.startedAt
                  ? new Date(activeSession.startedAt).toLocaleString()
                  : 'Not started yet'}
              </span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Ended At:</span>
              <span className={styles.detailValue}>
                {activeSession.endedAt
                  ? new Date(activeSession.endedAt).toLocaleString()
                  : 'Not ended yet'}
              </span>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                Lifecycle Status Override
              </label>
              <div className={styles.statusRadioGroup}>
                {['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((st) => (
                  <label key={st} className={styles.statusOption}>
                    <input
                      type="radio"
                      name="statusOverride"
                      value={st}
                      checked={overrideStatus === st}
                      onChange={(e) => setOverrideStatus(e.target.value)}
                    />
                    <StatusBadge status={st} />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                Delivery Location / Classroom
              </label>
              <input
                type="text"
                className={styles.selectInput}
                style={{ width: '100%' }}
                value={overrideLocation}
                onChange={(e) => setOverrideLocation(e.target.value)}
                placeholder="e.g. Lab 4B, Space Technology Center"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                Online Meeting URL
              </label>
              <input
                type="url"
                className={styles.selectInput}
                style={{ width: '100%' }}
                value={overrideMeetingUrl}
                onChange={(e) => setOverrideMeetingUrl(e.target.value)}
                placeholder="https://meet.space.gov.eg/room-xyz"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => setActiveSession(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.refreshButton}
                style={{
                  background: 'var(--esa-cosmos-blue, #3a6985)',
                  color: '#ffffff',
                  borderColor: 'var(--esa-cosmos-blue, #3a6985)',
                }}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
