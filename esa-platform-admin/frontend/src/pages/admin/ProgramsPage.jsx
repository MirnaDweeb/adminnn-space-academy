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
import programService from '../../services/api/programService';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS, ROLE_TO_DIVISION } from '../../constants/divisions';
import { PROGRAM_LEVEL, DELIVERY_MODE, PAYMENT_METHOD } from '../../constants/statuses';
import styles from './ProgramsPage.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const DIVISION_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: DIVISIONS.PRE_UNIVERSITY, label: 'Pre-University' },
  { value: DIVISIONS.UNIVERSITY, label: 'University' },
];

const LEVEL_OPTIONS = [
  { value: PROGRAM_LEVEL.BEGINNER, label: 'Beginner' },
  { value: PROGRAM_LEVEL.INTERMEDIATE, label: 'Intermediate' },
  { value: PROGRAM_LEVEL.ADVANCED, label: 'Advanced' },
];

const DELIVERY_OPTIONS = [
  { value: DELIVERY_MODE.ONSITE, label: 'Onsite (Academy Lab)' },
  { value: DELIVERY_MODE.ONLINE, label: 'Online (Virtual Class)' },
  { value: DELIVERY_MODE.HYBRID, label: 'Hybrid (Lab + Online)' },
];

export default function ProgramsPage() {
  const { division: routeDivision } = useParams();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const currentDivision = routeDivision || ROLE_TO_DIVISION[user?.role];

  const [programs, setPrograms] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState(isSuperAdmin ? routeDivision || '' : currentDivision);
  const [page, setPage] = useState(1);

  // Create / Edit Modal State
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    division: currentDivision || DIVISIONS.PRE_UNIVERSITY,
    level: PROGRAM_LEVEL.BEGINNER,
    targetAudience: '',
    price: 0,
    capacity: 25,
    deliveryMode: DELIVERY_MODE.ONSITE,
    category: 'Space Engineering',
    transportationOption: 'NONE',
    registrationStartDate: '',
    registrationEndDate: '',
    startDate: '',
    endDate: '',
    reopeningDate: '',
    prerequisites: '',
    targetMajors: '',
    requiredEducation: '',
  });

  // Delete / Archive Program State
  const [deleteConfirmProgram, setDeleteConfirmProgram] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailProgram, setDetailProgram] = useState(null);
  const [detailAuditLogs, setDetailAuditLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Action Confirm Modal (Publish or Archive)
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'PUBLISH' | 'ARCHIVE', program: ... }
  const [actionLoading, setActionLoading] = useState(false);

  // Phase 9: Program Enrollments & Capacity State
  const [isEnrollmentsOpen, setIsEnrollmentsOpen] = useState(false);
  const [enrollmentProgram, setEnrollmentProgram] = useState(null);
  const [enrollmentsList, setEnrollmentsList] = useState([]);
  const [enrollmentsCapacity, setEnrollmentsCapacity] = useState(null);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentsError, setEnrollmentsError] = useState('');
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState('');

  // Cancellation State
  const [cancellingEnrollment, setCancellingEnrollment] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  const fetchProgramEnrollments = async (progId, status = '') => {
    setEnrollmentsLoading(true);
    setEnrollmentsError('');
    try {
      const params = {};
      if (status) params.status = status;
      const res = await adminService.listProgramEnrollments(progId, params);
      setEnrollmentsList(res.data?.enrollments || []);
      setEnrollmentsCapacity(res.data?.capacity || null);
    } catch (err) {
      setEnrollmentsError(err.message || 'Failed to load enrollments');
    } finally {
      setEnrollmentsLoading(false);
    }
  };

  const handleOpenEnrollments = async (prog) => {
    setEnrollmentProgram(prog);
    setIsEnrollmentsOpen(true);
    setEnrollmentStatusFilter('');
    setCancelSuccess('');
    setCancelError('');
    await fetchProgramEnrollments(prog._id, '');
  };

  const handleCancelEnrollment = async () => {
    if (!cancellingEnrollment) return;
    setCancelLoading(true);
    setCancelError('');
    try {
      const res = await adminService.cancelEnrollment(cancellingEnrollment._id, cancelReason.trim());
      const wasPromoted = Boolean(res.promotedEnrollment);
      const msg = wasPromoted
        ? `Enrollment cancelled. Oldest waitlisted student was automatically promoted to reserved seat!`
        : 'Enrollment successfully cancelled and seat released.';
      setCancelSuccess(msg);
      setCancellingEnrollment(null);
      setCancelReason('');

      // Refresh enrollments list & capacity
      if (enrollmentProgram) {
        await fetchProgramEnrollments(enrollmentProgram._id, enrollmentStatusFilter);
      }
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel enrollment');
    } finally {
      setCancelLoading(false);
    }
  };

  // Phase 10: Invoice & Payment in ProgramsPage
  const [generatingInvoiceEnrollment, setGeneratingInvoiceEnrollment] = useState(null);
  const [invoiceDueHours, setInvoiceDueHours] = useState(72);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceSuccess, setInvoiceSuccess] = useState('');

  const [payingEnrollment, setPayingEnrollment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');

  const handleGenerateInvoice = async () => {
    if (!generatingInvoiceEnrollment) return;
    setInvoiceLoading(true);
    setInvoiceError('');
    try {
      const res = await adminService.generateInvoice(generatingInvoiceEnrollment._id, {
        dueAtHours: Number(invoiceDueHours) || 72,
        notes: invoiceNotes.trim(),
      });
      setInvoiceSuccess(`Invoice ${res.invoice?.invoiceNumber} successfully generated for ${res.invoice?.amount} EGP!`);
      setGeneratingInvoiceEnrollment(null);
      setInvoiceNotes('');
      // Refresh enrollments list
      if (enrollmentProgram) {
        await fetchProgramEnrollments(enrollmentProgram._id, enrollmentStatusFilter);
      }
    } catch (err) {
      setInvoiceError(err.message || 'Failed to generate invoice');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payingEnrollment || !payingEnrollment.invoice) return;
    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Payment amount must be greater than zero');
      return;
    }
    setPaymentLoading(true);
    setPaymentError('');
    try {
      const res = await adminService.recordPayment(payingEnrollment.invoice._id, {
        amount: amt,
        method: paymentMethod,
        reference: paymentReference.trim(),
        notes: paymentNotes.trim(),
      });
      const isConfirmed = res.isFullyPaid;
      setPaymentSuccess(
        isConfirmed
          ? `Payment settled! Enrollment confirmed for ${payingEnrollment.student?.fullName || 'student'}.`
          : `Partial payment of ${amt} EGP recorded.`
      );
      setPayingEnrollment(null);
      // Refresh enrollments list
      if (enrollmentProgram) {
        await fetchProgramEnrollments(enrollmentProgram._id, enrollmentStatusFilter);
      }
    } catch (err) {
      setPaymentError(err.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;

      const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
      if (activeDivision && activeDivision !== 'all') {
        params.division = activeDivision;
      }

      const res = await programService.list(params);
      setPrograms(res.data?.programs || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message || 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, [currentDivision, divisionFilter, isSuperAdmin, page, search, statusFilter]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormData({
      title: '',
      description: '',
      division: (isSuperAdmin ? divisionFilter : currentDivision) || DIVISIONS.PRE_UNIVERSITY,
      level: PROGRAM_LEVEL.BEGINNER,
      targetAudience: '',
      price: 0,
      capacity: 25,
      deliveryMode: DELIVERY_MODE.ONSITE,
      category: 'Space Engineering',
      transportationOption: 'NONE',
      registrationStartDate: '',
      registrationEndDate: '',
      startDate: '',
      endDate: '',
      reopeningDate: '',
      prerequisites: '',
      targetMajors: '',
      requiredEducation: '',
    });
    setEditingProgramId(null);
    setFormError('');
    setModalMode('create');
  };

  // Open Edit Modal
  const handleOpenEdit = (prog) => {
    setFormData({
      title: prog.title || '',
      description: prog.description || '',
      division: prog.division || currentDivision || DIVISIONS.PRE_UNIVERSITY,
      level: prog.level || PROGRAM_LEVEL.BEGINNER,
      targetAudience: prog.targetAudience || '',
      price: prog.price ?? 0,
      capacity: prog.capacity ?? 25,
      deliveryMode: prog.deliveryMode || DELIVERY_MODE.ONSITE,
      category: prog.category || 'Space Engineering',
      transportationOption: prog.transportationOption || 'NONE',
      registrationStartDate: prog.registrationStartDate ? prog.registrationStartDate.split('T')[0] : '',
      registrationEndDate: prog.registrationEndDate ? prog.registrationEndDate.split('T')[0] : '',
      startDate: prog.startDate ? prog.startDate.split('T')[0] : '',
      endDate: prog.endDate ? prog.endDate.split('T')[0] : '',
      reopeningDate: prog.reopeningDate ? prog.reopeningDate.split('T')[0] : '',
      prerequisites: prog.prerequisites || '',
      targetMajors: prog.targetMajors || '',
      requiredEducation: prog.requiredEducation || '',
    });
    setEditingProgramId(prog.id || prog._id);
    setFormError('');
    setModalMode('edit');
  };

  // Safe Delete / Archive Program
  const handleDeleteProgram = async () => {
    if (!deleteConfirmProgram) return;
    setDeleteLoading(true);
    try {
      const res = await adminService.deleteOrArchiveProgram(deleteConfirmProgram.id || deleteConfirmProgram._id);
      setDeleteConfirmProgram(null);
      alert(res.message || 'Program successfully removed or safely archived.');
      fetchPrograms();
    } catch (err) {
      alert(err.message || 'Failed to delete/archive program');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Submit Create or Edit
  const handleFormSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFormError('');

    if (!formData.title.trim() || formData.title.trim().length < 2) {
      setFormError('Program title must be at least 2 characters');
      return;
    }
    const capNum = Number(formData.capacity);
    if (!Number.isInteger(capNum) || capNum <= 0) {
      setFormError('Capacity must be a positive integer greater than 0');
      return;
    }
    const priceNum = Number(formData.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Price must be a non-negative number');
      return;
    }

    setFormLoading(true);
    try {
      if (modalMode === 'create') {
        await programService.create(formData);
      } else {
        await programService.update(editingProgramId, formData);
      }
      setModalMode(null);
      fetchPrograms();
    } catch (err) {
      setFormError(err.message || 'Failed to save program');
    } finally {
      setFormLoading(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetail = async (prog) => {
    setIsDetailOpen(true);
    setDetailProgram(prog);
    setDetailLoading(true);
    try {
      const res = await programService.getById(prog.id || prog._id);
      setDetailProgram(res.program);
      setDetailAuditLogs(res.auditLogs || []);
    } catch (err) {
      setDetailAuditLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Confirm Status Action (Publish or Archive)
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const targetStatus = confirmAction.type === 'PUBLISH' ? 'ACTIVE' : 'ARCHIVED';
      await programService.updateStatus(confirmAction.program.id || confirmAction.program._id, targetStatus);
      setConfirmAction(null);
      fetchPrograms();
    } catch (err) {
      alert(err.message || 'Failed to update program status');
    } finally {
      setActionLoading(false);
    }
  };

  // KPIs
  const totalCount = meta?.total ?? programs.length;
  const activeCount = programs.filter((p) => p.status === 'ACTIVE').length;
  const draftCount = programs.filter((p) => p.status === 'DRAFT').length;
  const archivedCount = programs.filter((p) => p.status === 'ARCHIVED').length;

  const columns = [
    {
      key: 'program',
      label: 'Program',
      render: (row) => (
        <div>
          <div className="fw-bold text-dark" style={{ fontSize: '0.92rem' }}>
            {row.title}
          </div>
          {row.description && (
            <div
              className="text-secondary text-truncate"
              style={{ fontSize: '0.78rem', maxWidth: '300px' }}
              title={row.description}
            >
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Division',
      render: (row) => (
        <span className={styles.divisionTag}>
          <i
            className={`fa-solid ${
              row.division === DIVISIONS.PRE_UNIVERSITY ? 'fa-school text-info' : 'fa-graduation-cap text-warning'
            }`}
            aria-hidden="true"
          ></i>
          {DIVISION_LABELS[row.division] || row.division || '—'}
        </span>
      ),
    },
    {
      key: 'level',
      label: 'Level & Mode',
      render: (row) => (
        <div>
          <span className={styles.levelTag}>{row.level || 'BEGINNER'}</span>
          <div className={styles.modeTag} style={{ marginTop: '0.2rem' }}>
            <i
              className={`fa-solid ${
                row.deliveryMode === 'ONLINE'
                  ? 'fa-laptop'
                  : row.deliveryMode === 'HYBRID'
                  ? 'fa-network-wired'
                  : 'fa-building'
              }`}
              aria-hidden="true"
            ></i>
            <span>{row.deliveryMode || 'ONSITE'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'capacity',
      label: 'Capacity & Fee',
      render: (row) => (
        <div>
          <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
            <i className="fa-solid fa-users text-secondary me-1" aria-hidden="true"></i>
            {row.capacity} seats
          </div>
          <div className="text-secondary" style={{ fontSize: '0.78rem' }}>
            {row.price > 0 ? `EGP ${row.price.toLocaleString()}` : 'Free / Sponsored'}
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
      key: 'actions',
      label: '',
      render: (row) => (
        <div className={styles.actionBtns}>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => handleOpenDetail(row)}
          >
            Details
          </button>

          <button
            type="button"
            className="btn btn-outline-info btn-sm"
            onClick={() => handleOpenEnrollments(row)}
            title="View program enrollments and capacity breakdown"
            id={`btn-enrollments-${row._id}`}
          >
            <i className="fa-solid fa-users me-1" aria-hidden="true"></i> Enrollments
          </button>

          {row.status !== 'ARCHIVED' && (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => handleOpenEdit(row)}
            >
              Edit
            </button>
          )}

          {row.status === 'DRAFT' && (
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              onClick={() => setConfirmAction({ type: 'PUBLISH', program: row })}
            >
              Publish
            </button>
          )}

          {row.status === 'ACTIVE' && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setConfirmAction({ type: 'ARCHIVE', program: row })}
            >
              Archive
            </button>
          )}

          {row.status === 'DRAFT' && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setConfirmAction({ type: 'ARCHIVE', program: row })}
            >
              Archive
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => setDeleteConfirmProgram(row)}
            title="Delete or safely archive program"
            id={`btn-delete-prog-${row._id}`}
          >
            <i className="fa-solid fa-trash me-1" aria-hidden="true"></i> Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Training Programs"
        subtitle={
          currentDivision
            ? `Manage space academy curriculum and training programs for ${DIVISION_LABELS[currentDivision]} division.`
            : 'Manage space academy curriculum and training programs across all divisions.'
        }
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            onClick={handleOpenCreate}
          >
            <i className="fa-solid fa-plus" aria-hidden="true"></i>
            <span>Create Program</span>
          </button>
        }
      />

      {/* Summary KPI Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconNavy}`}>
            <i className="fa-solid fa-book-open" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Total Programs</div>
            <div className={styles.summaryVal}>{totalCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconSuccess}`}>
            <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Active Programs</div>
            <div className={styles.summaryVal}>{activeCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconWarning}`}>
            <i className="fa-solid fa-file-pen" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Drafts</div>
            <div className={styles.summaryVal}>{draftCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconDanger}`}>
            <i className="fa-solid fa-box-archive" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Archived</div>
            <div className={styles.summaryVal}>{archivedCount}</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.searchWrap}>
          <SearchBar
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search programs by title or audience..."
          />
        </div>

        <div className={styles.filterGroup}>
          <FilterBar
            filters={[
              ...(isSuperAdmin && !routeDivision
                ? [
                    {
                      name: 'division',
                      value: divisionFilter,
                      onChange: (val) => {
                        setDivisionFilter(val);
                        setPage(1);
                      },
                      options: DIVISION_OPTIONS,
                    },
                  ]
                : []),
              {
                name: 'status',
                value: statusFilter,
                onChange: (val) => {
                  setStatusFilter(val);
                  setPage(1);
                },
                options: STATUS_OPTIONS,
              },
            ]}
          />
        </div>
      </div>

      {/* Main Table or Loading / Error */}
      {loading && !programs.length ? (
        <LoadingState message="Loading training programs..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchPrograms} />
      ) : (
        <DataTable
          columns={columns}
          rows={programs}
          emptyTitle="No training programs found"
          pagination={
            meta
              ? {
                  page: meta.page,
                  limit: meta.limit,
                  total: meta.total,
                  totalPages: meta.totalPages,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}

      {/* CREATE / EDIT PROGRAM MODAL */}
      <Modal
        isOpen={!!modalMode}
        onClose={() => !formLoading && setModalMode(null)}
        title={modalMode === 'create' ? 'Create Training Program' : `Edit Program: ${formData.title}`}
        subtitle={
          modalMode === 'create'
            ? 'Define curriculum details, capacity limits, and delivery format.'
            : 'Update existing program specifications and parameters.'
        }
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setModalMode(null)}
              disabled={formLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleFormSubmit}
              disabled={formLoading}
            >
              {formLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Saving...
                </>
              ) : modalMode === 'create' ? (
                'Create Program'
              ) : (
                'Save Changes'
              )}
            </button>
          </>
        }
      >
        {formError && <div className="alert alert-danger py-2 mb-3">{formError}</div>}
        <form onSubmit={handleFormSubmit}>
          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Program Title <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Spacecraft Orbital Dynamics & Telemetry"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              minLength={2}
            />
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Division Assignment <span className="text-danger">*</span>
              </label>
              {isSuperAdmin && !routeDivision && modalMode === 'create' ? (
                <select
                  className="form-select"
                  value={formData.division}
                  onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                >
                  <option value={DIVISIONS.PRE_UNIVERSITY}>Pre-University</option>
                  <option value={DIVISIONS.UNIVERSITY}>University</option>
                </select>
              ) : (
                <input
                  type="text"
                  className="form-control bg-light"
                  value={DIVISION_LABELS[formData.division] || formData.division}
                  disabled
                />
              )}
              <div className="form-text" style={{ fontSize: '0.78rem' }}>
                {isSuperAdmin && !routeDivision && modalMode === 'create'
                  ? 'Select division where program curriculum applies.'
                  : 'Program division is scoped to current administrative boundary.'}
              </div>
            </div>

            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Curriculum Level
              </label>
              <select
                className="form-select"
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: e.target.value })}
              >
                {LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Capacity (Seats) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                className="form-control"
                min={1}
                step={1}
                placeholder="25"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                required
              />
            </div>

            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Price (EGP)
              </label>
              <input
                type="number"
                className="form-control"
                min={0}
                placeholder="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>

            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Delivery Format
              </label>
              <select
                className="form-select"
                value={formData.deliveryMode}
                onChange={(e) => setFormData({ ...formData, deliveryMode: e.target.value })}
              >
                {DELIVERY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Program Category
              </label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="Space Engineering">Space Engineering</option>
                <option value="Satellite Operations">Satellite Operations</option>
                <option value="Astronomy & Astrophysics">Astronomy & Astrophysics</option>
                <option value="Rocketry & Propulsion">Rocketry & Propulsion</option>
                <option value="Earth Observation">Earth Observation</option>
                <option value="Space Architecture & Policy">Space Architecture & Policy</option>
                <option value="General Space Exploration">General Space Exploration</option>
              </select>
            </div>

            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Transportation Logistics
              </label>
              <select
                className="form-select"
                value={formData.transportationOption}
                onChange={(e) => setFormData({ ...formData, transportationOption: e.target.value })}
              >
                <option value="NONE">None / Self-Arranged</option>
                <option value="BUS_SHUTTLE">Academy Shuttle Bus</option>
                <option value="METRO_CONNECT">Metro Feeder Hub Transfer</option>
              </select>
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Registration Opens
              </label>
              <input
                type="date"
                className="form-control"
                value={formData.registrationStartDate}
                onChange={(e) => setFormData({ ...formData, registrationStartDate: e.target.value })}
              />
            </div>
            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Registration Closes
              </label>
              <input
                type="date"
                className="form-control"
                value={formData.registrationEndDate}
                onChange={(e) => setFormData({ ...formData, registrationEndDate: e.target.value })}
              />
            </div>
            <div className="col-sm-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Reopening / Waitlist Date
              </label>
              <input
                type="date"
                className="form-control"
                value={formData.reopeningDate}
                onChange={(e) => setFormData({ ...formData, reopeningDate: e.target.value })}
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Training Start Date
              </label>
              <input
                type="date"
                className="form-control"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Training End Date
              </label>
              <input
                type="date"
                className="form-control"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Required Education
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. STEM High School / B.Sc. Engineering"
                value={formData.requiredEducation}
                onChange={(e) => setFormData({ ...formData, requiredEducation: e.target.value })}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Target Majors
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Aerospace, Electronics, Computer Science"
                value={formData.targetMajors}
                onChange={(e) => setFormData({ ...formData, targetMajors: e.target.value })}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Academic Prerequisites
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Basic Orbital Mechanics, C++ or Python proficiency"
              value={formData.prerequisites}
              onChange={(e) => setFormData({ ...formData, prerequisites: e.target.value })}
            />
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Target Audience
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Undergraduate Engineering & Physics Students"
              value={formData.targetAudience}
              onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
            />
          </div>

          <div className="mb-2">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Curriculum Description
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Outline course objectives, lab prerequisites, and expected outcomes..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            ></textarea>
          </div>
        </form>
      </Modal>

      {/* PROGRAM DETAILS & AUDIT TRAIL MODAL */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Program Specifications & Audit Trail"
        size="lg"
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsDetailOpen(false)}
          >
            Close
          </button>
        }
      >
        {detailLoading ? (
          <LoadingState message="Loading program specifications..." />
        ) : detailProgram ? (
          <>
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Program Overview</div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Title:</span>
                <span className={styles.detailValue}>{detailProgram.title}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Status:</span>
                <span className={styles.detailValue}>
                  <StatusBadge status={detailProgram.status} />
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Division Scope:</span>
                <span className={styles.detailValue}>
                  {DIVISION_LABELS[detailProgram.division] || detailProgram.division}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Curriculum Level:</span>
                <span className={styles.detailValue}>{detailProgram.level}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Delivery Mode:</span>
                <span className={styles.detailValue}>{detailProgram.deliveryMode}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Capacity:</span>
                <span className={styles.detailValue}>{detailProgram.capacity} seats</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Enrollment Fee:</span>
                <span className={styles.detailValue}>
                  {detailProgram.price > 0 ? `EGP ${detailProgram.price.toLocaleString()}` : 'Free / Sponsored'}
                </span>
              </div>
              {detailProgram.targetAudience && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Target Audience:</span>
                  <span className={styles.detailValue}>{detailProgram.targetAudience}</span>
                </div>
              )}
              {detailProgram.description && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Description:</span>
                  <span className={styles.detailValue}>{detailProgram.description}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Created By:</span>
                <span className={styles.detailValue}>
                  {detailProgram.createdBy?.fullName || 'Administrator'} (
                  {detailProgram.createdBy?.email || 'esa.dev'})
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Created On:</span>
                <span className={styles.detailValue}>
                  {detailProgram.createdAt ? new Date(detailProgram.createdAt).toLocaleString() : '—'}
                </span>
              </div>
              {detailProgram.updatedBy && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Last Updated By:</span>
                  <span className={styles.detailValue}>
                    {detailProgram.updatedBy?.fullName} ({detailProgram.updatedBy?.email})
                  </span>
                </div>
              )}
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                Audit Trail ({detailAuditLogs.length})
              </div>
              {detailAuditLogs.length ? (
                <div className="table-responsive">
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Timestamp</th>
                        <th>Division</th>
                        <th>Details / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailAuditLogs.map((log) => (
                        <tr key={log.id || log._id}>
                          <td>
                            <span className="badge bg-light text-dark border">
                              {log.action}
                            </span>
                          </td>
                          <td>{log.user?.fullName || log.actor?.fullName || 'System'}</td>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.division || '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--esa-text-secondary)' }}>
                            {log.reason || JSON.stringify(log.after || '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-secondary p-3 text-center" style={{ fontSize: '0.85rem' }}>
                  No historical audit entries found for this program.
                </div>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      {/* CONFIRM STATUS ACTION MODAL (PUBLISH OR ARCHIVE) */}
      {confirmAction && (
        <ConfirmModal
          isOpen={!!confirmAction}
          onClose={() => !actionLoading && setConfirmAction(null)}
          onConfirm={handleConfirmAction}
          title={confirmAction.type === 'PUBLISH' ? 'Publish Program' : 'Archive Program'}
          message={
            confirmAction.type === 'PUBLISH' ? (
              <>
                Are you sure you want to publish <strong>{confirmAction.program.title}</strong>?
                <br />
                <span className="text-success mt-2 d-block" style={{ fontSize: '0.85rem' }}>
                  This will transition status from <strong>Draft</strong> to <strong>Active</strong>, allowing
                  students to discover and submit applications for this program.
                </span>
              </>
            ) : (
              <>
                Are you sure you want to archive <strong>{confirmAction.program.title}</strong>?
                <br />
                <span className="text-danger mt-2 d-block" style={{ fontSize: '0.85rem' }}>
                  <strong>Warning:</strong> Archiving will permanently close admissions for this program.
                  Per Academy business rules, archived programs cannot be reactivated. Historical records,
                  applications, and audit trails will be preserved.
                </span>
              </>
            )
          }
          confirmText={confirmAction.type === 'PUBLISH' ? 'Publish Program' : 'Archive Program'}
          confirmTone={confirmAction.type === 'PUBLISH' ? 'success' : 'danger'}
          loading={actionLoading}
          icon={confirmAction.type === 'PUBLISH' ? 'fa-rocket' : 'fa-box-archive'}
        />
      )}

      {/* CONFIRM DELETE / ARCHIVE PROGRAM MODAL */}
      {deleteConfirmProgram && (
        <ConfirmModal
          isOpen={!!deleteConfirmProgram}
          onClose={() => !deleteLoading && setDeleteConfirmProgram(null)}
          onConfirm={handleDeleteProgram}
          title="Delete / Archive Program"
          message={
            <div>
              <p>
                Are you sure you want to delete or archive <strong>{deleteConfirmProgram.title}</strong>?
              </p>
              <div className="alert alert-warning py-2 px-3 mb-0" style={{ fontSize: '0.84rem' }}>
                <i className="fa-solid fa-shield-halved me-1" aria-hidden="true"></i>
                <strong>Safety Guarantee:</strong> If this program is referenced by existing student applications,
                cohorts, enrollments, invoices, or certificates, the system will <strong>safely archive</strong> it to
                preserve audit and operational integrity. Only completely unreferenced records will be purged.
              </div>
            </div>
          }
          confirmText="Proceed Delete/Archive"
          confirmTone="danger"
          loading={deleteLoading}
          icon="fa-trash-can"
        />
      )}

      {/* PHASE 9: PROGRAM ENROLLMENTS & CAPACITY MODAL */}
      <Modal
        isOpen={isEnrollmentsOpen}
        onClose={() => setIsEnrollmentsOpen(false)}
        title={`Program Enrollments & Capacity — ${enrollmentProgram?.title || ''}`}
        size="xl"
      >
        {/* Capacity Summary KPI Card */}
        {enrollmentsCapacity && (
          <div className="card border-0 shadow-sm p-3 mb-3" style={{ background: '#f8fafc', borderRadius: '10px' }}>
            <div className="row g-3 text-center align-items-center">
              <div className="col-6 col-md-3">
                <div className="text-secondary small fw-semibold text-uppercase">Occupied Seats</div>
                <div className="fs-4 fw-bold text-primary">
                  {enrollmentsCapacity.occupied} / {enrollmentsCapacity.capacity}
                </div>
                <div className="small text-muted">
                  {enrollmentsCapacity.pendingPayment} pending + {enrollmentsCapacity.confirmed} confirmed
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-secondary small fw-semibold text-uppercase">Waitlisted</div>
                <div className="fs-4 fw-bold text-warning">
                  {enrollmentsCapacity.waitlisted}
                </div>
                <div className="small text-muted">Awaiting seat release</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-secondary small fw-semibold text-uppercase">Available Seats</div>
                <div className="fs-4 fw-bold text-success">
                  {enrollmentsCapacity.available}
                </div>
                <div className="small text-muted">Open capacity</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-secondary small fw-semibold text-uppercase">Cancelled</div>
                <div className="fs-4 fw-bold text-secondary">
                  {enrollmentsCapacity.cancelled}
                </div>
                <div className="small text-muted">Released seats</div>
              </div>
            </div>
          </div>
        )}

        {cancelSuccess && (
          <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
            <i className="fa-solid fa-circle-check text-success fa-lg" aria-hidden="true"></i>
            <span>{cancelSuccess}</span>
          </div>
        )}

        {invoiceSuccess && (
          <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
            <i className="fa-solid fa-circle-check text-success fa-lg" aria-hidden="true"></i>
            <span>{invoiceSuccess}</span>
          </div>
        )}

        {paymentSuccess && (
          <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
            <i className="fa-solid fa-circle-check text-success fa-lg" aria-hidden="true"></i>
            <span>{paymentSuccess}</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="d-flex flex-wrap gap-2 mb-3">
          {[
            { val: '', label: 'All Enrollments' },
            { val: 'PENDING_PAYMENT', label: 'Pending Payment' },
            { val: 'CONFIRMED', label: 'Confirmed' },
            { val: 'WAITLISTED', label: 'Waitlisted' },
            { val: 'CANCELLED', label: 'Cancelled' },
          ].map((f) => (
            <button
              key={f.val}
              type="button"
              className={`btn btn-sm ${enrollmentStatusFilter === f.val ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => {
                setEnrollmentStatusFilter(f.val);
                fetchProgramEnrollments(enrollmentProgram._id, f.val);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table or Empty/Loading State */}
        {enrollmentsLoading ? (
          <LoadingState message="Retrieving program enrollments and capacity..." />
        ) : enrollmentsError ? (
          <ErrorState message={enrollmentsError} onRetry={() => fetchProgramEnrollments(enrollmentProgram._id, enrollmentStatusFilter)} />
        ) : enrollmentsList.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <i className="fa-solid fa-users fa-3x mb-3 text-muted" aria-hidden="true"></i>
            <p className="mb-0">No enrollments found for this program matching the selected filter.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.85rem' }}>
              <thead className="table-light">
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Enrolled Date</th>
                  <th>Details / Billing</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollmentsList.map((enr) => {
                  const isCancellable = ['PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED'].includes(enr.status);
                  const canGenerateInvoice =
                    enr.status === 'PENDING_PAYMENT' &&
                    (!enr.invoice || enr.invoice.status === 'EXPIRED' || enr.invoice.status === 'CANCELLED');
                  const canRecordPayment =
                    enr.status === 'PENDING_PAYMENT' && enr.invoice && enr.invoice.status === 'PENDING';

                  return (
                    <tr key={enr._id}>
                      <td>
                        <div className="fw-semibold text-dark">{enr.student?.fullName || 'Student'}</div>
                        <div className="text-muted small">{enr.student?.email || '—'}</div>
                      </td>
                      <td>
                        <StatusBadge status={enr.status} />
                      </td>
                      <td>
                        {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-secondary small">
                        {enr.status === 'CANCELLED' ? (
                          <span className="text-danger">Cancelled: {enr.cancelReason || 'Admin action'}</span>
                        ) : enr.status === 'WAITLISTED' ? (
                          <span className="text-warning">On queue (FIFO priority)</span>
                        ) : (
                          <div>
                            <span className="text-success fw-semibold">Reserved seat</span>
                            {enr.invoice && (
                              <div className="mt-1 d-flex align-items-center gap-1">
                                <span className="font-monospace small">{enr.invoice.invoiceNumber}</span>
                                <StatusBadge status={enr.invoice.status} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-end">
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          {canGenerateInvoice && (
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => {
                                setInvoiceError('');
                                setInvoiceNotes('');
                                setInvoiceDueHours(72);
                                setGeneratingInvoiceEnrollment(enr);
                              }}
                              id={`btn-generate-invoice-${enr._id}`}
                            >
                              <i className="fa-solid fa-file-invoice me-1" aria-hidden="true"></i> Invoice
                            </button>
                          )}
                          {canRecordPayment && (
                            <button
                              type="button"
                              className="btn btn-outline-success btn-sm"
                              onClick={() => {
                                setPaymentError('');
                                setPaymentAmount(enr.invoice.amount);
                                setPaymentReference('');
                                setPaymentNotes('');
                                setPaymentMethod('BANK_TRANSFER');
                                setPayingEnrollment(enr);
                              }}
                              id={`btn-record-payment-${enr._id}`}
                            >
                              <i className="fa-solid fa-credit-card me-1" aria-hidden="true"></i> Pay
                            </button>
                          )}
                          {isCancellable && (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => {
                                setCancelError('');
                                setCancelReason('');
                                setCancellingEnrollment(enr);
                              }}
                              id={`btn-cancel-enrollment-${enr._id}`}
                            >
                              <i className="fa-solid fa-xmark me-1" aria-hidden="true"></i> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* CONFIRM CANCELLATION MODAL */}
      {cancellingEnrollment && (
        <ConfirmModal
          isOpen={!!cancellingEnrollment}
          onClose={() => !cancelLoading && setCancellingEnrollment(null)}
          onConfirm={handleCancelEnrollment}
          title="Confirm Enrollment Cancellation"
          message={
            <div>
              <p className="mb-2">
                Are you sure you want to cancel the enrollment for <strong>{cancellingEnrollment.student?.fullName}</strong>?
              </p>
              <div className="alert alert-warning py-2 px-3 mb-2" style={{ fontSize: '0.82rem' }}>
                <i className="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>
                Cancellation will release the reserved seat. If any eligible students are on the waiting list, the oldest waitlisted student will be <strong>automatically promoted</strong> to reserved seat (FIFO).
              </div>
              <div className="mt-2">
                <label htmlFor="cancel-reason-input" className="form-label small fw-semibold">
                  Cancellation Reason:
                </label>
                <input
                  type="text"
                  id="cancel-reason-input"
                  className="form-control form-control-sm"
                  placeholder="e.g., Student withdrew, requested refund, or duplicate record"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={cancelLoading}
                />
              </div>
              {cancelError && (
                <div className="alert alert-danger py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  {cancelError}
                </div>
              )}
            </div>
          }
          confirmText="Cancel Enrollment"
          confirmTone="danger"
          loading={cancelLoading}
          icon="fa-user-xmark"
        />
      )}

      {/* GENERATE INVOICE MODAL */}
      {generatingInvoiceEnrollment && (
        <Modal
          isOpen={!!generatingInvoiceEnrollment}
          onClose={() => !invoiceLoading && setGeneratingInvoiceEnrollment(null)}
          title={`Generate Invoice for ${generatingInvoiceEnrollment.student?.fullName || 'Student'}`}
          size="md"
        >
          <div>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-circle-info me-1"></i>
              Generates an administrative billing invoice for this pending enrollment. Program price is locked from the official program curriculum (<strong>{enrollmentProgram?.price || 0} EGP</strong>).
            </div>

            {invoiceError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.82rem' }}>
                {invoiceError}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Program & Pricing
              </label>
              <div className="p-2 rounded bg-light border fw-semibold">
                {enrollmentProgram?.title} — {Number(enrollmentProgram?.price || 0).toLocaleString()} EGP
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="invoice-due-hours" className="form-label small fw-semibold">
                Payment Deadline Window (Hours) *
              </label>
              <input
                type="number"
                id="invoice-due-hours"
                className="form-control form-control-sm"
                value={invoiceDueHours}
                onChange={(e) => setInvoiceDueHours(e.target.value)}
                min="1"
                max="720"
                disabled={invoiceLoading}
              />
              <div className="form-text small">
                Default: 72 hours. Unpaid invoices past this window are subject to the automated deadline sweep.
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="invoice-notes" className="form-label small fw-semibold">
                Invoice Notes
              </label>
              <textarea
                id="invoice-notes"
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional billing remarks or payment terms..."
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                disabled={invoiceLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setGeneratingInvoiceEnrollment(null)}
                disabled={invoiceLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                onClick={handleGenerateInvoice}
                disabled={invoiceLoading}
                id="btn-confirm-generate-invoice"
              >
                {invoiceLoading ? (
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

      {/* RECORD PAYMENT MODAL */}
      {payingEnrollment && (
        <Modal
          isOpen={!!payingEnrollment}
          onClose={() => !paymentLoading && setPayingEnrollment(null)}
          title={`Record Payment for ${payingEnrollment.student?.fullName || 'Student'}`}
          size="md"
        >
          <form onSubmit={handleRecordPayment}>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-circle-info me-1"></i>
              Recording payment will create an immutable transaction against Invoice{' '}
              <strong>{payingEnrollment.invoice?.invoiceNumber}</strong>. Settling the full amount (
              <strong>{payingEnrollment.invoice?.amount} EGP</strong>) transitions this enrollment to{' '}
              <strong>CONFIRMED</strong>.
            </div>

            {paymentError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.82rem' }}>
                {paymentError}
              </div>
            )}

            <div className="mb-3">
              <label htmlFor="prog-payment-amount" className="form-label small fw-semibold">
                Payment Amount (EGP) *
              </label>
              <input
                type="number"
                id="prog-payment-amount"
                className="form-control form-control-sm"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="1"
                step="any"
                required
                disabled={paymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="prog-payment-method" className="form-label small fw-semibold">
                Payment Method *
              </label>
              <select
                id="prog-payment-method"
                className="form-select form-select-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={paymentLoading}
              >
                <option value={PAYMENT_METHOD.BANK_TRANSFER}>Bank Transfer</option>
                <option value={PAYMENT_METHOD.CASH}>Cash (Receipt)</option>
                <option value={PAYMENT_METHOD.CARD}>Credit/Debit Card (POS)</option>
                <option value={PAYMENT_METHOD.OTHER}>Other / Sponsor</option>
              </select>
            </div>

            <div className="mb-3">
              <label htmlFor="prog-payment-ref" className="form-label small fw-semibold">
                Transaction Reference / Receipt #
              </label>
              <input
                type="text"
                id="prog-payment-ref"
                className="form-control form-control-sm"
                placeholder="e.g. TRF-10294, Cash Receipt #502"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={paymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="prog-payment-notes" className="form-label small fw-semibold">
                Notes
              </label>
              <textarea
                id="prog-payment-notes"
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional teller notes..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                disabled={paymentLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPayingEnrollment(null)}
                disabled={paymentLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success btn-sm d-flex align-items-center gap-1"
                disabled={paymentLoading}
                id="btn-confirm-prog-record-payment"
              >
                {paymentLoading ? (
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
