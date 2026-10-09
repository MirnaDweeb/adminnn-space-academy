import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import cohortService from '../../services/api/cohortService';
import programService from '../../services/api/programService';
import adminService from '../../services/api/adminService';
import certificateService from '../../services/api/certificateService';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import { COHORT_STATUS } from '../../constants/statuses';
import { PERMISSIONS, hasPermission } from '../../constants/permissions';
import styles from './CohortsPage.module.css';

export default function CohortsPage() {
  const { user } = useAuth();
  const params = useParams();
  const activeDivision = params.division || ROLE_TO_DIVISION[user?.role] || 'all';

  // Cohort List State
  const [cohorts, setCohorts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Dropdown reference data for Create Modal
  const [programs, setPrograms] = useState([]);
  const [instructors, setInstructors] = useState([]);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [formData, setFormData] = useState({
    programId: '',
    name: '',
    instructorId: '',
    startDate: '',
    endDate: '',
    capacity: 30,
    sessions: [
      { sessionNumber: 1, date: '', topic: 'Introduction & Mission Overview', durationMinutes: 120, location: 'Training Lab / Online' },
      { sessionNumber: 2, date: '', topic: 'Core Engineering & Orbit Mechanics', durationMinutes: 120, location: 'Training Lab / Online' },
      { sessionNumber: 3, date: '', topic: 'Practical Flight Dynamics Simulation', durationMinutes: 120, location: 'Sim Lab' },
    ],
  });

  // Detail Modal State
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  const [cohortDetail, setCohortDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('sessions'); // 'sessions' | 'roster' | 'assignments' | 'evaluations'

  // New Assignment inside Detail Modal
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: '', description: '', dueDate: '', maxScore: 100 });
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');

  // Phase 12: Evaluations & Learning Outcomes State
  const [evaluationsData, setEvaluationsData] = useState(null);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [evaluationsError, setEvaluationsError] = useState('');
  const [showEvaluateModal, setShowEvaluateModal] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState(null);
  const [studentHistoryList, setStudentHistoryList] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Phase 13: Certificate Issuance State
  const [showIssueCertModal, setShowIssueCertModal] = useState(false);
  const [selectedEvalForCert, setSelectedEvalForCert] = useState(null);
  const [issuingCert, setIssuingCert] = useState(false);

  // Edit Cohort & Schedule State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCohort, setEditingCohort] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    instructorId: '',
    startDate: '',
    endDate: '',
    capacity: 30,
    status: 'SCHEDULED',
    sessions: [],
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Fetch Cohorts
  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await cohortService.listCohorts({
        division: activeDivision !== 'all' ? activeDivision : undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      });
      setCohorts(res.cohorts || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load cohorts');
    } finally {
      setLoading(false);
    }
  }, [activeDivision, statusFilter, search, page]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  // Load programs and instructors for the Create modal
  const loadReferenceData = async () => {
    try {
      const progRes = await programService.list({
        division: activeDivision !== 'all' ? activeDivision : undefined,
        status: 'ACTIVE',
      });
      setPrograms(progRes.data?.programs || progRes.programs || progRes.data || []);

      const insRes = await adminService.listInstructors(
        activeDivision !== 'all' ? activeDivision : undefined
      );
      setInstructors(insRes.data?.instructors || insRes.instructors || insRes.data || []);
    } catch (e) {
      console.error('Failed to load reference data:', e);
    }
  };

  const handleOpenCreateModal = () => {
    loadReferenceData();
    setFormData({
      programId: '',
      name: '',
      instructorId: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      capacity: 30,
      sessions: [
        { sessionNumber: 1, date: new Date().toISOString().slice(0, 10), topic: 'Introduction & Mission Overview', durationMinutes: 120, location: 'Training Lab / Online' },
        { sessionNumber: 2, date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), topic: 'Core Engineering & Orbit Mechanics', durationMinutes: 120, location: 'Training Lab / Online' },
        { sessionNumber: 3, date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), topic: 'Practical Flight Dynamics Simulation', durationMinutes: 120, location: 'Sim Lab' },
      ],
    });
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleAddSession = () => {
    setFormData((prev) => ({
      ...prev,
      sessions: [
        ...prev.sessions,
        {
          sessionNumber: prev.sessions.length + 1,
          date: '',
          topic: `Session ${prev.sessions.length + 1}`,
          durationMinutes: 120,
          location: 'Training Lab / Online',
        },
      ],
    }));
  };

  const handleRemoveSession = (index) => {
    setFormData((prev) => {
      const updated = prev.sessions.filter((_, i) => i !== index);
      return {
        ...prev,
        sessions: updated.map((s, i) => ({ ...s, sessionNumber: i + 1 })),
      };
    });
  };

  const handleSessionChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.sessions];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, sessions: updated };
    });
  };

  const handleCreateCohort = async (e) => {
    e.preventDefault();
    if (!formData.programId || !formData.instructorId || !formData.name) {
      setCreateError('Please complete all required fields.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const created = await cohortService.createCohort(formData);
      setSuccessMessage(`Cohort ${created.cohortNumber} created successfully! Confirmed students automatically enrolled.`);
      setShowCreateModal(false);
      fetchCohorts();
    } catch (err) {
      setCreateError(err.message || 'Failed to create cohort');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditCohort = async (cohort) => {
    setEditingCohort(cohort);
    setEditError('');
    setEditFormData({
      name: cohort.name || '',
      instructorId: cohort.instructor?._id || cohort.instructor || '',
      startDate: cohort.startDate ? new Date(cohort.startDate).toISOString().split('T')[0] : '',
      endDate: cohort.endDate ? new Date(cohort.endDate).toISOString().split('T')[0] : '',
      capacity: cohort.capacity || 30,
      status: cohort.status || 'SCHEDULED',
      sessions: (cohort.sessions || []).map((s, idx) => ({
        sessionNumber: s.sessionNumber || idx + 1,
        date: s.date ? new Date(s.date).toISOString().split('T')[0] : '',
        topic: s.topic || `Session ${idx + 1}`,
        durationMinutes: s.durationMinutes || 120,
        location: s.location || 'Training Lab / Online',
      })),
    });
    // Ensure instructors list is loaded for dropdown
    if (!instructors.length) {
      try {
        const res = await adminService.listInstructors(cohort.division || activeDivision);
        setInstructors(res.data?.instructors || []);
      } catch (e) {
        // Non-blocking
      }
    }
    setShowEditModal(true);
  };

  const handleEditCohortSubmit = async (e) => {
    e.preventDefault();
    if (!editingCohort) return;
    setEditLoading(true);
    setEditError('');
    try {
      await adminService.updateCohort(editingCohort._id, editFormData);
      setShowEditModal(false);
      setSuccessMessage(`Cohort ${editingCohort.cohortNumber} updated successfully.`);
      fetchCohorts();
    } catch (err) {
      setEditError(err.message || 'Failed to update cohort schedule');
    } finally {
      setEditLoading(false);
    }
  };

  // Load evaluations for cohort
  const loadEvaluations = async (cohortId) => {
    setEvaluationsLoading(true);
    setEvaluationsError('');
    try {
      const data = await cohortService.getCohortEvaluations(cohortId);
      setEvaluationsData(data);
    } catch (err) {
      setEvaluationsError(err.message || 'Failed to load cohort evaluations');
    } finally {
      setEvaluationsLoading(false);
    }
  };

  // View Cohort Details
  const handleViewCohort = async (cohortId) => {
    setSelectedCohortId(cohortId);
    setDetailLoading(true);
    setDetailTab('sessions');
    setShowAddAssignment(false);
    setEvaluationsData(null);
    try {
      const res = await cohortService.getCohort(cohortId);
      setCohortDetail(res);
      // Preload evaluations in background
      loadEvaluations(cohortId);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Trigger Cohort Evaluation computation (append-only)
  const handleTriggerEvaluation = async () => {
    if (!selectedCohortId) return;
    setEvaluating(true);
    try {
      const result = await cohortService.evaluateCohort(selectedCohortId);
      setShowEvaluateModal(false);
      const summary = result.summary || {};
      setSuccessMessage(
        `Cohort evaluation completed! ${summary.total || 0} students evaluated (${summary.passCount || 0} Passed, ${summary.failCount || 0} Failed, ${summary.incompleteCount || 0} Incomplete). Audit record saved.`
      );
      await loadEvaluations(selectedCohortId);
      setDetailTab('evaluations');
    } catch (err) {
      alert(err.message || 'Failed to compute cohort evaluations');
    } finally {
      setEvaluating(false);
    }
  };

  // Open Re-evaluation History for a specific student
  const handleOpenStudentHistory = (student, allHistory) => {
    const studentId = student?._id || student;
    const history = (allHistory || []).filter(
      (h) => String(h.student?._id || h.student) === String(studentId)
    );
    setSelectedStudentForHistory(student);
    setStudentHistoryList(history);
    setShowHistoryModal(true);
  };

  // Open Issue Certificate Modal (Phase 13)
  const handleOpenIssueCertModal = (evaluation) => {
    setSelectedEvalForCert(evaluation);
    setShowIssueCertModal(true);
  };

  // Confirm and Execute Certificate Issuance
  const handleConfirmIssueCert = async () => {
    if (!selectedEvalForCert) return;
    setIssuingCert(true);
    try {
      const res = await certificateService.issueCertificate(selectedEvalForCert._id);
      setShowIssueCertModal(false);
      setSelectedEvalForCert(null);
      setSuccessMessage(
        `Certificate ${res.data?.certificate?.serialNumber || ''} issued successfully! Verifiable credential generated.`
      );
      if (selectedCohortId) {
        await loadEvaluations(selectedCohortId);
      }
    } catch (err) {
      alert(err.message || 'Failed to issue certificate');
    } finally {
      setIssuingCert(false);
    }
  };

  // Add Assignment Handler
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!assignForm.title || !assignForm.dueDate) {
      setAssignError('Title and due date are required');
      return;
    }

    setAssignLoading(true);
    setAssignError('');
    try {
      await cohortService.createAssignment(selectedCohortId, assignForm);
      setShowAddAssignment(false);
      setAssignForm({ title: '', description: '', dueDate: '', maxScore: 100 });
      // Refresh cohort detail
      const refreshed = await cohortService.getCohort(selectedCohortId);
      setCohortDetail(refreshed);
    } catch (err) {
      setAssignError(err.message || 'Failed to create assignment');
    } finally {
      setAssignLoading(false);
    }
  };

  // Stats calculation
  const totalCohorts = cohorts.length;
  const activeCohortsCount = cohorts.filter((c) => c.status === COHORT_STATUS.IN_PROGRESS || c.status === COHORT_STATUS.SCHEDULED).length;
  const totalStudentsCount = cohorts.reduce((sum, c) => sum + (c.enrolledCount || 0), 0);

  const columns = [
    {
      key: 'cohortNumber',
      label: 'Cohort #',
      render: (c) => (
        <div>
          <span className={styles.cohortNumber}>{c.cohortNumber}</span>
          <div className="fw-semibold text-dark small">{c.name}</div>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Program',
      render: (c) => (
        <div>
          <div className="fw-semibold text-dark">{c.program?.title || 'Program'}</div>
          <span className="badge bg-light text-dark border" style={{ fontSize: '0.72rem' }}>
            {DIVISION_LABELS[c.division] || c.division}
          </span>
        </div>
      ),
    },
    {
      key: 'instructor',
      label: 'Instructor',
      render: (c) => (
        <div>
          <div className="fw-semibold text-dark">{c.instructor?.fullName || 'Assigned Instructor'}</div>
          <div className="text-muted small">{c.instructor?.email}</div>
        </div>
      ),
    },
    {
      key: 'dates',
      label: 'Schedule Dates',
      render: (c) => (
        <div className="small text-secondary">
          <div><i className="fa-regular fa-calendar-check me-1 text-success"></i> {new Date(c.startDate).toLocaleDateString()}</div>
          <div><i className="fa-regular fa-calendar-xmark me-1 text-danger"></i> {new Date(c.endDate).toLocaleDateString()}</div>
        </div>
      ),
    },
    {
      key: 'students',
      label: 'Enrolled / Capacity',
      render: (c) => (
        <div>
          <span className="fw-bold text-dark">{c.enrolledCount || 0}</span>
          <span className="text-muted small"> / {c.capacity || 30}</span>
          <div className="progress mt-1" style={{ height: '4px', width: '80px' }}>
            <div
              className="progress-bar bg-primary"
              style={{ width: `${Math.min(100, Math.round(((c.enrolledCount || 0) / (c.capacity || 30)) * 100))}%` }}
            ></div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="d-flex gap-1 justify-content-end">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleViewCohort(c._id)}
            id={`btn-view-cohort-${c._id}`}
          >
            <i className="fa-solid fa-eye me-1"></i> Details
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => handleOpenEditCohort(c)}
            id={`btn-edit-cohort-${c._id}`}
            title="Modify Schedule, Instructor, or Capacity"
          >
            <i className="fa-solid fa-calendar-days me-1"></i> Schedule
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title={
          activeDivision && activeDivision !== 'all'
            ? `${DIVISION_LABELS[activeDivision] || activeDivision} Cohorts & Delivery`
            : 'Cohort Management & Training Delivery'
        }
        subtitle="Manage program scheduled runs, session calendars, instructor assignments, student rosters, and deliverables."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-2"
            onClick={handleOpenCreateModal}
            id="btn-create-cohort"
          >
            <i className="fa-solid fa-plus"></i>
            <span>Create Cohort</span>
          </button>
        }
      />

      {successMessage && (
        <div className="alert alert-success alert-dismissible fade show py-2 px-3 mb-0" role="alert">
          <i className="fa-solid fa-circle-check me-2"></i>
          {successMessage}
          <button
            type="button"
            className="btn-close"
            style={{ padding: '0.75rem' }}
            onClick={() => setSuccessMessage('')}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      <div className={styles.statsGrid}>
        <StatCard
          icon="fa-people-group"
          title="Total Cohorts"
          label="Total Cohorts"
          value={totalCohorts}
          tone="primary"
          subtitle="Managed runs"
        />
        <StatCard
          icon="fa-calendar-check"
          title="Active Runs"
          label="Active Runs"
          value={activeCohortsCount}
          tone="success"
          subtitle="Scheduled / In Progress"
        />
        <StatCard
          icon="fa-user-graduate"
          title="Confirmed Students"
          label="Confirmed Students"
          value={totalStudentsCount}
          tone="cyan"
          subtitle="Across all cohorts"
        />
      </div>

      {/* TOOLBAR */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search cohort name or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <select
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value={COHORT_STATUS.SCHEDULED}>Scheduled</option>
            <option value={COHORT_STATUS.IN_PROGRESS}>In Progress</option>
            <option value={COHORT_STATUS.COMPLETED}>Completed</option>
            <option value={COHORT_STATUS.CANCELLED}>Cancelled</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      {loading ? (
        <LoadingState message="Loading cohorts & scheduled runs..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCohorts} />
      ) : cohorts.length === 0 ? (
        <EmptyState
          title="No Cohorts Found"
          message="No training cohorts have been scheduled for this division yet. Click 'Create Cohort' to schedule a run."
        />
      ) : (
        <DataTable
          columns={columns}
          data={cohorts}
          total={pagination.total}
          page={page}
          limit={20}
          onPageChange={setPage}
        />
      )}

      {/* CREATE COHORT MODAL */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => !creating && setShowCreateModal(false)}
          title="Schedule New Training Cohort"
          size="lg"
        >
          <form onSubmit={handleCreateCohort}>
            {createError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.85rem' }}>
                {createError}
              </div>
            )}

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Training Program *</label>
                <select
                  className="form-select form-select-sm"
                  value={formData.programId}
                  onChange={(e) => {
                    const sel = programs.find((p) => p._id === e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      programId: e.target.value,
                      name: sel ? `${sel.title} - Batch 1` : prev.name,
                      capacity: sel?.capacity || prev.capacity,
                    }));
                  }}
                  required
                  id="cohort-program-select"
                >
                  <option value="">Select Training Program...</option>
                  {programs.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} ({p.division})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label small fw-semibold">Assigned Instructor *</label>
                <select
                  className="form-select form-select-sm"
                  value={formData.instructorId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, instructorId: e.target.value }))}
                  required
                  id="cohort-instructor-select"
                >
                  <option value="">Select Instructor...</option>
                  {instructors.map((ins) => {
                    const id = ins.user?._id || ins.user?.id || ins._id;
                    const name = ins.user?.fullName || ins.fullName || 'Instructor';
                    const email = ins.user?.email || ins.email || '';
                    return (
                      <option key={id} value={id}>
                        {name} {email ? `(${email})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Cohort Batch Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Orbital Mechanics Spring 2026 Batch Alpha"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  id="cohort-name-input"
                />
              </div>

              <div className="col-md-3">
                <label className="form-label small fw-semibold">Start Date *</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  required
                  id="cohort-startdate-input"
                />
              </div>

              <div className="col-md-3">
                <label className="form-label small fw-semibold">End Date *</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                  required
                  id="cohort-enddate-input"
                />
              </div>
            </div>

            {/* SESSIONS BUILDER */}
            <div className={styles.modalSection}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
                  <i className="fa-regular fa-calendar-days text-primary"></i> Scheduled Sessions ({formData.sessions.length})
                </div>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleAddSession}
                  id="btn-add-session"
                >
                  <i className="fa-solid fa-plus me-1"></i> Add Session
                </button>
              </div>

              {formData.sessions.map((sess, idx) => (
                <div key={idx} className={styles.sessionRow}>
                  <div>
                    <span className="badge bg-secondary">Session {sess.sessionNumber}</span>
                  </div>
                  <div>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={sess.date}
                      onChange={(e) => handleSessionChange(idx, 'date', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Session topic or module..."
                      value={sess.topic}
                      onChange={(e) => handleSessionChange(idx, 'topic', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      placeholder="Mins"
                      value={sess.durationMinutes}
                      onChange={(e) => handleSessionChange(idx, 'durationMinutes', e.target.value)}
                      min="15"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm p-1"
                      onClick={() => handleRemoveSession(idx)}
                      disabled={formData.sessions.length <= 1}
                      title="Remove Session"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                disabled={creating}
                id="btn-confirm-create-cohort"
              >
                {creating ? 'Creating...' : 'Create & Schedule Cohort'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* COHORT DETAIL MODAL */}
      {selectedCohortId && (
        <Modal
          isOpen={!!selectedCohortId}
          onClose={() => {
            setSelectedCohortId(null);
            setCohortDetail(null);
          }}
          title={cohortDetail ? `${cohortDetail.cohort?.cohortNumber} — ${cohortDetail.cohort?.name}` : 'Cohort Details'}
          size="lg"
        >
          {detailLoading ? (
            <LoadingState message="Loading cohort details..." />
          ) : cohortDetail ? (
            <div>
              {/* Header Overview */}
              <div className={styles.modalSection}>
                <div className={styles.grid2}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Program</span>
                    <span className={styles.detailValue}>{cohortDetail.cohort?.program?.title}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Instructor</span>
                    <span className={styles.detailValue}>
                      {cohortDetail.cohort?.instructor?.fullName} ({cohortDetail.cohort?.instructor?.email})
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Schedule Period</span>
                    <span className={styles.detailValue}>
                      {new Date(cohortDetail.cohort?.startDate).toLocaleDateString()} &rarr;{' '}
                      {new Date(cohortDetail.cohort?.endDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Status & Capacity</span>
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-2">
                        <StatusBadge status={cohortDetail.cohort?.status} />
                        <span className="small text-muted">
                          ({cohortDetail.roster?.length || 0} / {cohortDetail.cohort?.capacity} Confirmed)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                        onClick={() => setShowEvaluateModal(true)}
                        id="btn-evaluate-cohort-action"
                      >
                        <i className="fa-solid fa-calculator"></i>
                        <span>Evaluate Cohort</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABS */}
              <div className={styles.navTabs}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${detailTab === 'sessions' ? styles.activeTabBtn : ''}`}
                  onClick={() => setDetailTab('sessions')}
                  id="tab-cohort-sessions"
                >
                  <i className="fa-regular fa-calendar-days me-1"></i> Sessions Schedule ({cohortDetail.cohort?.sessions?.length || 0})
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${detailTab === 'roster' ? styles.activeTabBtn : ''}`}
                  onClick={() => setDetailTab('roster')}
                  id="tab-cohort-roster"
                >
                  <i className="fa-solid fa-users me-1"></i> Confirmed Roster ({cohortDetail.roster?.length || 0})
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${detailTab === 'assignments' ? styles.activeTabBtn : ''}`}
                  onClick={() => setDetailTab('assignments')}
                  id="tab-cohort-assignments"
                >
                  <i className="fa-solid fa-file-pen me-1"></i> Deliverables ({cohortDetail.assignments?.length || 0})
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${detailTab === 'evaluations' ? styles.activeTabBtn : ''}`}
                  onClick={() => {
                    setDetailTab('evaluations');
                    loadEvaluations(selectedCohortId);
                  }}
                  id="tab-cohort-evaluations"
                >
                  <i className="fa-solid fa-award me-1"></i> Evaluations & Outcomes ({evaluationsData?.evaluations?.length || 0})
                </button>
              </div>

              {/* TAB 1: SESSIONS SCHEDULE */}
              {detailTab === 'sessions' && (
                <div className={styles.tableWrap}>
                  <table className={`table ${styles.customTable}`}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Topic</th>
                        <th>Duration</th>
                        <th>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortDetail.cohort?.sessions?.map((sess) => (
                        <tr key={sess._id}>
                          <td className="fw-bold">{sess.sessionNumber}</td>
                          <td>{new Date(sess.date).toLocaleDateString()}</td>
                          <td className="fw-semibold text-dark">{sess.topic}</td>
                          <td>{sess.durationMinutes} mins</td>
                          <td><span className="badge bg-light text-secondary border">{sess.location}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 2: CONFIRMED ROSTER */}
              {detailTab === 'roster' && (
                <div className={styles.tableWrap}>
                  {cohortDetail.roster?.length === 0 ? (
                    <div className="p-3 text-center text-muted small">
                      No confirmed students enrolled in this cohort yet.
                    </div>
                  ) : (
                    <table className={`table ${styles.customTable}`}>
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th>Email</th>
                          <th>Application #</th>
                          <th>Confirmed Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohortDetail.roster?.map((r) => (
                          <tr key={r.enrollmentId}>
                            <td className="fw-semibold text-dark">{r.student?.fullName}</td>
                            <td>{r.student?.email}</td>
                            <td className="font-monospace small">{r.application?.applicationNumber || '—'}</td>
                            <td>{r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TAB 3: ASSIGNMENTS */}
              {detailTab === 'assignments' && (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="text-secondary small fw-semibold">Graded Deliverables & Projects</span>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => setShowAddAssignment(!showAddAssignment)}
                      id="btn-toggle-add-assignment"
                    >
                      <i className="fa-solid fa-plus me-1"></i> Add Deliverable
                    </button>
                  </div>

                  {showAddAssignment && (
                    <form onSubmit={handleCreateAssignment} className="p-3 bg-light rounded border mb-3">
                      <div className="fw-semibold text-dark mb-2 small">New Graded Deliverable</div>
                      {assignError && <div className="alert alert-danger py-1 px-2 small">{assignError}</div>}
                      <div className="row g-2 mb-2">
                        <div className="col-md-6">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Assignment Title (e.g. Orbital Propagation Script)"
                            value={assignForm.title}
                            onChange={(e) => setAssignForm((p) => ({ ...p, title: e.target.value }))}
                            required
                            id="assignment-title-input"
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={assignForm.dueDate}
                            onChange={(e) => setAssignForm((p) => ({ ...p, dueDate: e.target.value }))}
                            required
                            id="assignment-duedate-input"
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            placeholder="Max Score"
                            value={assignForm.maxScore}
                            onChange={(e) => setAssignForm((p) => ({ ...p, maxScore: e.target.value }))}
                            min="1"
                            required
                            id="assignment-maxscore-input"
                          />
                        </div>
                      </div>
                      <div className="mb-2">
                        <textarea
                          className="form-control form-control-sm"
                          rows={2}
                          placeholder="Deliverable description or rubric instructions..."
                          value={assignForm.description}
                          onChange={(e) => setAssignForm((p) => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                      <div className="d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setShowAddAssignment(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={assignLoading}
                          id="btn-submit-assignment"
                        >
                          {assignLoading ? 'Saving...' : 'Save Deliverable'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className={styles.tableWrap}>
                    {cohortDetail.assignments?.length === 0 ? (
                      <div className="p-3 text-center text-muted small">No assignments created yet for this cohort.</div>
                    ) : (
                      <table className={`table ${styles.customTable}`}>
                        <thead>
                          <tr>
                            <th>Deliverable Title</th>
                            <th>Due Date</th>
                            <th>Max Score</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cohortDetail.assignments?.map((a) => (
                            <tr key={a._id}>
                              <td className="fw-semibold text-dark">{a.title}</td>
                              <td>{new Date(a.dueDate).toLocaleDateString()}</td>
                              <td><span className="badge bg-primary-subtle text-primary border">{a.maxScore} pts</span></td>
                              <td className="small text-secondary">{a.description || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: EVALUATIONS & LEARNING OUTCOMES */}
              {detailTab === 'evaluations' && (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <span className="fw-semibold text-dark small">Certified Learning Outcomes</span>
                      <div className="text-muted small">
                        Aggregated from session attendance (Gate threshold: &ge;80%) and deliverable scores (Passing threshold: &ge;60%).
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                      onClick={() => setShowEvaluateModal(true)}
                      id="btn-re-evaluate-cohort"
                    >
                      <i className="fa-solid fa-arrows-rotate"></i>
                      <span>{evaluationsData?.evaluations?.length > 0 ? 'Re-Evaluate Cohort' : 'Evaluate Cohort'}</span>
                    </button>
                  </div>

                  {evaluationsLoading ? (
                    <LoadingState message="Loading cohort learning outcomes..." />
                  ) : evaluationsError ? (
                    <ErrorState message={evaluationsError} onRetry={() => loadEvaluations(selectedCohortId)} />
                  ) : !evaluationsData?.evaluations || evaluationsData.evaluations.length === 0 ? (
                    <EmptyState
                      title="No Evaluations Computed Yet"
                      message="Learning outcomes have not yet been evaluated for this cohort. Click 'Evaluate Cohort' to aggregate attendance records and graded deliverables for all confirmed students."
                      action={
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setShowEvaluateModal(true)}
                          id="btn-empty-evaluate-cohort"
                        >
                          <i className="fa-solid fa-calculator me-1"></i> Evaluate Cohort Now
                        </button>
                      }
                    />
                  ) : (
                    <div>
                      {/* EVALUATION METRICS SUMMARY BAR */}
                      <div className={styles.evalSummaryBar}>
                        <div className={styles.evalCounts}>
                          <div className={styles.evalCountItem}>
                            <i className="fa-solid fa-users text-primary"></i>
                            <span>Total Evaluated: <strong>{evaluationsData.evaluations.length}</strong></span>
                          </div>
                          <div className={styles.evalCountItem}>
                            <i className="fa-solid fa-circle-check text-success"></i>
                            <span>Passed: <strong className="text-success">{evaluationsData.evaluations.filter((e) => e.outcome === 'PASS').length}</strong></span>
                          </div>
                          <div className={styles.evalCountItem}>
                            <i className="fa-solid fa-circle-xmark text-danger"></i>
                            <span>Failed: <strong className="text-danger">{evaluationsData.evaluations.filter((e) => e.outcome === 'FAIL').length}</strong></span>
                          </div>
                          <div className={styles.evalCountItem}>
                            <i className="fa-solid fa-triangle-exclamation text-warning"></i>
                            <span>Incomplete: <strong className="text-warning">{evaluationsData.evaluations.filter((e) => e.outcome === 'INCOMPLETE').length}</strong></span>
                          </div>
                        </div>
                        <span className="badge bg-light text-secondary border font-monospace small">
                          Thresholds: &ge;80% Attendance | &ge;60% Score
                        </span>
                      </div>

                      {/* RESULTS TABLE */}
                      <div className={styles.tableWrap}>
                        <table className={`table ${styles.customTable}`} id="table-cohort-evaluations">
                          <thead>
                            <tr>
                              <th>Student</th>
                              <th>Attendance Rate</th>
                              <th>Average Score</th>
                              <th>Attendance Gate</th>
                              <th>Outcome</th>
                              <th>Determination Reason</th>
                              <th>Evaluated At</th>
                              <th>Certificate</th>
                              <th>History</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evaluationsData.evaluations.map((ev) => (
                              <tr key={ev._id}>
                                <td>
                                  <div className="fw-semibold text-dark">{ev.student?.fullName || 'Student'}</div>
                                  <div className="text-muted small">{ev.student?.email}</div>
                                </td>
                                <td>
                                  <div className="d-flex align-items-center gap-2">
                                    <span className={`fw-bold ${ev.attendanceThresholdMet ? 'text-success' : 'text-danger'}`}>
                                      {ev.attendanceRate}%
                                    </span>
                                    <div className="progress flex-grow-1" style={{ height: '5px', width: '60px' }}>
                                      <div
                                        className={`progress-bar ${ev.attendanceThresholdMet ? 'bg-success' : 'bg-danger'}`}
                                        style={{ width: `${Math.min(100, ev.attendanceRate)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className={`fw-bold ${ev.averageScore >= 60 ? 'text-success' : 'text-danger'}`}>
                                    {ev.averageScore}%
                                  </span>
                                </td>
                                <td>
                                  {ev.attendanceThresholdMet ? (
                                    <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: '0.72rem' }}>
                                      <i className="fa-solid fa-check me-1"></i> Met (&ge;80%)
                                    </span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: '0.72rem' }}>
                                      <i className="fa-solid fa-xmark me-1"></i> Below 80%
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <StatusBadge status={ev.outcome} />
                                </td>
                                <td className="small text-secondary" style={{ maxWidth: '250px' }}>
                                  {ev.outcomeReason}
                                </td>
                                <td className="small text-muted">
                                  {new Date(ev.evaluatedAt).toLocaleString()}
                                </td>
                                <td>
                                  {ev.certificate ? (
                                    <span
                                      className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 font-monospace"
                                      title={`Issued on ${new Date(ev.certificate.issuedAt).toLocaleDateString()}`}
                                      id={`cert-badge-${ev._id}`}
                                    >
                                      <i className="fa-solid fa-award"></i>
                                      {ev.certificate.serialNumber}
                                    </span>
                                  ) : ev.outcome === 'PASS' && hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) ? (
                                    <button
                                      type="button"
                                      className="btn btn-outline-success btn-sm py-0 px-2"
                                      id={`btn-issue-cert-${ev._id}`}
                                      onClick={() => handleOpenIssueCertModal(ev)}
                                      title="Issue Official Certificate"
                                    >
                                      <i className="fa-solid fa-certificate me-1"></i> Issue Certificate
                                    </button>
                                  ) : (
                                    <span className="text-muted small">—</span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-outline-secondary btn-sm py-0 px-2"
                                    onClick={() => handleOpenStudentHistory(ev.student, evaluationsData.history)}
                                    id={`btn-eval-history-${ev.student?._id || ev.student}`}
                                    title="View Re-evaluation History"
                                  >
                                    <i className="fa-solid fa-clock-rotate-left me-1"></i> History
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      )}

      {/* EVALUATION CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={showEvaluateModal}
        onClose={() => setShowEvaluateModal(false)}
        onConfirm={handleTriggerEvaluation}
        title="Evaluate Cohort Outcomes"
        message={`Are you sure you want to compute evaluations for all confirmed students in ${cohortDetail?.cohort?.cohortNumber || 'this cohort'}? This will aggregate all attendance sessions (minimum 80% required) and deliverable scores (minimum 60% required) into certified learning outcomes. Any prior evaluation records are preserved in append-only history.`}
        confirmText={evaluating ? 'Computing...' : 'Run Evaluation'}
        confirmTone="primary"
        icon="fa-calculator"
        loading={evaluating}
      />

      {/* ISSUE CERTIFICATE MODAL (Phase 13 Extension) */}
      {showIssueCertModal && selectedEvalForCert && (
        <Modal
          isOpen={showIssueCertModal}
          onClose={() => {
            if (!issuingCert) {
              setShowIssueCertModal(false);
              setSelectedEvalForCert(null);
            }
          }}
          title="Issue Official Certificate"
          size="md"
        >
          <div className="mb-3 text-secondary small">
            Issue an institutional, verifiable Egyptian Space Agency Certificate of Completion for this qualifying evaluation record.
          </div>

          <div className="card border bg-light p-3 mb-3">
            <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
              <i className="fa-solid fa-award text-warning"></i>
              <span>Credential Verification Summary</span>
            </h6>
            <div className="row g-2 small">
              <div className="col-12">
                <div className="text-secondary fw-semibold">Student:</div>
                <div className="fw-bold text-dark">{selectedEvalForCert.student?.fullName || 'Student'}</div>
                <div className="text-muted">{selectedEvalForCert.student?.email}</div>
              </div>
              <div className="col-sm-6 mt-2">
                <div className="text-secondary fw-semibold">Program:</div>
                <div className="fw-bold text-dark">{cohortDetail?.program?.title || 'Program'}</div>
              </div>
              <div className="col-sm-6 mt-2">
                <div className="text-secondary fw-semibold">Cohort:</div>
                <div className="fw-bold text-dark">{cohortDetail?.cohortNumber || 'Cohort'}</div>
              </div>
              <div className="col-12 mt-2 pt-2 border-top">
                <div className="text-secondary fw-semibold">Completion & Eligibility:</div>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className="badge bg-success">PASS</span>
                  <span className="text-dark fw-medium">Score: {selectedEvalForCert.averageScore}%</span>
                  <span className="text-secondary">Attendance: {selectedEvalForCert.attendanceRate}%</span>
                </div>
              </div>
              <div className="col-12 mt-2 pt-2 border-top">
                <div className="text-secondary fw-semibold">Certificate Type:</div>
                <div className="fw-bold text-dark d-flex align-items-center gap-2 mt-1">
                  <i className="fa-solid fa-file-shield text-info"></i>
                  <span>Official Certificate of Completion (Tamper-evident verification token)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="alert alert-warning small d-flex align-items-center gap-2 mb-3">
            <i className="fa-solid fa-shield-halved fa-lg"></i>
            <div>
              <strong>Institutional Confirmation:</strong> An immutable serial number will be generated, verifiable cryptographic credentials will be published, and the student will be notified.
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 pt-3 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setShowIssueCertModal(false);
                setSelectedEvalForCert(null);
              }}
              disabled={issuingCert}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm d-flex align-items-center gap-2"
              id="btn-confirm-issue-cert"
              onClick={handleConfirmIssueCert}
              disabled={issuingCert}
            >
              {issuingCert ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  <span>Issuing Certificate...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-award"></i>
                  <span>Issue Certificate</span>
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {/* STUDENT EVALUATION HISTORY TIMELINE MODAL */}
      {showHistoryModal && selectedStudentForHistory && (
        <Modal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedStudentForHistory(null);
          }}
          title={`Evaluation History — ${selectedStudentForHistory.fullName || 'Student'}`}
          size="md"
        >
          <div className="mb-3 text-secondary small">
            Historical evaluations preserved in append-only audit trail. Re-evaluating appends a new record without overwriting past outcomes.
          </div>

          {studentHistoryList.length === 0 ? (
            <div className="text-center p-3 text-muted">No historical evaluation records found.</div>
          ) : (
            <div className={styles.timelineContainer}>
              {studentHistoryList.map((h, idx) => (
                <div key={h._id} className={styles.timelineItem}>
                  <div
                    className={`${styles.timelineIcon} ${
                      h.outcome === 'PASS'
                        ? 'bg-success-subtle text-success'
                        : h.outcome === 'FAIL'
                        ? 'bg-danger-subtle text-danger'
                        : 'bg-warning-subtle text-warning'
                    }`}
                  >
                    <i
                      className={`fa-solid ${
                        h.outcome === 'PASS'
                          ? 'fa-check'
                          : h.outcome === 'FAIL'
                          ? 'fa-xmark'
                          : 'fa-triangle-exclamation'
                      }`}
                    ></i>
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineHeader}>
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-semibold text-dark">Run #{studentHistoryList.length - idx}</span>
                        <StatusBadge status={h.outcome} />
                      </div>
                      <span className={styles.timelineDate}>{new Date(h.evaluatedAt).toLocaleString()}</span>
                    </div>
                    <div className="d-flex align-items-center gap-3 small text-secondary mt-1">
                      <span>Attendance: <strong>{h.attendanceRate}%</strong> ({h.attendanceThresholdMet ? 'Gate Met' : 'Gate Failed'})</span>
                      <span>Average Score: <strong>{h.averageScore}%</strong></span>
                    </div>
                    <div className={styles.timelineReason}>
                      {h.outcomeReason}
                    </div>
                    <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                      Evaluated by: {h.evaluatedBy?.fullName || 'System Administrator'} ({h.evaluatedBy?.role || 'Admin'})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* EDIT COHORT & SCHEDULE MODAL */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !editLoading && setShowEditModal(false)}
        title={`Modify Schedule: ${editingCohort?.cohortNumber || ''}`}
        subtitle={`Program: ${editingCohort?.program?.title || ''}`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowEditModal(false)}
              disabled={editLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleEditCohortSubmit}
              disabled={editLoading}
            >
              {editLoading ? 'Saving...' : 'Save Schedule Changes'}
            </button>
          </>
        }
      >
        {editError && <div className="alert alert-danger py-2 mb-3">{editError}</div>}
        <form onSubmit={handleEditCohortSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold small">Cohort Name</label>
              <input
                type="text"
                className="form-control"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold small">Assigned Instructor</label>
              <select
                className="form-select"
                value={editFormData.instructorId}
                onChange={(e) => setEditFormData({ ...editFormData, instructorId: e.target.value })}
                required
              >
                <option value="">Select Instructor...</option>
                {instructors.map((ins) => (
                  <option key={ins.user?.id || ins.user?._id || ins.id} value={ins.user?.id || ins.user?._id || ins.id}>
                    {ins.user?.fullName || ins.fullName} ({ins.specialization || 'Instructor'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-4">
              <label className="form-label fw-semibold small">Training Start Date</label>
              <input
                type="date"
                className="form-control"
                value={editFormData.startDate}
                onChange={(e) => setEditFormData({ ...editFormData, startDate: e.target.value })}
                required
              />
            </div>
            <div className="col-sm-4">
              <label className="form-label fw-semibold small">Training End Date</label>
              <input
                type="date"
                className="form-control"
                value={editFormData.endDate}
                onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value })}
                required
              />
            </div>
            <div className="col-sm-4">
              <label className="form-label fw-semibold small">Capacity (Seats)</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={editFormData.capacity}
                onChange={(e) => setEditFormData({ ...editFormData, capacity: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold small">Cohort Status</label>
            <select
              className="form-select"
              value={editFormData.status}
              onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
            >
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
