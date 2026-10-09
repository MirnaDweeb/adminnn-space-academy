import { useEffect, useState, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS, ROLE_TO_DIVISION } from '../../constants/divisions';
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from '../../constants/permissions';
import styles from './AdminManagementPage.module.css';

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: ROLES.PRE_UNIVERSITY_ADMIN, label: 'Pre-University Admin' },
  { value: ROLES.UNIVERSITY_ADMIN, label: 'University Admin' },
];

const DIVISION_OPTIONS = [
  { value: '', label: 'All Divisions' },
  { value: DIVISIONS.PRE_UNIVERSITY, label: 'Pre-University' },
  { value: DIVISIONS.UNIVERSITY, label: 'University' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

export default function AdminManagementPage() {
  const { user: currentUser } = useAuth();
  const [administrators, setAdministrators] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals state: Create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: ROLES.PRE_UNIVERSITY_ADMIN,
    division: DIVISIONS.PRE_UNIVERSITY,
    permissions: [...ALL_PERMISSIONS],
  });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Modals state: Edit
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    role: ROLES.PRE_UNIVERSITY_ADMIN,
    division: DIVISIONS.PRE_UNIVERSITY,
    permissions: [],
    isActive: true,
  });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Status toggle confirmation
  const [confirmAdmin, setConfirmAdmin] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Detail view
  const [detailAdmin, setDetailAdmin] = useState(null);
  const [detailAuditLogs, setDetailAuditLogs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchAdministrators = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter;
      if (divisionFilter) params.division = divisionFilter;
      if (statusFilter !== '') params.isActive = statusFilter;

      const res = await adminService.listAdministrators(params);
      setAdministrators(res.data?.administrators || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message || 'Failed to load administrators');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, divisionFilter, statusFilter]);

  useEffect(() => {
    fetchAdministrators();
  }, [fetchAdministrators]);

  // Debounced search reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Create Form Handlers
  const handleRoleChangeInForm = (newRole) => {
    const boundDivision = ROLE_TO_DIVISION[newRole] || DIVISIONS.PRE_UNIVERSITY;
    setCreateForm((prev) => ({
      ...prev,
      role: newRole,
      division: boundDivision,
    }));
  };

  const toggleCreatePermission = (permKey) => {
    setCreateForm((prev) => {
      const perms = prev.permissions || [];
      if (perms.includes(permKey)) {
        return { ...prev, permissions: perms.filter((p) => p !== permKey) };
      } else {
        return { ...prev, permissions: [...perms, permKey] };
      }
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
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
      await adminService.createAdministrator(createForm);
      setIsCreateOpen(false);
      setCreateForm({
        fullName: '',
        email: '',
        password: '',
        role: ROLES.PRE_UNIVERSITY_ADMIN,
        division: DIVISIONS.PRE_UNIVERSITY,
        permissions: [...ALL_PERMISSIONS],
      });
      fetchAdministrators();
    } catch (err) {
      setCreateError(err.message || 'Failed to create administrator');
    } finally {
      setCreateLoading(false);
    }
  };

  // Edit Handlers
  const handleOpenEdit = (admin) => {
    setEditAdmin(admin);
    setEditError('');
    setEditForm({
      fullName: admin.fullName || '',
      email: admin.email || '',
      role: admin.role || ROLES.PRE_UNIVERSITY_ADMIN,
      division: admin.division || DIVISIONS.PRE_UNIVERSITY,
      permissions: Array.isArray(admin.permissions) ? [...admin.permissions] : [...ALL_PERMISSIONS],
      isActive: admin.isActive !== false,
    });
    setIsEditOpen(true);
  };

  const toggleEditPermission = (permKey) => {
    setEditForm((prev) => {
      const perms = prev.permissions || [];
      if (perms.includes(permKey)) {
        return { ...prev, permissions: perms.filter((p) => p !== permKey) };
      } else {
        return { ...prev, permissions: [...perms, permKey] };
      }
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editAdmin) return;
    setEditError('');

    // Self-elevation guard
    const isSelf = String(editAdmin.id || editAdmin._id) === String(currentUser?._id || currentUser?.id);
    if (isSelf) {
      setEditError('Self-elevation protected: You cannot alter your own administrative permissions.');
      return;
    }

    setEditLoading(true);
    try {
      await adminService.updateAdministrator(editAdmin.id, editForm);
      setIsEditOpen(false);
      setEditAdmin(null);
      fetchAdministrators();
    } catch (err) {
      setEditError(err.message || 'Failed to update administrator');
    } finally {
      setEditLoading(false);
    }
  };

  // Status Toggle Handlers
  const handleConfirmStatusToggle = async () => {
    if (!confirmAdmin) return;
    setStatusLoading(true);
    try {
      await adminService.updateAdministratorStatus(confirmAdmin.id, !confirmAdmin.isActive);
      setConfirmAdmin(null);
      fetchAdministrators();
    } catch (err) {
      alert(err.message || 'Failed to update administrator status');
    } finally {
      setStatusLoading(false);
    }
  };

  // Detail View Handlers
  const handleOpenDetail = async (admin) => {
    setIsDetailOpen(true);
    setDetailAdmin(admin);
    setDetailLoading(true);
    try {
      const res = await adminService.getAdministrator(admin.id);
      setDetailAdmin(res.administrator);
      setDetailAuditLogs(res.auditLogs || []);
    } catch (err) {
      setDetailAuditLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Helper formatting
  const getInitials = (name) => {
    if (!name) return 'A';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const formatRoleLabel = (role) => {
    if (role === ROLES.PRE_UNIVERSITY_ADMIN) return 'Pre-University Admin';
    if (role === ROLES.UNIVERSITY_ADMIN) return 'University Admin';
    if (role === ROLES.SUPER_ADMIN) return 'Super Admin';
    return role?.replace(/_/g, ' ') || 'Admin';
  };

  // Summary Metrics calculated from list or meta
  const totalCount = meta?.total ?? administrators.length;
  const activeCount = administrators.filter((a) => a.isActive).length;
  const inactiveCount = administrators.filter((a) => !a.isActive).length;

  const columns = [
    {
      key: 'administrator',
      label: 'Administrator',
      render: (row) => (
        <div className={styles.userCell}>
          <div className={styles.avatar}>{getInitials(row.fullName)}</div>
          <div>
            <div className={styles.userName}>{row.fullName}</div>
            <div className={styles.userEmail}>{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) => (
        <span className={styles.roleTag}>
          <i className="fa-solid fa-shield-halved me-1 text-secondary" aria-hidden="true"></i>
          {formatRoleLabel(row.role)}
        </span>
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
          {DIVISION_LABELS[row.division] || row.division || 'Global'}
        </span>
      ),
    },
    {
      key: 'permissions',
      label: 'Permissions',
      render: (row) => {
        const permsCount = row.permissions?.length ?? 0;
        if (permsCount === 0) {
          return <span className="badge bg-secondary-subtle text-secondary">Default (All)</span>;
        }
        return (
          <span className="badge bg-info-subtle text-info border border-info-subtle" title={`${permsCount} permissions assigned`}>
            <i className="fa-solid fa-key me-1"></i>{permsCount} Granted
          </span>
        );
      },
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
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => {
        const isSelf = String(row.id || row._id) === String(currentUser?._id || currentUser?.id);
        return (
          <div className={styles.actionBtns}>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => handleOpenDetail(row)}
              title="View Details & Audit"
            >
              <i className="fa-solid fa-eye me-1" aria-hidden="true"></i>Details
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => handleOpenEdit(row)}
              title={isSelf ? 'Self-elevation protected' : 'Edit Administrator & Permissions'}
              disabled={isSelf}
            >
              <i className="fa-solid fa-user-pen me-1" aria-hidden="true"></i>Edit
            </button>
            <button
              type="button"
              className={`btn btn-sm ${row.isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
              onClick={() => setConfirmAdmin(row)}
              title={row.isActive ? 'Deactivate Administrator' : 'Activate Administrator'}
              disabled={isSelf}
            >
              <i className={`fa-solid ${row.isActive ? 'fa-user-slash' : 'fa-user-check'} me-1`} aria-hidden="true"></i>
              {row.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Administrator Management & Permissions"
        subtitle="Provision division administrators, configure granular operational permissions, and audit platform security."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreateError('');
              setIsCreateOpen(true);
            }}
          >
            <i className="fa-solid fa-user-plus me-1" aria-hidden="true"></i>
            Create Administrator
          </button>
        }
      />

      {/* Summary KPI Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconNavy}`}>
            <i className="fa-solid fa-user-shield" aria-hidden="true"></i>
          </div>
          <div>
            <div className={styles.summaryLabel}>Total Admins</div>
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

      {/* Filter & Search Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.searchWrap}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search administrator by name or email..."
          />
        </div>
        <div className={styles.filterGroup}>
          <FilterBar
            filters={[
              {
                name: 'division',
                value: divisionFilter,
                onChange: (val) => {
                  setDivisionFilter(val);
                  setPage(1);
                },
                options: DIVISION_OPTIONS,
              },
              {
                name: 'role',
                value: roleFilter,
                onChange: (val) => {
                  setRoleFilter(val);
                  setPage(1);
                },
                options: ROLE_OPTIONS,
              },
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
      {loading && !administrators.length ? (
        <LoadingState message="Loading administrators..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAdministrators} />
      ) : (
        <DataTable
          columns={columns}
          rows={administrators}
          emptyTitle="No administrators found"
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

      {/* CREATE ADMINISTRATOR MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => !createLoading && setIsCreateOpen(false)}
        title="Provision New Administrator"
        subtitle="Create a division administrator account with direct scope and permission assignment."
        size="lg"
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
                'Create Administrator'
              )}
            </button>
          </>
        }
      >
        {createError && <div className="alert alert-danger py-2 mb-3">{createError}</div>}
        <form onSubmit={handleCreateSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Full Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Dr. Ayman Mahmoud"
                value={createForm.fullName}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
                minLength={2}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Email Address <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. ayman.admin@esa.dev"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Initial Password <span className="text-danger">*</span>
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="Minimum 8 characters"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                required
                minLength={8}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Administrative Role <span className="text-danger">*</span>
              </label>
              <select
                className="form-select"
                value={createForm.role}
                onChange={(e) => handleRoleChangeInForm(e.target.value)}
              >
                <option value={ROLES.PRE_UNIVERSITY_ADMIN}>Pre-University Admin</option>
                <option value={ROLES.UNIVERSITY_ADMIN}>University Admin</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>
                Granular Permissions ({createForm.permissions?.length || 0} selected)
              </label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none"
                  onClick={() => setCreateForm((prev) => ({ ...prev, permissions: [...ALL_PERMISSIONS] }))}
                >
                  Select All
                </button>
                <span className="text-muted">|</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none text-muted"
                  onClick={() => setCreateForm((prev) => ({ ...prev, permissions: [] }))}
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className={styles.permContainer}>
              {PERMISSION_GROUPS.map((grp) => (
                <div key={grp.group} className="mb-2">
                  <div className={styles.permGroupTitle}>{grp.group}</div>
                  <div className="row g-2">
                    {grp.permissions.map((p) => {
                      const checked = createForm.permissions?.includes(p.key);
                      return (
                        <div key={p.key} className="col-sm-6">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`create_perm_${p.key}`}
                              checked={checked}
                              onChange={() => toggleCreatePermission(p.key)}
                            />
                            <label className="form-check-label" htmlFor={`create_perm_${p.key}`} style={{ fontSize: '0.82rem' }}>
                              {p.label}
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* EDIT ADMINISTRATOR & PERMISSIONS MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => !editLoading && setIsEditOpen(false)}
        title={`Edit Administrator: ${editAdmin?.fullName || ''}`}
        subtitle="Update identity, role, and granular platform authority."
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setIsEditOpen(false)}
              disabled={editLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleEditSubmit}
              disabled={editLoading}
            >
              {editLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Saving Changes...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </>
        }
      >
        {editError && <div className="alert alert-danger py-2 mb-3">{editError}</div>}
        <form onSubmit={handleEditSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Full Name
              </label>
              <input
                type="text"
                className="form-control"
                value={editForm.fullName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Email Address
              </label>
              <input
                type="email"
                className="form-control"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Role
              </label>
              <select
                className="form-select"
                value={editForm.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  const boundDivision = ROLE_TO_DIVISION[newRole] || DIVISIONS.PRE_UNIVERSITY;
                  setEditForm((prev) => ({ ...prev, role: newRole, division: boundDivision }));
                }}
              >
                <option value={ROLES.PRE_UNIVERSITY_ADMIN}>Pre-University Admin</option>
                <option value={ROLES.UNIVERSITY_ADMIN}>University Admin</option>
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Account Status
              </label>
              <select
                className="form-select"
                value={String(editForm.isActive)}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.value === 'true' }))}
              >
                <option value="true">Active</option>
                <option value="false">Disabled / Inactive</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>
                Granular Permissions ({editForm.permissions?.length || 0} granted)
              </label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none"
                  onClick={() => setEditForm((prev) => ({ ...prev, permissions: [...ALL_PERMISSIONS] }))}
                >
                  Grant All
                </button>
                <span className="text-muted">|</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none text-muted"
                  onClick={() => setEditForm((prev) => ({ ...prev, permissions: [] }))}
                >
                  Revoke All
                </button>
              </div>
            </div>
            <div className={styles.permContainer}>
              {PERMISSION_GROUPS.map((grp) => (
                <div key={grp.group} className="mb-2">
                  <div className={styles.permGroupTitle}>{grp.group}</div>
                  <div className="row g-2">
                    {grp.permissions.map((p) => {
                      const checked = editForm.permissions?.includes(p.key);
                      return (
                        <div key={p.key} className="col-sm-6">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`edit_perm_${p.key}`}
                              checked={checked}
                              onChange={() => toggleEditPermission(p.key)}
                            />
                            <label className="form-check-label" htmlFor={`edit_perm_${p.key}`} style={{ fontSize: '0.82rem' }}>
                              {p.label}
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* CONFIRM STATUS TOGGLE MODAL */}
      <ConfirmModal
        isOpen={!!confirmAdmin}
        onClose={() => setConfirmAdmin(null)}
        onConfirm={handleConfirmStatusToggle}
        title={confirmAdmin?.isActive ? 'Deactivate Administrator' : 'Activate Administrator'}
        confirmText={confirmAdmin?.isActive ? 'Deactivate Account' : 'Activate Account'}
        confirmTone={confirmAdmin?.isActive ? 'danger' : 'success'}
        icon={confirmAdmin?.isActive ? 'fa-user-slash' : 'fa-user-check'}
        loading={statusLoading}
        message={
          confirmAdmin?.isActive ? (
            <>
              Are you sure you want to deactivate <strong>{confirmAdmin?.fullName}</strong>?
              <br />
              <br />
              This account will immediately lose access and be rejected on login with a 403 Forbidden status.
            </>
          ) : (
            <>
              Are you sure you want to reactivate <strong>{confirmAdmin?.fullName}</strong>?
              <br />
              <br />
              This administrator will regain system access to manage their assigned division.
            </>
          )
        }
      />

      {/* ADMINISTRATOR DETAIL & AUDIT MODAL */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={detailAdmin?.fullName || 'Administrator Details'}
        subtitle={detailAdmin?.email}
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsDetailOpen(false)}>
            Close
          </button>
        }
      >
        {detailLoading ? (
          <LoadingState message="Loading administrator details & audit log..." />
        ) : (
          <div>
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>Account Profile</div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Full Name:</div>
                <div className={styles.detailValue}>{detailAdmin?.fullName}</div>
              </div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Email Address:</div>
                <div className={styles.detailValue}>{detailAdmin?.email}</div>
              </div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Role:</div>
                <div className={styles.detailValue}>{formatRoleLabel(detailAdmin?.role)}</div>
              </div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Division Scope:</div>
                <div className={styles.detailValue}>
                  {DIVISION_LABELS[detailAdmin?.division] || detailAdmin?.division || 'Global'}
                </div>
              </div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Account Status:</div>
                <div className={styles.detailValue}>
                  <StatusBadge status={detailAdmin?.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </div>
              </div>
              <div className={styles.detailRow}>
                <div className={styles.detailKey}>Provisioned At:</div>
                <div className={styles.detailValue}>
                  {detailAdmin?.createdAt ? new Date(detailAdmin.createdAt).toLocaleString() : '—'}
                </div>
              </div>
              {detailAdmin?.createdBy && (
                <div className={styles.detailRow}>
                  <div className={styles.detailKey}>Provisioned By:</div>
                  <div className={styles.detailValue}>
                    {detailAdmin.createdBy.fullName || detailAdmin.createdBy.email || 'Super Admin'}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <div className="fw-semibold text-secondary small mb-2">Granted Permissions ({detailAdmin?.permissions?.length || 0}):</div>
                {detailAdmin?.permissions && detailAdmin.permissions.length > 0 ? (
                  <div className="d-flex flex-wrap gap-1">
                    {detailAdmin.permissions.map((p) => (
                      <span key={p} className={styles.permBadge}>
                        <i className="fa-solid fa-check me-1 text-success"></i>{p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted small">Default Full Division Permissions (Unrestricted)</span>
                )}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>
                <i className="fa-solid fa-clock-rotate-left me-1" aria-hidden="true"></i>
                Audit Trail ({detailAuditLogs.length})
              </div>
              {detailAuditLogs.length === 0 ? (
                <div className="text-secondary small py-2">No audit records found for this account.</div>
              ) : (
                <div className="table-responsive">
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Timestamp</th>
                        <th>Division</th>
                        <th>Reason / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailAuditLogs.map((log) => (
                        <tr key={log._id}>
                          <td>
                            <span className="badge bg-secondary-subtle text-secondary font-monospace">
                              {log.action}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                          </td>
                          <td>{log.division || '—'}</td>
                          <td>{log.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
