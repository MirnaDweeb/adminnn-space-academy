import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import adminService from '../../services/api/adminService';
import programService from '../../services/api/programService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS, ROLE_TO_DIVISION } from '../../constants/divisions';
import { APPLICATION_STATUS, PAYMENT_METHOD } from '../../constants/statuses';
import styles from './ApplicationsPage.module.css';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: APPLICATION_STATUS.SUBMITTED, label: 'Submitted' },
  { value: APPLICATION_STATUS.MANUAL_REVIEW, label: 'Manual Review' },
  { value: APPLICATION_STATUS.NEEDS_INFORMATION, label: 'Needs Information' },
  { value: APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING, label: 'Eligible (Payment Pending)' },
  { value: APPLICATION_STATUS.WAITLISTED, label: 'Waitlisted' },
  { value: APPLICATION_STATUS.CONFIRMED, label: 'Confirmed' },
  { value: APPLICATION_STATUS.CANCELLED, label: 'Cancelled / Rejected' },
];

const DIVISION_FILTER_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: DIVISIONS.PRE_UNIVERSITY, label: 'Pre-University' },
  { value: DIVISIONS.UNIVERSITY, label: 'University' },
];

const DECISION_CONFIG = {
  ACCEPT: {
    decision: 'ACCEPT',
    title: 'Accept Application',
    targetStatus: 'ELIGIBLE_PAYMENT_PENDING',
    confirmText: 'Accept & Grant Eligibility',
    confirmTone: 'success',
    icon: 'fa-check-circle',
    description: 'Accepting this application will transition its status to Eligible (Payment Pending). The applicant will be notified to proceed with payment and enrollment.',
    reasonPrompt: 'Admission notes or criteria justification (optional):',
  },
  WAITLIST: {
    decision: 'WAITLIST',
    title: 'Waitlist Application',
    targetStatus: 'WAITLISTED',
    confirmText: 'Place on Waitlist',
    confirmTone: 'warning',
    icon: 'fa-clock',
    description: 'Placing this applicant on the waitlist will transition status to Waitlisted. They may be admitted later if capacity becomes available.',
    reasonPrompt: 'Waitlist rationale or cohort priority (optional):',
  },
  REQUEST_INFO: {
    decision: 'REQUEST_INFO',
    title: 'Request More Information',
    targetStatus: 'NEEDS_INFORMATION',
    confirmText: 'Request Information',
    confirmTone: 'warning',
    icon: 'fa-circle-question',
    description: 'Transition status to Needs Information. The applicant will be requested to submit additional documentation or clarifications before an admission decision is finalized.',
    reasonPrompt: 'Specify the missing information or required documents (required):',
  },
  REJECT: {
    decision: 'REJECT',
    title: 'Reject Application',
    targetStatus: 'CANCELLED',
    confirmText: 'Reject Application',
    confirmTone: 'danger',
    icon: 'fa-ban',
    description: 'Warning: Rejecting this application transitions it to Cancelled status. Per Academy business rules, rejected applications are terminal for this workflow.',
    reasonPrompt: 'Reason for rejection (recorded in audit trail):',
  },
};

