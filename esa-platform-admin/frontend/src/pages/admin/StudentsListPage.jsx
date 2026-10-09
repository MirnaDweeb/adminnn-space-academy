import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

export default function StudentsListPage() {
  const { division } = useParams();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Status toggle confirmation modal
  const [confirmStudent, setConfirmStudent] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter !== '') params.isActive = statusFilter;

      const divisionParam = user.role === ROLES.SUPER_ADMIN ? division : undefined;
      const res = await adminService.listStudents(divisionParam, params);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [division, page, search, statusFilter, user.role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
  };

  const handleStatusFilterChange = (val) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleConfirmToggle = async () => {
    if (!confirmStudent) return;
    setStatusLoading(true);
    try {
      const newStatus = !confirmStudent.user?.isActive;
      await adminService.updateStudentStatus(confirmStudent._id, newStatus);
      setConfirmStudent(null);
      load();
    } catch (err) {
      alert(err.message || 'Failed to update student status');
    } finally {
      setStatusLoading(false);
    }
  };

  const rows = result?.data?.students || [];

  const columns = [
    {
      key: 'fullName',
      label: 'Student',
      render: (row) => (
        <div>
          <div className="fw-semibold text-dark">{row.user?.fullName || '—'}</div>
          <div className="text-secondary" style={{ fontSize: '0.82rem' }}>{row.user?.email || '—'}</div>
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Division',
      render: (row) => (
        <span className="badge bg-light text-dark border">
          {row.division?.replace(/_/g, ' ') || '—'}
        </span>
      ),
    },
    {
      key: 'institution',
      label: 'Institution',
      render: (row) => (
        <span className="text-secondary" style={{ fontSize: '0.88rem' }}>
          {row.institution || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.user?.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => {
        const isActive = row.user?.isActive;
        return (
          <div className="d-flex align-items-center gap-2">
            <Link
              to={`/admin/${division}/students/${row._id}`}
              className="btn btn-sm btn-outline-primary"
            >
              View
            </Link>
            <button
              type="button"
              className={`btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
              onClick={() => setConfirmStudent(row)}
            >
              {isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`Students registered in ${division === 'PRE_UNIVERSITY' ? 'Pre-University' : division === 'UNIVERSITY' ? 'University' : 'Academy'} division.`}
      />

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div style={{ flex: '1 1 300px', maxWidth: '400px' }}>
          <SearchBar value={search} onChange={handleSearchChange} placeholder="Search by name or email..." />
        </div>
        <FilterBar
          filters={[
            {
              name: 'status',
              value: statusFilter,
              onChange: handleStatusFilterChange,
              options: STATUS_OPTIONS,
            },
          ]}
        />
      </div>

      {loading && !result ? (
        <LoadingState message="Loading students..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No students found"
          pagination={
            result?.meta
              ? {
                  page: result.meta.page,
                  limit: result.meta.limit,
                  total: result.meta.total,
                  totalPages: result.meta.totalPages,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}

      {/* Confirmation Modal for Quick Status Toggle */}
      {confirmStudent && (
        <ConfirmModal
          isOpen={!!confirmStudent}
          onClose={() => !statusLoading && setConfirmStudent(null)}
          onConfirm={handleConfirmToggle}
          title={confirmStudent.user?.isActive ? 'Deactivate Student' : 'Activate Student'}
          message={
            confirmStudent.user?.isActive ? (
              <>
                Are you sure you want to deactivate{' '}
                <strong>{confirmStudent.user?.fullName}</strong>?
                <br />
                <span className="text-danger mt-1 d-block" style={{ fontSize: '0.85rem' }}>
                  This student will immediately lose access and be rejected on login with a 403 Forbidden status.
                </span>
              </>
            ) : (
              <>
                Are you sure you want to reactivate{' '}
                <strong>{confirmStudent.user?.fullName}</strong>?
                <br />
                <span className="text-success mt-1 d-block" style={{ fontSize: '0.85rem' }}>
                  This student will regain system access to browse programs and view application status.
                </span>
              </>
            )
          }
          confirmText={confirmStudent.user?.isActive ? 'Deactivate Student' : 'Activate Student'}
          confirmTone={confirmStudent.user?.isActive ? 'danger' : 'success'}
          loading={statusLoading}
          icon={confirmStudent.user?.isActive ? 'fa-user-slash' : 'fa-user-check'}
        />
      )}
    </div>
  );
}
