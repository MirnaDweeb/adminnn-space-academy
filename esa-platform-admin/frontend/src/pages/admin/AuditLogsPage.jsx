import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import FilterBar from '../../components/common/FilterBar';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS, ROLE_TO_DIVISION } from '../../constants/divisions';
import styles from './AuditLogsPage.module.css';

const RESOURCE_OPTIONS = [
  { value: '', label: 'All Resources' },
  { value: 'User', label: 'User / Identity' },
  { value: 'Course', label: 'Course / Program' },
  { value: 'Application', label: 'Application' },
];

const DIVISION_FILTER_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: DIVISIONS.PRE_UNIVERSITY, label: 'Pre-University' },
  { value: DIVISIONS.UNIVERSITY, label: 'University' },
];

function getActionTone(action = '') {
  if (action.includes('DECISION') || action.includes('ACTIVATED') || action.includes('CONFIRMED')) {
    return styles.actionSuccess;
  }
  if (action.includes('DEACTIVATED') || action.includes('REJECT') || action.includes('CANCEL')) {
    return styles.actionDanger;
  }
  if (action.includes('STATUS') || action.includes('UPDATE') || action.includes('NOTE') || action.includes('WAITLIST')) {
    return styles.actionWarning;
  }
  return styles.actionInfo;
}