export default function ApplicationsPage() {
  const { division: routeDivision } = useParams();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const currentDivision = routeDivision || ROLE_TO_DIVISION[user?.role];

  const [applications, setApplications] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState(isSuperAdmin ? routeDivision || '' : currentDivision);
  const [page, setPage] = useState(1);

  // Available programs for filter
  const [availablePrograms, setAvailablePrograms] = useState([]);

  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailApp, setDetailApp] = useState(null);
  const [detailAuditLogs, setDetailAuditLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Review Note State
  const [noteInput, setNoteInput] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState('');

  // Decision Modal State
  const [confirmDecision, setConfirmDecision] = useState(null); // DECISION_CONFIG entry
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  // Readiness Assessment State
  const [readinessData, setReadinessData] = useState(null);
  const [readinessHistory, setReadinessHistory] = useState([]);
  const [showReadinessConfirm, setShowReadinessConfirm] = useState(false);
  const [readinessEvaluating, setReadinessEvaluating] = useState(false);
  const [readinessError, setReadinessError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Enrollment State (Phase 9)
  const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollSuccessMessage, setEnrollSuccessMessage] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // Invoice & Payment State (Phase 10)
  const [detailEnrollment, setDetailEnrollment] = useState(null);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [showAppInvoiceModal, setShowAppInvoiceModal] = useState(false);
  const [appInvoiceDueHours, setAppInvoiceDueHours] = useState(72);
  const [appInvoiceNotes, setAppInvoiceNotes] = useState('');
  const [appInvoiceLoading, setAppInvoiceLoading] = useState(false);
  const [appInvoiceError, setAppInvoiceError] = useState('');

  const [showAppPaymentModal, setShowAppPaymentModal] = useState(false);
  const [appPaymentAmount, setAppPaymentAmount] = useState('');
  const [appPaymentMethod, setAppPaymentMethod] = useState('BANK_TRANSFER');
  const [appPaymentReference, setAppPaymentReference] = useState('');
  const [appPaymentNotes, setAppPaymentNotes] = useState('');
  const [appPaymentLoading, setAppPaymentLoading] = useState(false);
  const [appPaymentError, setAppPaymentError] = useState('');

  // Fetch available programs for dropdown
  useEffect(() => {
    let isMounted = true;
    async function loadPrograms() {
      try {
        const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
        const params = { limit: 100 };
        if (activeDivision && activeDivision !== 'all') {
          params.division = activeDivision;
        }
        const res = await programService.list(params);
        if (isMounted) {
          setAvailablePrograms(res.data?.programs || []);
        }
      } catch (err) {
        console.error('Failed to load filter programs:', err);
      }
    }
    loadPrograms();
    return () => {
      isMounted = false;
    };
  }, [currentDivision, divisionFilter, isSuperAdmin]);

  // Fetch Applications
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (programFilter) params.program = programFilter;

      const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
      if (activeDivision && activeDivision !== 'all') {
        params.division = activeDivision;
      }

      const res = await adminService.listApplications(activeDivision, params);
      setApplications(res.data?.applications || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [currentDivision, divisionFilter, isSuperAdmin, page, programFilter, search, statusFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Open Detail Modal
  const handleOpenDetail = async (appId) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setNoteInput('');
    setNoteError('');
    setReadinessData(null);
    setReadinessHistory([]);
    setReadinessError('');
    setShowHistory(false);
    setEnrollSuccessMessage('');
    setEnrollError('');
    try {
      const data = await adminService.getApplication(appId);
      setDetailApp(data.application);
      setDetailAuditLogs(data.auditLogs || []);
      setDetailEnrollment(data.enrollment || null);
      setDetailInvoice(data.invoice || null);
      if (data.latestReadiness) {
        setReadinessData(data.latestReadiness);
      }
      try {
        const histRes = await adminService.getReadinessHistory(appId);
        setReadinessHistory(histRes.history || []);
        if (histRes.latest) {
          setReadinessData(histRes.latest);
        }
      } catch (hErr) {
        console.warn('Could not load readiness history:', hErr.message);
      }
    } catch (err) {
      setDetailError(err.message || 'Failed to load application details');
    } finally {
      setDetailLoading(false);
    }
  };

  // Run or Re-run Readiness Evaluation
  const handleExecuteReadinessEvaluation = async () => {
    if (!detailApp) return;
    setReadinessEvaluating(true);
    setReadinessError('');
    try {
      const res = await adminService.evaluateReadiness(detailApp._id);
      setReadinessData(res.readinessResult);
      setDetailApp((prev) => ({
        ...prev,
        ...res.application,
        eligibilityStatus: res.readinessResult.outcome,
        status: res.application.status,
      }));

      // Refresh readiness history and audit trail
      const histRes = await adminService.getReadinessHistory(detailApp._id);
      setReadinessHistory(histRes.history || []);

      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailAuditLogs(refreshed.auditLogs || []);

      setShowReadinessConfirm(false);
      fetchApplications();
    } catch (err) {
      setReadinessError(err.message || 'Failed to evaluate readiness');
    } finally {
      setReadinessEvaluating(false);
    }
  };

  // Enroll Student (Phase 9)
  const handleExecuteEnroll = async () => {
    if (!detailApp) return;
    setEnrollLoading(true);
    setEnrollError('');
    setEnrollSuccessMessage('');
    try {
      const res = await adminService.enrollApplication(detailApp._id);
      const isWaitlisted = res.enrollment?.status === 'WAITLISTED';
      const msg = isWaitlisted
        ? `Program capacity reached (${res.capacity?.occupied}/${res.capacity?.capacity}). Student successfully placed on waiting list (Waitlist count: ${res.capacity?.waitlisted}).`
        : `Seat successfully reserved! Enrollment status: ${res.enrollment?.status} (${res.capacity?.occupied}/${res.capacity?.capacity} occupied).`;
      setEnrollSuccessMessage(msg);
      setShowEnrollConfirm(false);

      // Re-fetch application details and audit logs
      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailApp(refreshed.application);
      setDetailAuditLogs(refreshed.auditLogs || []);
      setDetailEnrollment(refreshed.enrollment || null);
      setDetailInvoice(refreshed.invoice || null);
      fetchApplications();
    } catch (err) {
      setEnrollError(err.message || 'Failed to enroll student');
    } finally {
      setEnrollLoading(false);
    }
  };

  // Phase 10: Generate Invoice for Detail Enrollment
  const handleAppGenerateInvoice = async () => {
    if (!detailEnrollment) return;
    setAppInvoiceLoading(true);
    setAppInvoiceError('');
    try {
      const res = await adminService.generateInvoice(detailEnrollment._id, {
        dueAtHours: Number(appInvoiceDueHours) || 72,
        notes: appInvoiceNotes.trim(),
      });
      setDetailInvoice(res.invoice);
      setShowAppInvoiceModal(false);
      setAppInvoiceNotes('');
      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailAuditLogs(refreshed.auditLogs || []);
    } catch (err) {
      setAppInvoiceError(err.message || 'Failed to generate invoice');
    } finally {
      setAppInvoiceLoading(false);
    }
  };

  // Phase 10: Record Payment for Detail Invoice
  const handleAppRecordPayment = async (e) => {
    e.preventDefault();
    if (!detailInvoice) return;
    const amt = Number(appPaymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setAppPaymentError('Payment amount must be greater than zero');
      return;
    }
    setAppPaymentLoading(true);
    setAppPaymentError('');
    try {
      const res = await adminService.recordPayment(detailInvoice._id, {
        amount: amt,
        method: appPaymentMethod,
        reference: appPaymentReference.trim(),
        notes: appPaymentNotes.trim(),
      });
      setDetailInvoice(res.invoice);
      if (res.enrollment) {
        setDetailEnrollment(res.enrollment);
      }
      setShowAppPaymentModal(false);
      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailApp(refreshed.application);
      setDetailAuditLogs(refreshed.auditLogs || []);
      fetchApplications();
    } catch (err) {
      setAppPaymentError(err.message || 'Failed to record payment');
    } finally {
      setAppPaymentLoading(false);
    }
  };

  // Add Review Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteInput.trim() || !detailApp) return;

    setNoteSubmitting(true);
    setNoteError('');
    try {
      const res = await adminService.addApplicationNote(detailApp._id, noteInput.trim());
      setDetailApp((prev) => ({
        ...prev,
        reviewNotes: res.reviewNotes || [...(prev.reviewNotes || []), res.note],
      }));
      setNoteInput('');

      // Refresh audit logs in detail
      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailAuditLogs(refreshed.auditLogs || []);
    } catch (err) {
      setNoteError(err.message || 'Failed to add review note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  // Trigger Decision Confirmation
  const handleInitiateDecision = (decisionKey) => {
    const config = DECISION_CONFIG[decisionKey];
    if (!config) return;
    setConfirmDecision(config);
    setDecisionReason('');
    setDecisionError('');
  };

  // Confirm Decision Execution
  const handleExecuteDecision = async () => {
    if (!confirmDecision || !detailApp) return;

    if (confirmDecision.decision === 'REQUEST_INFO' && !decisionReason.trim()) {
      setDecisionError('Please specify the requested information or documents');
      return;
    }

    setDecisionLoading(true);
    setDecisionError('');
    try {
      const res = await adminService.updateApplicationDecision(
        detailApp._id,
        confirmDecision.decision,
        decisionReason.trim()
      );

      // Update detail application state
      setDetailApp(res.application);

      // Re-fetch detail to get updated audit trail and populated records
      const refreshed = await adminService.getApplication(detailApp._id);
      setDetailApp(refreshed.application);
      setDetailAuditLogs(refreshed.auditLogs || []);

      // Close decision confirm modal
      setConfirmDecision(null);
      setDecisionReason('');

      // Refresh applications table in background
      fetchApplications();
    } catch (err) {
      setDecisionError(err.message || 'Failed to record decision');
    } finally {
      setDecisionLoading(false);
    }
  };

  // KPI Calculations
  const totalCount = meta?.total ?? applications.length;
  const pendingCount = applications.filter((a) =>
    ['SUBMITTED', 'MANUAL_REVIEW', 'NEEDS_INFORMATION'].includes(a.status)
  ).length;
  const eligibleCount = applications.filter((a) =>
    ['ELIGIBLE_PAYMENT_PENDING', 'CONFIRMED'].includes(a.status)
  ).length;
  const waitlistOrCancelledCount = applications.filter((a) =>
    ['WAITLISTED', 'CANCELLED'].includes(a.status)
  ).length;

  // Filter configuration for FilterBar
  const filterList = [
    {
      name: 'status',
      value: statusFilter,
      onChange: (val) => {
        setStatusFilter(val);
        setPage(1);
      },
      options: STATUS_FILTER_OPTIONS,
    },
    {
      name: 'program',
      value: programFilter,
      onChange: (val) => {
        setProgramFilter(val);
        setPage(1);
      },
      options: [
        { value: '', label: 'All Programs' },
        ...availablePrograms.map((p) => ({ value: p._id || p.id, label: p.title })),
      ],
    },
  ];

  if (isSuperAdmin) {
    filterList.unshift({
      name: 'division',
      value: divisionFilter,
      onChange: (val) => {
        setDivisionFilter(val);
        setProgramFilter('');
        setPage(1);
      },
      options: DIVISION_FILTER_OPTIONS,
    });
  }

  // Check if detail application is in a decided / terminal state
  const isDecidedOrTerminal =
    detailApp &&
    ['ELIGIBLE_PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(
      detailApp.status
    );

  // Table Columns
  const columns = [
    {
      key: 'applicant',
      label: 'Applicant',
      render: (row) => {
        const student = row.student;
        const name = student?.fullName || 'Unknown Student';
        const email = student?.email || '—';
        const initials = name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <div className={styles.applicantCell}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.applicantName}>{name}</div>
              <div className={styles.applicantEmail}>{email}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'program',
      label: 'Program',
      render: (row) => (
        <div>
          <div className={styles.programTitle}>{row.program?.title || 'Unknown Program'}</div>
          <div className={styles.programDivision}>
            {DIVISION_LABELS[row.program?.division || row.division] || row.division}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'decision',
      label: 'Decision',
      render: (row) => {
        if (!row.decision) {
          return <span className={styles.pendingBadge}>PENDING REVIEW</span>;
        }
        return (
          <span
            className={`badge ${
              row.decision === 'ACCEPT'
                ? 'bg-success'
                : row.decision === 'REJECT'
                ? 'bg-danger'
                : 'bg-warning text-dark'
            }`}
            style={{ fontSize: '0.75rem' }}
          >
            {row.decision}
          </span>
        );
      },
    },
    {
      key: 'submittedAt',
      label: 'Submitted Date',
      render: (row) => {
        const date = row.submittedAt || row.createdAt;
        return date ? new Date(date).toLocaleDateString() : '—';
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionBtns}>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleOpenDetail(row._id || row.id)}
            aria-label={`Review application for ${row.student?.fullName || 'student'}`}
          >
            <i className="fa-solid fa-file-lines me-1" aria-hidden="true"></i> Review
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={
          isSuperAdmin
            ? 'All Academy Applications'
            : `${DIVISION_LABELS[currentDivision] || currentDivision} Applications`
        }
        subtitle="Review student submissions, inspect academic credentials, record review notes, and make admission decisions."
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
            <i className="fa-solid fa-folder-open" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Total Applications</div>
            <div className={styles.summaryVal}>{totalCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconWarning}`}>
            <i className="fa-solid fa-hourglass-half" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Pending Review</div>
            <div className={styles.summaryVal}>{pendingCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconSuccess}`}>
            <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Eligible / Confirmed</div>
            <div className={styles.summaryVal}>{eligibleCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconDanger}`}>
            <i className="fa-solid fa-box-archive" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Waitlisted / Cancelled</div>
            <div className={styles.summaryVal}>{waitlistOrCancelledCount}</div>
          </div>
        </div>
      </div>

      {/* CONTROLS BAR: SEARCH & FILTERS */}
      <div className={styles.controlsBar}>
        <div className={styles.searchWrap}>
          <SearchBar
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search by student name or email..."
          />
        </div>

        <div className={styles.filterGroup}>
          <FilterBar filters={filterList} />
        </div>
      </div>

      {/* ERROR / LOADING / TABLE */}
      {error && (
        <ErrorState
          title="Failed to Load Applications"
          message={error}
          onRetry={fetchApplications}
        />
      )}

      {loading && !error && (
        <LoadingState message="Loading applications and applicant profiles..." />
      )}

      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={applications}
          emptyTitle="No applications found matching the selected division and filters."
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

      {/* APPLICATION DETAIL & REVIEW MODAL */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={
          detailApp
            ? `Application Review: ${detailApp.student?.fullName || 'Applicant'}`
            : 'Application Review'
        }
        size="lg"
      >
        {detailLoading ? (
          <LoadingState message="Retrieving full applicant profile, program specs, and audit trail..." />
        ) : detailError ? (
          <ErrorState message={detailError} onRetry={() => handleOpenDetail(detailApp?._id)} />
        ) : detailApp ? (
          <div>
            {/* DECISION ACTION BAR (IF NOT DECIDED/TERMINAL) */}
            <div className={styles.decisionActionBar}>
              <div className={styles.decisionBarTitle}>
                <i className="fa-solid fa-gavel me-1" aria-hidden="true"></i> Admission Decision Workflow
              </div>
              {!isDecidedOrTerminal ? (
                <div className="d-flex flex-wrap gap-2 w-100">
                  <button
                    type="button"
                    className="btn btn-success btn-sm d-flex align-items-center gap-1"
                    onClick={() => handleInitiateDecision('ACCEPT')}
                    id="btn-decision-accept"
                  >
                    <i className="fa-solid fa-check" aria-hidden="true"></i> Accept Application
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm d-flex align-items-center gap-1"
                    onClick={() => handleInitiateDecision('WAITLIST')}
                    id="btn-decision-waitlist"
                  >
                    <i className="fa-solid fa-clock" aria-hidden="true"></i> Waitlist
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-warning btn-sm d-flex align-items-center gap-1"
                    onClick={() => handleInitiateDecision('REQUEST_INFO')}
                    id="btn-decision-request-info"
                  >
                    <i className="fa-solid fa-circle-question" aria-hidden="true"></i> Request More Info
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm d-flex align-items-center gap-1 ms-auto"
                    onClick={() => handleInitiateDecision('REJECT')}
                    id="btn-decision-reject"
                  >
                    <i className="fa-solid fa-ban" aria-hidden="true"></i> Reject Application
                  </button>
                </div>
              ) : (
                <div
                  className="alert alert-secondary py-2 px-3 mb-0 w-100 d-flex align-items-center gap-2"
                  style={{ fontSize: '0.85rem' }}
                >
                  <i className="fa-solid fa-lock" aria-hidden="true"></i>
                  <span>
                    This application has reached a decided or terminal state (
                    <strong>{detailApp.status}</strong>). Subsequent transitions or decision actions
                    cannot be executed.
                  </span>
                </div>
              )}
            </div>

            {/* ENROLLMENT ACTION BAR (PHASE 9) */}
            {detailApp.status === 'ELIGIBLE_PAYMENT_PENDING' && (
              <div
                className="alert alert-success d-flex flex-column flex-md-row align-items-md-center justify-content-between p-3 mb-3 w-100 border border-success shadow-sm"
                style={{ borderRadius: '8px' }}
              >
                <div>
                  <div className="fw-bold text-success d-flex align-items-center gap-2">
                    <i className="fa-solid fa-user-check"></i>
                    <span>Application Accepted — Eligible for Enrollment</span>
                  </div>
                  <div className="text-secondary small mt-1">
                    This candidate has been officially accepted. Enrolling will reserve a seat if capacity is available ({detailApp.program?.capacity || 25} max capacity), or place them on the waiting list if full.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-success btn-sm d-flex align-items-center gap-2 mt-2 mt-md-0 shadow-sm px-3 py-2 fw-semibold"
                  onClick={() => {
                    setEnrollError('');
                    setEnrollSuccessMessage('');
                    setShowEnrollConfirm(true);
                  }}
                  disabled={enrollLoading}
                  id="btn-enroll-student"
                >
                  <i className="fa-solid fa-user-plus" aria-hidden="true"></i>
                  <span>Enroll Student</span>
                </button>
              </div>
            )}

            {enrollSuccessMessage && (
              <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
                <i className="fa-solid fa-circle-check text-success fa-lg" aria-hidden="true"></i>
                <span>{enrollSuccessMessage}</span>
              </div>
            )}

            {enrollError && (
              <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
                <i className="fa-solid fa-circle-exclamation text-danger fa-lg" aria-hidden="true"></i>
                <span>{enrollError}</span>
              </div>
            )}

            {/* APPLICANT & SUBMISSION OVERVIEW */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-user-astronaut me-1" aria-hidden="true"></i> Applicant Information
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Applicant Name:</span>
                <span className={styles.detailValue}>
                  {detailApp.student?.fullName || 'Unknown Student'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Email Address:</span>
                <span className={styles.detailValue}>{detailApp.student?.email || '—'}</span>
              </div>
              {detailApp.student?.phone && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Phone Number:</span>
                  <span className={styles.detailValue}>{detailApp.student.phone}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Application Status:</span>
                <span className={styles.detailValue}>
                  <StatusBadge status={detailApp.status} />
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Submitted At:</span>
                <span className={styles.detailValue}>
                  {detailApp.submittedAt || detailApp.createdAt
                    ? new Date(detailApp.submittedAt || detailApp.createdAt).toLocaleString()
                    : '—'}
                </span>
              </div>
              {detailApp.decision && (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Decision Made:</span>
                    <span className={styles.detailValue}>
                      <span className="badge bg-primary me-2">{detailApp.decision}</span>
                      {detailApp.decisionReason && <em>"{detailApp.decisionReason}"</em>}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Reviewed By:</span>
                    <span className={styles.detailValue}>
                      {detailApp.reviewedBy?.fullName || 'Academy Reviewer'} (
                      {detailApp.reviewedBy?.email || '—'})
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Reviewed At:</span>
                    <span className={styles.detailValue}>
                      {detailApp.reviewedAt ? new Date(detailApp.reviewedAt).toLocaleString() : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* PROGRAM SPECIFICATIONS */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-graduation-cap me-1" aria-hidden="true"></i> Program Details
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Program Title:</span>
                <span className={styles.detailValue}>{detailApp.program?.title || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Division:</span>
                <span className={styles.detailValue}>
                  {DIVISION_LABELS[detailApp.program?.division || detailApp.division] ||
                    detailApp.division}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Level & Mode:</span>
                <span className={styles.detailValue}>
                  {detailApp.program?.level || 'Beginner'} /{' '}
                  {detailApp.program?.deliveryMode || 'Onsite'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Capacity:</span>
                <span className={styles.detailValue}>
                  {detailApp.program?.capacity ?? 25} Students
                </span>
              </div>
              {detailApp.program?.description && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Description:</span>
                  <span className={styles.detailValue} style={{ fontWeight: 400 }}>
                    {detailApp.program.description}
                  </span>
                </div>
              )}
            </div>

            {/* ENROLLMENT & BILLING DETAILS (PHASE 10) */}
            {detailEnrollment && (
              <div className={styles.detailSection}>
                <div className={styles.detailTitle}>
                  <i className="fa-solid fa-file-invoice-dollar me-1" aria-hidden="true"></i> Enrollment & Billing Status
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Enrollment Status:</span>
                  <span className={styles.detailValue}>
                    <StatusBadge status={detailEnrollment.status} />
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Enrolled Date:</span>
                  <span className={styles.detailValue}>
                    {detailEnrollment.enrolledAt ? new Date(detailEnrollment.enrolledAt).toLocaleString() : '—'}
                  </span>
                </div>

                {detailInvoice ? (
                  <>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Invoice Number:</span>
                      <span className={styles.detailValue} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {detailInvoice.invoiceNumber}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Invoice Amount:</span>
                      <span className={styles.detailValue} style={{ fontWeight: 700, color: 'var(--esa-cosmos-blue, #3A6985)' }}>
                        {Number(detailInvoice.amount).toLocaleString()} {detailInvoice.currency || 'EGP'}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Invoice Status:</span>
                      <span className={styles.detailValue}>
                        <StatusBadge status={detailInvoice.status} />
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Payment Deadline:</span>
                      <span className={styles.detailValue}>
                        {detailInvoice.dueAt ? new Date(detailInvoice.dueAt).toLocaleString() : '—'}
                      </span>
                    </div>
                    {detailInvoice.status === 'PENDING' && (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="btn btn-success btn-sm d-flex align-items-center gap-1"
                          onClick={() => {
                            setAppPaymentAmount(detailInvoice.amount);
                            setAppPaymentReference('');
                            setAppPaymentNotes('');
                            setAppPaymentError('');
                            setShowAppPaymentModal(true);
                          }}
                          id="btn-app-record-payment"
                        >
                          <i className="fa-solid fa-credit-card me-1" aria-hidden="true"></i> Record Payment
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  detailEnrollment.status === 'PENDING_PAYMENT' && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                        onClick={() => {
                          setAppInvoiceError('');
                          setAppInvoiceNotes('');
                          setAppInvoiceDueHours(72);
                          setShowAppInvoiceModal(true);
                        }}
                        id="btn-app-generate-invoice"
                      >
                        <i className="fa-solid fa-file-invoice me-1" aria-hidden="true"></i> Generate Invoice
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {/* READINESS ASSESSMENT & COURSE RECOMMENDATION */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-microchip me-1" aria-hidden="true"></i> AI Readiness Assessment & Recommendation
              </div>

              {readinessError && (
                <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-solid fa-circle-exclamation me-1" aria-hidden="true"></i> {readinessError}
                </div>
              )}

              <div className={styles.readinessContainer}>
                {/* STATUS & OUTCOME BANNER */}
                <div
                  className={`${styles.readinessBanner} ${
                    readinessData?.outcome === 'ELIGIBLE'
                      ? styles.readinessBannerEligible
                      : readinessData?.outcome === 'FOUNDATION_RECOMMENDED'
                      ? styles.readinessBannerFoundation
                      : readinessData?.outcome === 'MANUAL_REVIEW'
                      ? styles.readinessBannerManual
                      : styles.readinessBannerPending
                  }`}
                >
                  <div>
                    <div className={styles.readinessOutcomeTitle}>
                      {readinessData?.outcome === 'ELIGIBLE' ? (
                        <>
                          <i className="fa-solid fa-circle-check fa-lg text-success" aria-hidden="true"></i>
                          <span>Readiness Outcome: ELIGIBLE</span>
                        </>
                      ) : readinessData?.outcome === 'FOUNDATION_RECOMMENDED' ? (
                        <>
                          <i className="fa-solid fa-compass fa-lg text-warning" aria-hidden="true"></i>
                          <span>Readiness Outcome: FOUNDATION RECOMMENDED</span>
                        </>
                      ) : readinessData?.outcome === 'MANUAL_REVIEW' ? (
                        <>
                          <i className="fa-solid fa-user-clock fa-lg text-primary" aria-hidden="true"></i>
                          <span>Readiness Outcome: MANUAL REVIEW REQUIRED</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-hourglass-start fa-lg text-secondary" aria-hidden="true"></i>
                          <span>Readiness Outcome: NOT EVALUATED</span>
                        </>
                      )}

                      {readinessData?.score != null && (
                        <span className={styles.readinessScorePill}>
                          <i className="fa-solid fa-chart-simple" aria-hidden="true"></i>
                          Score: {readinessData.score}%
                        </span>
                      )}
                    </div>

                    <div className={styles.readinessMetaRow}>
                      {readinessData ? (
                        <>
                          <span>
                            <i className="fa-solid fa-calendar-day me-1" aria-hidden="true"></i>
                            Evaluated: {new Date(readinessData.evaluatedAt || readinessData.createdAt).toLocaleDateString()}
                          </span>
                          <span>
                            <i className="fa-solid fa-user-shield me-1" aria-hidden="true"></i>
                            Evaluator: {readinessData.evaluatedBy?.fullName || 'System'} ({readinessData.evaluatorRole || 'ADMIN'})
                          </span>
                        </>
                      ) : (
                        <span>
                          <i className="fa-solid fa-info-circle me-1" aria-hidden="true"></i>
                          Run deterministic readiness evaluation to assess academic preparation and course prerequisites.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ACTION BUTTON */}
                  <div>
                    {isDecidedOrTerminal ? (
                      <span className="badge bg-secondary py-2 px-3 d-flex align-items-center gap-1" title="Terminal state locked">
                        <i className="fa-solid fa-lock" aria-hidden="true"></i> Decision Locked ({detailApp.status})
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`btn btn-sm ${readinessData ? 'btn-outline-primary' : 'btn-primary'} d-flex align-items-center gap-1`}
                        onClick={() => {
                          setReadinessError('');
                          setShowReadinessConfirm(true);
                        }}
                        disabled={readinessEvaluating}
                        id="btn-run-readiness"
                      >
                        <i className={`fa-solid ${readinessData ? 'fa-rotate' : 'fa-play'} me-1`} aria-hidden="true"></i>
                        {readinessData ? 'Re-run Assessment' : 'Run Assessment'}
                      </button>
                    )}
                  </div>
                </div>

                {/* CRITERIA BREAKDOWN */}
                {readinessData?.criteriaEvaluated && readinessData.criteriaEvaluated.length > 0 && (
                  <div>
                    <h6 className="fw-bold mb-2" style={{ fontSize: '0.85rem', color: '#334155' }}>
                      <i className="fa-solid fa-list-check me-1" aria-hidden="true"></i> Criteria Breakdown & Prerequisite Verification
                    </h6>
                    <div className={styles.criteriaGrid}>
                      {readinessData.criteriaEvaluated.map((crit, idx) => (
                        <div
                          key={idx}
                          className={`${styles.criterionCard} ${crit.met ? styles.criterionCardMet : styles.criterionCardNotMet}`}
                        >
                          <div className={styles.criterionHeader}>
                            <span className={styles.criterionName}>{crit.criterion}</span>
                            <span className={`badge ${crit.met ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: '0.7rem' }}>
                              {crit.met ? 'MET' : 'NOT MET'}
                            </span>
                          </div>
                          <div className={styles.criterionNotes}>{crit.notes}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SPECIAL FOUNDATION GAP ALERT */}
                {readinessData?.outcome === 'FOUNDATION_RECOMMENDED' && (
                  <div className={styles.gapAlert}>
                    <i className="fa-solid fa-triangle-exclamation mt-1" aria-hidden="true"></i>
                    <div>
                      <strong>Identified Academic Preparation Gaps:</strong>
                      <p className="mb-0 mt-1" style={{ fontSize: '0.82rem' }}>
                        Applicant demonstrates verified division alignment but requires preparatory coursework to bridge foundational STEM concepts and laboratory skills before attempting this program level.
                      </p>
                    </div>
                  </div>
                )}

                {/* SPECIAL MANUAL REVIEW ALERT */}
                {readinessData?.outcome === 'MANUAL_REVIEW' && (
                  <div className="alert alert-info py-2 px-3 mb-0 d-flex align-items-start gap-2" style={{ fontSize: '0.84rem' }}>
                    <i className="fa-solid fa-circle-info mt-1" aria-hidden="true"></i>
                    <div>
                      <strong>Human Review Required:</strong> Automated clearance could not be safely finalized due to unverified profile credentials or institutional tier alignment. This application must be reviewed manually by an admissions administrator.
                    </div>
                  </div>
                )}

                {/* EXPLAINABLE COURSE RECOMMENDATION */}
                <div className={styles.recommendationCard}>
                  <div className={styles.recommendationTitle}>
                    <i className="fa-solid fa-compass me-1" aria-hidden="true"></i> Explainable Course Recommendation
                  </div>
                  <div className={styles.recommendationBody}>
                    {readinessData?.recommendationReason ||
                      'Run readiness assessment to generate an explainable, deterministic course recommendation based on verified applicant background and program criteria.'}
                  </div>
                </div>

                {/* READINESS HISTORY */}
                {readinessHistory.length > 0 && (
                  <div className="mt-1">
                    <button
                      type="button"
                      className={styles.historyToggleBtn}
                      onClick={() => setShowHistory(!showHistory)}
                      id="btn-toggle-readiness-history"
                    >
                      <i className={`fa-solid ${showHistory ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true"></i>
                      <span>Readiness Evaluation History ({readinessHistory.length} record{readinessHistory.length > 1 ? 's' : ''})</span>
                    </button>

                    {showHistory && (
                      <div className={styles.historyTimeline}>
                        {readinessHistory.map((hist, hIdx) => (
                          <div key={hist._id || hIdx} className={styles.historyItem}>
                            <div className={styles.historyItemHeader}>
                              <div className="d-flex align-items-center gap-2">
                                <span
                                  className={`badge ${
                                    hist.outcome === 'ELIGIBLE'
                                      ? 'bg-success'
                                      : hist.outcome === 'FOUNDATION_RECOMMENDED'
                                      ? 'bg-warning text-dark'
                                      : 'bg-info text-dark'
                                  }`}
                                  style={{ fontSize: '0.72rem' }}
                                >
                                  {hist.outcome}
                                </span>
                                <span className="fw-semibold">Score: {hist.score != null ? `${hist.score}%` : '—'}</span>
                              </div>
                              <span className="text-secondary" style={{ fontSize: '0.72rem' }}>
                                {new Date(hist.evaluatedAt || hist.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                              Evaluated by: {hist.evaluatedBy?.fullName || 'Admin'} ({hist.evaluatorRole || 'ADMIN'})
                              {' • '}
                              Criteria Met: {hist.criteriaEvaluated?.filter((c) => c.met).length || 0}/
                              {hist.criteriaEvaluated?.length || 0}
                            </div>
                            {hist.recommendationReason && (
                              <div className="text-muted mt-1" style={{ fontSize: '0.72rem', fontStyle: 'italic' }}>
                                {hist.recommendationReason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* REVIEW NOTES (APPEND-ONLY) */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-clipboard-list me-1" aria-hidden="true"></i> Review Notes (
                {detailApp.reviewNotes?.length || 0})
              </div>

              {detailApp.reviewNotes && detailApp.reviewNotes.length > 0 ? (
                <div className={styles.notesList}>
                  {detailApp.reviewNotes.map((note, index) => (
                    <div key={note._id || index} className={styles.noteCard}>
                      <div className={styles.noteHeader}>
                        <span className={styles.noteAuthor}>
                          <i className="fa-solid fa-user-pen me-1" aria-hidden="true"></i>
                          {note.authorName || note.author?.fullName || 'Reviewer'} (
                          {note.authorRole || note.author?.role || 'Admin'})
                        </span>
                        <span className={styles.noteTime}>
                          {note.timestamp ? new Date(note.timestamp).toLocaleString() : 'Just now'}
                        </span>
                      </div>
                      <div className={styles.noteText}>{note.note}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-secondary mb-3" style={{ fontSize: '0.85rem' }}>
                  No review notes recorded yet for this applicant.
                </div>
              )}

              {/* ADD REVIEW NOTE FORM */}
              <form onSubmit={handleAddNote} className="mt-3">
                {noteError && (
                  <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: '0.82rem' }}>
                    {noteError}
                  </div>
                )}
                <div className={styles.addNoteBox}>
                  <textarea
                    className={`form-control form-control-sm ${styles.addNoteInput}`}
                    rows={2}
                    placeholder="Add an internal review note, candidate evaluation, or academic assessment..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    disabled={noteSubmitting}
                    id="input-review-note"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={noteSubmitting || !noteInput.trim()}
                    id="btn-add-note"
                  >
                    {noteSubmitting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-1"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Adding...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-plus me-1" aria-hidden="true"></i> Add Note
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* AUDIT TRAIL */}
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-clock-rotate-left me-1" aria-hidden="true"></i> Audit Trail (
                {detailAuditLogs.length})
              </div>
              {detailAuditLogs.length > 0 ? (
                <div className="table-responsive">
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Timestamp</th>
                        <th>Division</th>
                        <th>Details / Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailAuditLogs.map((log) => (
                        <tr key={log.id || log._id}>
                          <td>
                            <span className="badge bg-light text-dark border">{log.action}</span>
                          </td>
                          <td>{log.user?.fullName || log.actor?.fullName || 'System'}</td>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.division || '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--esa-text-secondary)' }}>
                            {log.reason || (log.after ? JSON.stringify(log.after) : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-secondary p-2 text-center" style={{ fontSize: '0.85rem' }}>
                  No historical audit entries found for this application.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* CONFIRM DECISION MODAL */}
      {confirmDecision && (
        <ConfirmModal
          isOpen={!!confirmDecision}
          onClose={() => !decisionLoading && setConfirmDecision(null)}
          onConfirm={handleExecuteDecision}
          title={confirmDecision.title}
          message={
            <div>
              <p className="mb-2">{confirmDecision.description}</p>
              <div className="mb-2">
                <strong>Target Status: </strong>
                <span className="badge bg-secondary">{confirmDecision.targetStatus}</span>
              </div>
              <div className="mt-3">
                <label
                  htmlFor="decision-reason-input"
                  className="form-label fw-bold"
                  style={{ fontSize: '0.85rem' }}
                >
                  {confirmDecision.reasonPrompt}
                </label>
                <textarea
                  id="decision-reason-input"
                  className="form-control form-control-sm"
                  rows={2}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder="Enter decision rationale..."
                  disabled={decisionLoading}
                />
              </div>
              {decisionError && (
                <div className="alert alert-danger py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  {decisionError}
                </div>
              )}
            </div>
          }
          confirmText={confirmDecision.confirmText}
          confirmTone={confirmDecision.confirmTone}
          loading={decisionLoading}
          icon={confirmDecision.icon}
        />
      )}

      {/* CONFIRM READINESS ASSESSMENT MODAL */}
      {showReadinessConfirm && (
        <ConfirmModal
          isOpen={showReadinessConfirm}
          onClose={() => !readinessEvaluating && setShowReadinessConfirm(false)}
          onConfirm={handleExecuteReadinessEvaluation}
          title={readinessData ? 'Re-run Readiness Assessment' : 'Run Readiness Assessment'}
          message={
            <div>
              <p className="mb-2">
                Evaluate applicant's academic profile and prerequisites against program requirements using deterministic Academy criteria.
              </p>
              <div
                className="alert alert-secondary py-2 px-3 mb-0"
                style={{ fontSize: '0.82rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}
              >
                <i className="fa-solid fa-circle-info me-1 text-primary"></i>
                Every evaluation generates a new historical <strong>ReadinessResult</strong> entry and records an audit log (<code>READINESS_EVALUATED</code>). Existing admission decisions remain protected.
              </div>
              {readinessError && (
                <div className="alert alert-danger py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  {readinessError}
                </div>
              )}
            </div>
          }
          confirmText={readinessData ? 'Re-run Assessment' : 'Run Assessment'}
          confirmTone="primary"
          loading={readinessEvaluating}
          icon="fa-microchip"
        />
      )}

      {/* CONFIRM ENROLLMENT MODAL (PHASE 9) */}
      {showEnrollConfirm && (
        <ConfirmModal
          isOpen={showEnrollConfirm}
          onClose={() => !enrollLoading && setShowEnrollConfirm(false)}
          onConfirm={handleExecuteEnroll}
          title="Confirm Student Enrollment"
          message={
            <div>
              <p className="mb-2">
                This action will reserve a seat for <strong>{detailApp.student?.fullName || 'the student'}</strong> in <strong>{detailApp.program?.title}</strong> if capacity is available.
              </p>
              <div
                className="alert alert-info py-2 px-3 mb-0"
                style={{ fontSize: '0.82rem' }}
              >
                <i className="fa-solid fa-circle-info me-1"></i>
                This action will reserve a seat if capacity is available. If capacity has reached maximum, the applicant will be placed on the FIFO waiting list.
              </div>
              {enrollError && (
                <div className="alert alert-danger py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  {enrollError}
                </div>
              )}
            </div>
          }
          confirmText="Confirm & Enroll"
          confirmTone="success"
          loading={enrollLoading}
          icon="fa-user-plus"
        />
      )}

      {/* GENERATE INVOICE MODAL (PHASE 10) */}
      {showAppInvoiceModal && (
        <Modal
          isOpen={showAppInvoiceModal}
          onClose={() => !appInvoiceLoading && setShowAppInvoiceModal(false)}
          title={`Generate Invoice for ${detailApp?.student?.fullName || 'Student'}`}
          size="md"
        >
          <div>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-circle-info me-1"></i>
              Generates an administrative invoice for this pending enrollment. Program price is locked from the official curriculum (<strong>{detailApp?.program?.price || 0} EGP</strong>).
            </div>

            {appInvoiceError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.82rem' }}>
                {appInvoiceError}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Program & Pricing
              </label>
              <div className="p-2 rounded bg-light border fw-semibold">
                {detailApp?.program?.title} — {Number(detailApp?.program?.price || 0).toLocaleString()} EGP
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="app-invoice-due-hours" className="form-label small fw-semibold">
                Payment Deadline Window (Hours) *
              </label>
              <input
                type="number"
                id="app-invoice-due-hours"
                className="form-control form-control-sm"
                value={appInvoiceDueHours}
                onChange={(e) => setAppInvoiceDueHours(e.target.value)}
                min="1"
                max="720"
                disabled={appInvoiceLoading}
              />
              <div className="form-text small">
                Default: 72 hours. Unpaid invoices past deadline are subject to the automated release sweep.
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="app-invoice-notes" className="form-label small fw-semibold">
                Invoice Notes
              </label>
              <textarea
                id="app-invoice-notes"
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional billing remarks..."
                value={appInvoiceNotes}
                onChange={(e) => setAppInvoiceNotes(e.target.value)}
                disabled={appInvoiceLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAppInvoiceModal(false)}
                disabled={appInvoiceLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                onClick={handleAppGenerateInvoice}
                disabled={appInvoiceLoading}
                id="btn-confirm-app-generate-invoice"
              >
                {appInvoiceLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-file-invoice me-1" aria-hidden="true"></i> Generate Invoice
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* RECORD PAYMENT MODAL (PHASE 10) */}
      {showAppPaymentModal && (
        <Modal
          isOpen={showAppPaymentModal}
          onClose={() => !appPaymentLoading && setShowAppPaymentModal(false)}
          title={`Record Payment — Invoice ${detailInvoice?.invoiceNumber}`}
          size="md"
        >
          <form onSubmit={handleAppRecordPayment}>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-circle-info me-1"></i>
              Recording payment will create an immutable transaction record against this invoice. Settling the full amount (<strong>{detailInvoice?.amount} EGP</strong>) will mark the invoice <strong>PAID</strong> and confirm the student's enrollment.
            </div>

            {appPaymentError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.82rem' }}>
                {appPaymentError}
              </div>
            )}

            <div className="mb-3">
              <label htmlFor="app-payment-amount" className="form-label small fw-semibold">
                Payment Amount (EGP) *
              </label>
              <input
                type="number"
                id="app-payment-amount"
                className="form-control form-control-sm"
                value={appPaymentAmount}
                onChange={(e) => setAppPaymentAmount(e.target.value)}
                min="1"
                step="any"
                required
                disabled={appPaymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="app-payment-method" className="form-label small fw-semibold">
                Payment Method *
              </label>
              <select
                id="app-payment-method"
                className="form-select form-select-sm"
                value={appPaymentMethod}
                onChange={(e) => setAppPaymentMethod(e.target.value)}
                disabled={appPaymentLoading}
              >
                <option value={PAYMENT_METHOD.BANK_TRANSFER}>Bank Transfer</option>
                <option value={PAYMENT_METHOD.CASH}>Cash (Receipt)</option>
                <option value={PAYMENT_METHOD.CARD}>Credit/Debit Card (POS)</option>
                <option value={PAYMENT_METHOD.OTHER}>Other / Sponsor</option>
              </select>
            </div>

            <div className="mb-3">
              <label htmlFor="app-payment-ref" className="form-label small fw-semibold">
                Transaction Reference / Receipt #
              </label>
              <input
                type="text"
                id="app-payment-ref"
                className="form-control form-control-sm"
                placeholder="e.g. TRF-10294, Cash Receipt #502"
                value={appPaymentReference}
                onChange={(e) => setAppPaymentReference(e.target.value)}
                disabled={appPaymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="app-payment-notes" className="form-label small fw-semibold">
                Notes
              </label>
              <textarea
                id="app-payment-notes"
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional teller notes..."
                value={appPaymentNotes}
                onChange={(e) => setAppPaymentNotes(e.target.value)}
                disabled={appPaymentLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAppPaymentModal(false)}
                disabled={appPaymentLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success btn-sm d-flex align-items-center gap-1"
                disabled={appPaymentLoading}
                id="btn-confirm-app-record-payment"
              >
                {appPaymentLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Recording...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check me-1" aria-hidden="true"></i> Confirm Payment
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
