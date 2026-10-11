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
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS, ROLE_TO_DIVISION } from '../../constants/divisions';
import styles from './InstructorManagementPage.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

const DIVISION_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: DIVISIONS.PRE_UNIVERSITY, label: 'Pre-University' },
  { value: DIVISIONS.UNIVERSITY, label: 'University' },
];

export default function InstructorManagementPage() {
  const { division: routeDivision } = useParams();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const currentDivision = routeDivision || ROLE_TO_DIVISION[user?.role];

  const [instructors, setInstructors] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState(isSuperAdmin ? routeDivision || '' : currentDivision);
  const [page, setPage] = useState(1);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    fullName: '',
    email: '',
    password: '',
    division: currentDivision || DIVISIONS.PRE_UNIVERSITY,
    title: '',
    specialization: '',
    phone: '',
    bio: '',
  });

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editInstructor, setEditInstructor] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    fullName: '',
    title: '',
    specialization: '',
    phone: '',
    bio: '',
    division: '',
  });

  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailInstructor, setDetailInstructor] = useState(null);
  const [detailAuditLogs, setDetailAuditLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Toggle Confirm Modal
  const [confirmInstructor, setConfirmInstructor] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Course Access Sync State
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchInstructors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== '') params.isActive = statusFilter;

      const activeDivision = isSuperAdmin ? divisionFilter : currentDivision;
      const res = await adminService.listInstructors(activeDivision, params);
      setInstructors(res.data?.instructors || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message || 'Failed to load instructors');
    } finally {
      setLoading(false);
    }
  }, [currentDivision, divisionFilter, isSuperAdmin, page, search, statusFilter]);

  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setCreateForm({
      fullName: '',
      email: '',
      password: '',
      division: (isSuperAdmin ? divisionFilter : currentDivision) || DIVISIONS.PRE_UNIVERSITY,
      title: 'Space Systems Instructor',
      specialization: '',
      phone: '',
      bio: '',
    });
    setCreateError('');
    setIsCreateOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = (inst) => {
    setEditInstructor(inst);
    setEditForm({
      fullName: inst.user?.fullName || '',
      title: inst.title || '',
      specialization: inst.specialization || '',
      phone: inst.phone || '',
      bio: inst.bio || '',
      division: inst.division || DIVISIONS.PRE_UNIVERSITY,
    });
    setEditError('');
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editInstructor) return;
    setEditLoading(true);
    setEditError('');
    try {
      await adminService.updateInstructor(editInstructor._id, editForm);
      setIsEditOpen(false);
      setEditInstructor(null);
      fetchInstructors();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update instructor profile');
    } finally {
      setEditLoading(false);
    }
  };

  // Submit Create Instructor
  const handleCreateSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCreateError('');

    if (!createForm.fullName.trim() || createForm.fullName.trim().length < 2) {
      setCreateError('Full Name must be at least 2 characters');
      return;
    }
    if (!createForm.email.trim() || !/^\S+@\S+\.\S+$/.test(createForm.email.trim())) {
      setCreateError('A valid email address is required');
      return;
    }
    if (!createForm.password || createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters');
      return;
    }

    setCreateLoading(true);
    try {
      await adminService.createInstructor(createForm);
      setIsCreateOpen(false);
      fetchInstructors();
    } catch (err) {
      setCreateError(err.message || 'Failed to create instructor');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Open Detail Modal
  const handleOpenDetail = async (inst) => {
    setIsDetailOpen(true);
    setDetailInstructor(inst);
    setDetailLoading(true);
    try {
      const res = await adminService.getInstructor(inst.id || inst._id);
      setDetailInstructor(res.instructor);
      setDetailAuditLogs(res.auditLogs || []);
    } catch (err) {
      setDetailAuditLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle Status Toggle Confirmation
  const handleConfirmStatusToggle = async () => {
    if (!confirmInstructor) return;
    setStatusLoading(true);
    try {
      const newStatus = !confirmInstructor.isActive;
      await adminService.updateInstructorStatus(confirmInstructor.id || confirmInstructor._id, newStatus);
      setConfirmInstructor(null);
      fetchInstructors();
    } catch (err) {
      alert(err.message || 'Failed to update instructor status');
    } finally {
      setStatusLoading(false);
    }
  };

  // Handle Course Access Synchronization
  const handleSyncAllAccess = async () => {
    setSyncLoading(true);
    setSyncMessage('');
    try {
      const res = await adminService.syncAllInstructorsAccess();
      setSyncMessage(res.message || 'Instructor course access periods synchronized.');
      fetchInstructors();
      setTimeout(() => setSyncMessage(''), 5000);
    } catch (err) {
      alert(err.message || 'Failed to sync instructor access periods');
    } finally {
      setSyncLoading(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'IN';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const totalCount = meta?.total ?? instructors.length;
  const activeCount = instructors.filter((i) => i.isActive).length;
  const inactiveCount = instructors.filter((i) => !i.isActive).length;

  const columns = [
    {
      key: 'instructor',
      label: 'Instructor',
      render: (row) => (
        <div className={styles.userCell}>
          <div className={styles.avatar}>{getInitials(row.user?.fullName)}</div>
          <div>
            <div className={styles.userName}>{row.user?.fullName || '—'}</div>
            <div className={styles.userEmail}>{row.user?.email || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'specialization',
      label: 'Title & Specialization',
      render: (row) => (
        <div>
          <div className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>
            {row.title || 'Instructor'}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
            {row.specialization || 'Space Academy Curriculum'}
          </div>
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Assigned Division',
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
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'createdAt',
      label: 'Provisioned On',
      render: (row) => (
        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
          {row.user?.createdAt ? new Date(row.user.createdAt).toLocaleDateString() : '—'}
        </span>
      ),
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
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleOpenEdit(row)}
            title="Edit instructor profile and faculty credentials"
          >
            Edit
          </button>
          <button
            type="button"
            className={`btn btn-sm ${row.isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
            onClick={() => setConfirmInstructor(row)}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Instructor Management"
        subtitle={
          currentDivision
            ? `Manage space academy instructors assigned to ${DIVISION_LABELS[currentDivision]} division.`
            : 'Manage space academy instructors across all divisions.'
        }
        actions={
          <div className="d-flex gap-2">
            <button
              type="button"
              id="btn-sync-all-instructor-access"
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={handleSyncAllAccess}
              disabled={syncLoading}
              title="Recalculate and synchronize course-limited access windows based on active cohort assignments"
            >
              <i className={`fa-solid fa-arrows-rotate ${syncLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
              <span>{syncLoading ? 'Syncing...' : 'Sync Access Period'}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              onClick={handleOpenCreate}
            >
              <i className="fa-solid fa-user-plus" aria-hidden="true"></i>
              <span>Create Instructor</span>
            </button>
          </div>
        }
      />

      {syncMessage && (
        <div className="alert alert-success alert-dismissible fade show d-flex align-items-center gap-2 mb-3" role="alert">
          <i className="fa-solid fa-circle-check"></i>
          <div>{syncMessage}</div>
          <button type="button" className="btn-close" onClick={() => setSyncMessage('')}></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconNavy}`}>
            <i className="fa-solid fa-chalkboard-user" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Total Instructors</div>
            <div className={styles.summaryVal}>{totalCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconSuccess}`}>
            <i className="fa-solid fa-user-check" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Active Accounts</div>
            <div className={styles.summaryVal}>{activeCount}</div>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconDanger}`}>
            <i className="fa-solid fa-user-slash" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Deactivated</div>
            <div className={styles.summaryVal}>{inactiveCount}</div>
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
            placeholder="Search by instructor name or email..."
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
      {loading && !instructors.length ? (
        <LoadingState message="Loading instructors..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchInstructors} />
      ) : (
        <DataTable
          columns={columns}
          rows={instructors}
          emptyTitle="No instructors found"
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

      {/* CREATE INSTRUCTOR MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => !createLoading && setIsCreateOpen(false)}
        title="Provision New Instructor"
        subtitle="Create an instructor account with division curriculum assignment."
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={createLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleCreateSubmit}
              disabled={createLoading}
            >
              {createLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Provisioning...
                </>
              ) : (
                'Create Instructor'
              )}
            </button>
          </>
        }
      >
        {createError && <div className="alert alert-danger py-2 mb-3">{createError}</div>}
        <form onSubmit={handleCreateSubmit}>
          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Full Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Dr. Ayman Mahmoud"
              value={createForm.fullName}
              onChange={(e) => {
                const val = e.target.value;
                setCreateForm((prev) => ({ ...prev, fullName: val }));
              }}
              required
              minLength={2}
            />
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Email Address <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              className="form-control"
              placeholder="e.g. ayman.instructor@esa.dev"
              value={createForm.email}
              onChange={(e) => {
                const val = e.target.value;
                setCreateForm((prev) => ({ ...prev, email: val }));
              }}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Initial Password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              className="form-control"
              placeholder="Minimum 8 characters"
              value={createForm.password}
              onChange={(e) => {
                const val = e.target.value;
                setCreateForm((prev) => ({ ...prev, password: val }));
              }}
              required
              minLength={8}
            />
          </div>

          <div className="row g-2 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Academic Title
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Senior Space Robotics Instructor"
                value={createForm.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({ ...prev, title: val }));
                }}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Specialization
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Satellite Telecommunications"
                value={createForm.specialization}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({ ...prev, specialization: val }));
                }}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Assigned Division <span className="text-danger">*</span>
            </label>
            {isSuperAdmin && !routeDivision ? (
              <select
                className="form-select"
                value={createForm.division}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({ ...prev, division: val }));
                }}
              >
                <option value={DIVISIONS.PRE_UNIVERSITY}>Pre-University</option>
                <option value={DIVISIONS.UNIVERSITY}>University</option>
              </select>
            ) : (
              <input
                type="text"
                className="form-control bg-light"
                value={DIVISION_LABELS[createForm.division] || createForm.division}
                disabled
              />
            )}
            <div className="form-text" style={{ fontSize: '0.78rem' }}>
              {isSuperAdmin && !routeDivision
                ? 'Select the academy division where this instructor will teach.'
                : 'Instructor division is automatically bound to your administrative scope.'}
            </div>
          </div>
        </form>
      </Modal>

      {/* DETAILS & AUDIT TRAIL MODAL */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Instructor Details & Audit Trail"
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
          <LoadingState message="Loading instructor details..." />
        ) : detailInstructor ? (
          <>
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Instructor Profile</div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Full Name:</span>
                <span className={styles.detailValue}>{detailInstructor.user?.fullName}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Email Address:</span>
                <span className={styles.detailValue}>{detailInstructor.user?.email}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Academic Title:</span>
                <span className={styles.detailValue}>{detailInstructor.title || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Specialization:</span>
                <span className={styles.detailValue}>{detailInstructor.specialization || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Division Scope:</span>
                <span className={styles.detailValue}>
                  {DIVISION_LABELS[detailInstructor.division] || detailInstructor.division}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Account Status:</span>
                <span className={styles.detailValue}>
                  <StatusBadge status={detailInstructor.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Provisioned At:</span>
                <span className={styles.detailValue}>
                  {detailInstructor.user?.createdAt
                    ? new Date(detailInstructor.user.createdAt).toLocaleString()
                    : '—'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailKey}>Provisioned By:</span>
                <span className={styles.detailValue}>
                  {detailInstructor.user?.createdBy ? 'Super Admin' : 'System Initial Seed'}
                </span>
              </div>
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
                        <th>Reason / Notes</th>
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
                          <td>{log.actor?.fullName || 'System'}</td>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.division || '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--esa-text-secondary)' }}>
                            {log.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-secondary p-3 text-center" style={{ fontSize: '0.85rem' }}>
                  No historical audit entries found for this instructor.
                </div>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      {/* CONFIRM STATUS TOGGLE MODAL */}
      {confirmInstructor && (
        <ConfirmModal
          isOpen={!!confirmInstructor}
          onClose={() => !statusLoading && setConfirmInstructor(null)}
          onConfirm={handleConfirmStatusToggle}
          title={confirmInstructor.isActive ? 'Deactivate Instructor' : 'Activate Instructor'}
          message={
            confirmInstructor.isActive ? (
              <>
                Are you sure you want to deactivate{' '}
                <strong>{confirmInstructor.user?.fullName}</strong>?
                <br />
                <span className="text-danger mt-1 d-block" style={{ fontSize: '0.85rem' }}>
                  This instructor will immediately lose access and be rejected on login with a 403 Forbidden status.
                </span>
              </>
            ) : (
              <>
                Are you sure you want to reactivate{' '}
                <strong>{confirmInstructor.user?.fullName}</strong>?
                <br />
                <span className="text-success mt-1 d-block" style={{ fontSize: '0.85rem' }}>
                  This instructor will regain system access to manage assigned courses and training programs.
                </span>
              </>
            )
          }
          confirmText={confirmInstructor.isActive ? 'Deactivate Instructor' : 'Activate Instructor'}
          confirmTone={confirmInstructor.isActive ? 'danger' : 'success'}
          loading={statusLoading}
          icon={confirmInstructor.isActive ? 'fa-user-slash' : 'fa-user-check'}
        />
      )}

      {/* EDIT INSTRUCTOR MODAL */}
      {isEditOpen && (
        <Modal
          title={`Edit Instructor — ${editInstructor?.user?.fullName || ''}`}
          isOpen={isEditOpen}
          onClose={() => !editLoading && setIsEditOpen(false)}
        >
          <form onSubmit={handleSaveEdit} className="d-flex flex-column gap-3">
            {editError && <div className="alert alert-danger py-2 small mb-0">{editError}</div>}

            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-dark">Full Name *</label>
                <input
                  type="text"
                  required
                  className="form-control form-control-sm"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-dark">Academic / Professional Title</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Lead Orbital Mechanics Specialist"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
            </div>

            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-dark">Specialization / Domain</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. CubeSat Subsystems & Payloads"
                  value={editForm.specialization}
                  onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-dark">Contact Phone</label>
                <input
                  type="tel"
                  className="form-control form-control-sm"
                  placeholder="+20 100 123 4567"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>

            {isSuperAdmin && (
              <div>
                <label className="form-label small fw-semibold text-dark">Assigned Division</label>
                <select
                  className="form-select form-select-sm"
                  value={editForm.division}
                  onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}
                >
                  <option value={DIVISIONS.PRE_UNIVERSITY}>Pre-University Division</option>
                  <option value={DIVISIONS.UNIVERSITY}>University Division</option>
                </select>
              </div>
            )}

            <div>
              <label className="form-label small fw-semibold text-dark">Professional Biography</label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                placeholder="Background and research focus in space sciences..."
                value={editForm.bio}
                onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={editLoading}
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
                disabled={editLoading}
              >
                {editLoading && <i className="fa-solid fa-spinner fa-spin"></i>}
                {editLoading ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