export default function AuditLogsPage() {
  const { division: routeDivision } = useParams();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const currentDivision = routeDivision || ROLE_TO_DIVISION[user?.role];

  const [auditLogs, setAuditLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState(isSuperAdmin ? routeDivision || '' : currentDivision);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Available filter options fetched from backend
  const [availableActions, setAvailableActions] = useState([]);
  const [availableResources, setAvailableResources] = useState([]);

  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Load distinct filter options on mount / division change
  useEffect(() => {
    let isMounted = true;
    async function loadFilterOptions() {
      try {
        const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
        const res = await adminService.getAuditLogFilters(activeDivision);
        if (isMounted) {
          if (res?.actions) setAvailableActions(res.actions);
          if (res?.resources) setAvailableResources(res.resources);
        }
      } catch (err) {
        console.error('Failed to load audit log filter options:', err);
      }
    }
    loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, [currentDivision, divisionFilter, isSuperAdmin]);

  // Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 15 };
      if (search.trim()) params.search = search.trim();
      if (actionFilter) params.action = actionFilter;
      if (resourceFilter) params.resource = resourceFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
      if (activeDivision && activeDivision !== 'all') {
        params.division = activeDivision;
      }

      const res = await adminService.listAuditLogs(activeDivision, params);
      setAuditLogs(res.data?.auditLogs || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, currentDivision, dateFrom, dateTo, divisionFilter, isSuperAdmin, page, resourceFilter, search]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Open Detail Modal
  const handleOpenDetail = async (logId) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    try {
      const data = await adminService.getAuditLog(logId);
      setDetailLog(data.auditLog);
    } catch (err) {
      setDetailError(err.message || 'Failed to retrieve audit log detail');
    } finally {
      setDetailLoading(false);
    }
  };

  // Clear date filters
  const handleClearDates = () => {
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // KPI calculations
  const totalCount = meta?.total ?? auditLogs.length;
  const securityCount = auditLogs.filter((l) => l.action?.startsWith('ADMIN_') || l.action?.startsWith('USER_')).length;
  const programCount = auditLogs.filter((l) => l.action?.startsWith('PROGRAM_')).length;
  const applicationCount = auditLogs.filter((l) => l.action?.startsWith('APPLICATION_')).length;

  // Build FilterBar list
  const actionOptions = [
    { value: '', label: 'All Action Types' },
    ...availableActions.map((act) => ({
      value: act,
      label: act.replace(/_/g, ' '),
    })),
  ];

  const resourceOptions = [
    { value: '', label: 'All Resources' },
    ...availableResources.map((res) => ({
      value: res,
      label: res,
    })),
  ];

  const filterList = [
    {
      name: 'action',
      value: actionFilter,
      onChange: (val) => {
        setActionFilter(val);
        setPage(1);
      },
      options: actionOptions.length > 1 ? actionOptions : [{ value: '', label: 'All Action Types' }],
    },
    {
      name: 'resource',
      value: resourceFilter,
      onChange: (val) => {
        setResourceFilter(val);
        setPage(1);
      },
      options: resourceOptions.length > 1 ? resourceOptions : RESOURCE_OPTIONS,
    },
  ];

  if (isSuperAdmin) {
    filterList.unshift({
      name: 'division',
      value: divisionFilter,
      onChange: (val) => {
        setDivisionFilter(val);
        setPage(1);
      },
      options: DIVISION_FILTER_OPTIONS,
    });
  }

  // Render before/after structured comparison
  const renderFieldDiffs = (before, after) => {
    if (!before && !after) {
      return (
        <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
          No field mutations recorded for this event.
        </div>
      );
    }

    if (!before && after) {
      return (
        <div>
          <div className="text-success fw-bold mb-2" style={{ fontSize: '0.82rem' }}>
            <i className="fa-solid fa-plus-circle me-1" aria-hidden="true"></i> Initial State Created:
          </div>
          <pre className={styles.codeBlock}>{JSON.stringify(after, null, 2)}</pre>
        </div>
      );
    }

    const allKeys = Array.from(
      new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    ).filter((k) => !['_id', '__v', 'updatedAt', 'createdAt'].includes(k));

    const changedKeys = allKeys.filter(
      (k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])
    );

    if (changedKeys.length === 0) {
      return (
        <div className={styles.diffContainer}>
          <div className={styles.diffBox}>
            <div className={`${styles.diffHeader} ${styles.headerBefore}`}>
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> State Before
            </div>
            <pre className={styles.codeBlock}>{JSON.stringify(before, null, 2)}</pre>
          </div>
          <div className={styles.diffBox}>
            <div className={`${styles.diffHeader} ${styles.headerAfter}`}>
              <i className="fa-solid fa-check-circle" aria-hidden="true"></i> State After
            </div>
            <pre className={styles.codeBlock}>{JSON.stringify(after, null, 2)}</pre>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="fw-bold mb-2" style={{ fontSize: '0.85rem', color: '#334155' }}>
          <i className="fa-solid fa-code-compare me-1" aria-hidden="true"></i> Changed Properties ({changedKeys.length}):
        </div>
        <div className={styles.fieldDiffList}>
          {changedKeys.map((key) => (
            <div key={key} className={styles.fieldDiffRow}>
              <span className={styles.fieldDiffName}>{key}:</span>
              <div className={styles.fieldDiffValues}>
                <span className={styles.diffValOld}>{JSON.stringify(before?.[key] ?? '—')}</span>
                <i className="fa-solid fa-arrow-right text-secondary" style={{ fontSize: '0.7rem' }} aria-hidden="true"></i>
                <span className={styles.diffValNew}>{JSON.stringify(after?.[key] ?? '—')}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.diffContainer}>
          <div className={styles.diffBox}>
            <div className={`${styles.diffHeader} ${styles.headerBefore}`}>
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Full Before Payload
            </div>
            <pre className={styles.codeBlock}>{JSON.stringify(before, null, 2)}</pre>
          </div>
          <div className={styles.diffBox}>
            <div className={`${styles.diffHeader} ${styles.headerAfter}`}>
              <i className="fa-solid fa-check-circle" aria-hidden="true"></i> Full After Payload
            </div>
            <pre className={styles.codeBlock}>{JSON.stringify(after, null, 2)}</pre>
          </div>
        </div>
      </div>
    );
  };

  // Table Columns
  const columns = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (row) => {
        const d = new Date(row.timestamp);
        return (
          <div style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
            <div className="fw-bold text-dark">{d.toLocaleDateString()}</div>
            <div className="text-secondary">{d.toLocaleTimeString()}</div>
          </div>
        );
      },
    },
    {
      key: 'actor',
      label: 'Actor',
      render: (row) => {
        const actor = row.user;
        const name = actor?.fullName || 'System / Automated';
        const email = actor?.email || '—';
        const initials = name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <div className={styles.actorCell}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.actorName}>{name}</div>
              <div className={styles.actorMeta}>
                <span>{email}</span>
                {actor?.role && (
                  <span className="badge bg-light text-secondary border" style={{ fontSize: '0.65rem' }}>
                    {actor.role}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'action',
      label: 'Action',
      render: (row) => (
        <span className={`${styles.actionBadge} ${getActionTone(row.action)}`}>
          {row.action}
        </span>
      ),
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (row) => (
        <div>
          <span className={styles.resourceBadge}>{row.resource}</span>
          {row.resourceId && (
            <div className="text-secondary" style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {row.resourceId.slice(-6)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Division',
      render: (row) => {
        if (!row.division) {
          return <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.72rem' }}>GLOBAL</span>;
        }
        return (
          <span
            className={`badge ${
              row.division === DIVISIONS.PRE_UNIVERSITY
                ? 'bg-primary-subtle text-primary border border-primary-subtle'
                : 'bg-info-subtle text-info border border-info-subtle'
            }`}
            style={{ fontSize: '0.72rem' }}
          >
            {DIVISION_LABELS[row.division] || row.division}
          </span>
        );
      },
    },
    {
      key: 'reason',
      label: 'Reason / Details',
      render: (row) => (
        <div className={styles.reasonCell} title={row.reason || JSON.stringify(row.after || '')}>
          {row.reason || (row.after ? JSON.stringify(row.after) : '—')}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Details',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => handleOpenDetail(row._id || row.id)}
          aria-label={`View audit detail for ${row.action}`}
        >
          <i className="fa-solid fa-eye me-1" aria-hidden="true"></i> View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={
          isSuperAdmin
            ? 'All Academy Audit Logs'
            : `${DIVISION_LABELS[currentDivision] || currentDivision} Audit Logs`
        }
        subtitle="Immutable, append-only system audit trail and compliance history. All actions across divisions are permanently tracked."
        badge={
          isSuperAdmin
            ? 'SUPER ADMIN AUDIT'
            : `${DIVISION_LABELS[currentDivision] || currentDivision} SCOPED`
        }
      />

      {/* KPI METRIC CARDS */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconNavy}`}>
            <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Total Audit Records</div>
            <div className={styles.summaryVal}>{totalCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconWarning}`}>
            <i className="fa-solid fa-user-lock" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Security & Admin Events</div>
            <div className={styles.summaryVal}>{securityCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconInfo}`}>
            <i className="fa-solid fa-graduation-cap" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Program & Course Events</div>
            <div className={styles.summaryVal}>{programCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconSuccess}`}>
            <i className="fa-solid fa-file-signature" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Application Decisions</div>
            <div className={styles.summaryVal}>{applicationCount}</div>
          </div>
        </div>
      </div>

      {/* CONTROLS BAR: SEARCH, FILTERS, DATE RANGE */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsRowTop}>
          <div className={styles.searchWrap}>
            <SearchBar
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search by actor name, email, action, reason..."
            />
          </div>

          <div className={styles.filterGroup}>
            <FilterBar filters={filterList} />
          </div>
        </div>

        {/* DATE RANGE FILTER ROW */}
        <div className={styles.dateFilterRow}>
          <div className={styles.dateField}>
            <i className="fa-regular fa-calendar" aria-hidden="true"></i>
            <span>From:</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Filter from date"
            />
          </div>

          <div className={styles.dateField}>
            <span>To:</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="Filter to date"
            />
          </div>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm ms-auto"
              style={{ fontSize: '0.78rem' }}
              onClick={handleClearDates}
            >
              <i className="fa-solid fa-xmark me-1" aria-hidden="true"></i> Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* ERROR / LOADING / DATA TABLE */}
      {error && (
        <ErrorState
          title="Failed to Load Audit Logs"
          message={error}
          onRetry={fetchAuditLogs}
        />
      )}

      {loading && !error && (
        <LoadingState message="Retrieving immutable audit history and state diffs..." />
      )}

      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={auditLogs}
          emptyTitle="No audit log records found matching the specified filters."
          pagination={
            meta && meta.totalPages > 1
              ? {
                  page: meta.page,
                  totalPages: meta.totalPages,
                  total: meta.total,
                  onPageChange: (p) => setPage(p),
                }
              : null
          }
        />
      )}

      {/* AUDIT LOG DETAIL & DIFF MODAL */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={
          detailLog
            ? `Audit Record: ${detailLog.action}`
            : 'Audit Record Details'
        }
        size="lg"
      >
        {detailLoading ? (
          <LoadingState message="Loading full state mutation payload..." />
        ) : detailError ? (
          <ErrorState message={detailError} onRetry={() => handleOpenDetail(detailLog?._id)} />
        ) : detailLog ? (
          <div>
            {/* RECORD METADATA SECTION */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-circle-info me-1" aria-hidden="true"></i> Event Overview
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Action:</span>
                <span className={styles.detailValue}>
                  <span className={`${styles.actionBadge} ${getActionTone(detailLog.action)}`}>
                    {detailLog.action}
                  </span>
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Actor:</span>
                <span className={styles.detailValue}>
                  {detailLog.user?.fullName || 'System'} ({detailLog.user?.email || '—'}) &middot;{' '}
                  <span className="badge bg-secondary-subtle text-secondary">
                    {detailLog.user?.role || 'SYSTEM'}
                  </span>
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Timestamp:</span>
                <span className={styles.detailValue}>
                  {new Date(detailLog.timestamp).toLocaleString()} ({detailLog.timestamp})
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Resource:</span>
                <span className={styles.detailValue}>
                  <span className={styles.resourceBadge}>{detailLog.resource}</span>
                  {detailLog.resourceId && (
                    <span className="ms-2 font-monospace text-secondary" style={{ fontSize: '0.82rem' }}>
                      ID: {detailLog.resourceId}
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Division:</span>
                <span className={styles.detailValue}>
                  {DIVISION_LABELS[detailLog.division] || detailLog.division || 'GLOBAL (Cross-Division)'}
                </span>
              </div>
              {detailLog.reason && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Reason / Context:</span>
                  <span className={styles.detailValue} style={{ fontWeight: 400 }}>
                    {detailLog.reason}
                  </span>
                </div>
              )}
            </div>

            {/* STATE MUTATION (BEFORE VS AFTER DIFF) */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-code-branch me-1" aria-hidden="true"></i> State Mutation Payload (Before & After)
              </div>
              {renderFieldDiffs(detailLog.before, detailLog.after)}
            </div>

            {/* IMMUTABLE RECORD NOTICE */}
            <div
              className="alert alert-secondary py-2 px-3 mb-0 d-flex align-items-center gap-2"
              style={{ fontSize: '0.82rem' }}
            >
              <i className="fa-solid fa-lock" aria-hidden="true"></i>
              <span>
                <strong>Read-Only Compliance Record:</strong> This entry is permanently sealed in the
                Academy append-only audit store. No administrative role can modify or delete audit entries.
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
