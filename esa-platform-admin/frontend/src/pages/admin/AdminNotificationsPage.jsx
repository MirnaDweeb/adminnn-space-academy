import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  listAdminNotifications,
  getEmailConfig,
  updateEmailConfig,
} from '../../services/api/notificationService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FilterBar from '../../components/common/FilterBar';
import SearchBar from '../../components/common/SearchBar';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const TYPE_META = {
  APPLICATION_DECISION: { label: 'Application Decision', icon: 'fa-file-signature', badge: 'bg-purple-900/50 text-purple-300 border-purple-700/50' },
  PAYMENT_CONFIRMED: { label: 'Payment Confirmed', icon: 'fa-receipt', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  PAYMENT_EXPIRED: { label: 'Payment Expired', icon: 'fa-clock-rotate-left', badge: 'bg-rose-900/50 text-rose-300 border-rose-700/50' },
  ENROLLMENT_WAITLISTED: { label: 'Waitlisted', icon: 'fa-hourglass-half', badge: 'bg-amber-900/50 text-amber-300 border-amber-700/50' },
  ENROLLMENT_PROMOTED: { label: 'Waitlist Promoted', icon: 'fa-arrow-up-right-dots', badge: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50' },
  EVALUATION_PUBLISHED: { label: 'Evaluation Result', icon: 'fa-chart-pie', badge: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50' },
  CERTIFICATE_ISSUED: { label: 'Certificate Issued', icon: 'fa-award', badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50' },
  CERTIFICATE_REVOKED: { label: 'Certificate Revoked', icon: 'fa-ban', badge: 'bg-red-900/50 text-red-300 border-red-700/50' },
};

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const params = useParams();

  // Division scoping
  const division = params.division || ROLE_TO_DIVISION[user?.role];
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [selectedDivision, setSelectedDivision] = useState(division || '');

  // Detail Modal
  const [selectedNotif, setSelectedNotif] = useState(null);

  // Email Config (Super Admin only)
  const [emailConfig, setEmailConfig] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configForm, setConfigForm] = useState({
    senderName: '',
    senderEmail: '',
    globalEmailEnabled: true,
    enabledTypes: {},
  });

  const loadNotifications = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const queryParams = {
        page,
        limit: 15,
        search: search.trim() || undefined,
        type: typeFilter || undefined,
        read: readFilter !== '' ? readFilter : undefined,
      };

      if (isSuperAdmin) {
        if (selectedDivision && selectedDivision !== 'all') {
          queryParams.division = selectedDivision;
        }
      } else if (division) {
        queryParams.division = division;
      }

      const data = await listAdminNotifications(queryParams);
      setNotifications(data.notifications || []);
      setPagination(data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load notifications log');
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    if (!isSuperAdmin) return;
    try {
      const cfg = await getEmailConfig();
      setEmailConfig(cfg);
      setConfigForm({
        senderName: cfg.senderName || '',
        senderEmail: cfg.senderEmail || '',
        globalEmailEnabled: cfg.globalEmailEnabled ?? true,
        enabledTypes: { ...(cfg.enabledTypes || {}) },
      });
    } catch (err) {
      console.error('Failed to load email config:', err);
    }
  };

  useEffect(() => {
    loadNotifications(1);
    loadConfig();
  }, [search, typeFilter, readFilter, selectedDivision]);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      setConfigSaving(true);
      const updated = await updateEmailConfig(configForm);
      setEmailConfig(updated);
      setShowConfigModal(false);
    } catch (err) {
      alert(`Failed to save config: ${err.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const columns = [
    {
      header: 'Recipient',
      render: (item) => (
        <div>
          <div className="fw-semibold text-white">{item.recipient?.fullName || 'N/A'}</div>
          <div className="text-muted small">{item.recipient?.email || 'N/A'}</div>
          <span className="badge bg-secondary text-xs mt-1">
            {item.recipient?.role ? item.recipient.role.replace(/_/g, ' ') : 'USER'}
          </span>
        </div>
      ),
    },
    {
      header: 'Event Type',
      render: (item) => {
        const meta = TYPE_META[item.type] || {
          label: item.type,
          icon: 'fa-bell',
          badge: 'bg-secondary text-light',
        };
        return (
          <span className={`badge border px-2 py-1 text-xs d-inline-flex align-items-center gap-1 ${meta.badge}`}>
            <i className={`fa-solid ${meta.icon}`} aria-hidden="true"></i>
            {meta.label}
          </span>
        );
      },
    },
    {
      header: 'Title & Summary',
      render: (item) => (
        <div style={{ maxWidth: '300px' }}>
          <div className="text-white text-truncate fw-medium">{item.title}</div>
          <div className="text-muted small text-truncate">{item.message}</div>
        </div>
      ),
    },
    {
      header: 'Division',
      render: (item) => (
        <span className="badge bg-secondary-subtle text-light border border-secondary text-xs">
          {item.division ? (item.division === 'PRE_UNIVERSITY' ? 'Pre-University' : 'University') : 'Cross-Division'}
        </span>
      ),
    },
    {
      header: 'In-App Status',
      render: (item) => (
        item.read ? (
          <span className="badge bg-success-subtle text-success border border-success-subtle text-xs" title={`Read at: ${new Date(item.readAt).toLocaleString()}`}>
            <i className="fa-solid fa-check me-1" aria-hidden="true"></i>
            Read
          </span>
        ) : (
          <span className="badge bg-warning-subtle text-warning border border-warning-subtle text-xs">
            <i className="fa-regular fa-envelope me-1" aria-hidden="true"></i>
            Unread
          </span>
        )
      ),
    },
    {
      header: 'Email Dispatch',
      render: (item) => (
        item.emailSent ? (
          <span className="badge bg-info-subtle text-info border border-info-subtle text-xs" title="Official email dispatched">
            <i className="fa-solid fa-paper-plane me-1" aria-hidden="true"></i>
            Sent
          </span>
        ) : item.emailError ? (
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle text-xs" title={item.emailError}>
            <i className="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>
            Failed
          </span>
        ) : (
          <span className="badge bg-secondary text-xs">Queued / N/A</span>
        )
      ),
    },
    {
      header: 'Sent Date',
      render: (item) => (
        <span className="text-muted small">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (item) => (
        <button
          type="button"
          className="btn btn-outline-primary btn-sm text-xs py-1 px-2"
          onClick={() => setSelectedNotif(item)}
          title="View Notification Details"
        >
          <i className="fa-solid fa-eye me-1" aria-hidden="true"></i>
          Details
        </button>
      ),
    },
  ];

  return (
    <div className="py-4">
      <PageHeader
        title={division ? `${DIVISION_LABELS[division]} Notification Oversight Log` : 'Platform Notification Oversight Log'}
        subtitle="Auditable record of all in-app notifications and official transactional email dispatches across the platform"
        actions={
          isSuperAdmin && (
            <button
              type="button"
              id="admin-email-config-btn"
              className="btn btn-outline-info btn-sm"
              onClick={() => setShowConfigModal(true)}
            >
              <i className="fa-solid fa-envelope-circle-check me-2" aria-hidden="true"></i>
              Email Service Configuration
            </button>
          )
        }
      />

      {/* Super Admin Email Configuration Summary Banner */}
      {isSuperAdmin && emailConfig && (
        <div className="card mb-4 bg-dark-eval border-secondary-subtle">
          <div className="card-body p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-3">
              <div className="p-2 rounded bg-primary-subtle text-primary border border-primary-subtle">
                <i className="fa-solid fa-server fs-5" aria-hidden="true"></i>
              </div>
              <div>
                <div className="fw-semibold text-white small">
                  Official Email Service: {emailConfig.senderName} ({emailConfig.senderEmail})
                </div>
                <div className="text-muted text-xs">
                  Transport: Nodemailer | Status: {emailConfig.globalEmailEnabled ? (
                    <span className="text-success fw-bold">Active (Enabled)</span>
                  ) : (
                    <span className="text-danger fw-bold">Suspended (Disabled)</span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowConfigModal(true)}
            >
              <i className="fa-solid fa-gear me-1" aria-hidden="true"></i>
              Configure Toggles
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="d-flex flex-wrap align-items-center gap-3 w-100">
          <div style={{ flex: '1 1 250px' }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by title, message, or recipient..."
            />
          </div>

          {isSuperAdmin && (
            <select
              className="form-select form-select-sm bg-dark text-white border-secondary-subtle"
              style={{ width: '180px' }}
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
            >
              <option value="">All Divisions</option>
              <option value="PRE_UNIVERSITY">Pre-University</option>
              <option value="UNIVERSITY">University</option>
            </select>
          )}

          <select
            className="form-select form-select-sm bg-dark text-white border-secondary-subtle"
            style={{ width: '200px' }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Event Types</option>
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>

          <select
            className="form-select form-select-sm bg-dark text-white border-secondary-subtle"
            style={{ width: '150px' }}
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
          >
            <option value="">All Read States</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
        </div>
      </FilterBar>

      {/* Table Area */}
      {loading ? (
        <LoadingState message="Loading notification records..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadNotifications(pagination.page)} />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notification records found"
          message="No notifications match the active filter criteria."
          icon="fa-regular fa-bell-slash"
        />
      ) : (
        <div className="card bg-dark border-secondary-subtle">
          <DataTable
            columns={columns}
            data={notifications}
            keyField="_id"
          />

          {pagination.totalPages > 1 && (
            <div className="card-footer bg-dark p-3 d-flex justify-content-between align-items-center border-secondary-subtle">
              <span className="text-muted small">
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total records)
              </span>
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => loadNotifications(pagination.page - 1)}
                >
                  <i className="fa-solid fa-chevron-left me-1" aria-hidden="true"></i>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadNotifications(pagination.page + 1)}
                >
                  Next
                  <i className="fa-solid fa-chevron-right ms-1" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedNotif && (
        <Modal
          title="Notification Audit Record"
          isOpen={true}
          onClose={() => setSelectedNotif(null)}
          size="lg"
        >
          <div className="d-flex flex-column gap-3">
            <div className="p-3 rounded bg-dark-eval border border-secondary-subtle">
              <div className="row g-2">
                <div className="col-sm-6">
                  <div className="text-muted text-xs">RECIPIENT</div>
                  <div className="fw-semibold text-white">{selectedNotif.recipient?.fullName}</div>
                  <div className="small text-muted">{selectedNotif.recipient?.email}</div>
                </div>
                <div className="col-sm-6">
                  <div className="text-muted text-xs">EVENT TYPE</div>
                  <div className="fw-semibold text-info">{selectedNotif.type}</div>
                  <div className="small text-muted">Division: {selectedNotif.division || 'N/A'}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-muted text-xs mb-1">TITLE</div>
              <div className="p-2 rounded bg-dark border border-secondary text-white fw-medium">
                {selectedNotif.title}
              </div>
            </div>

            <div>
              <div className="text-muted text-xs mb-1">MESSAGE BODY</div>
              <div className="p-3 rounded bg-dark border border-secondary text-light small" style={{ whiteSpace: 'pre-line' }}>
                {selectedNotif.message}
              </div>
            </div>

            {selectedNotif.relatedResource && (
              <div>
                <div className="text-muted text-xs mb-1">LINKED RESOURCE</div>
                <div className="p-2 rounded bg-dark border border-secondary text-muted text-xs font-monospace">
                  Type: {selectedNotif.relatedResource.resourceType} | ID: {selectedNotif.relatedResource.resourceId}
                </div>
              </div>
            )}

            <div className="row g-2">
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark border border-secondary">
                  <div className="text-muted text-xs">IN-APP READ STATUS</div>
                  <div className="text-white small">
                    {selectedNotif.read ? `Read on ${new Date(selectedNotif.readAt).toLocaleString()}` : 'Unread'}
                  </div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark border border-secondary">
                  <div className="text-muted text-xs">EMAIL DISPATCH STATUS</div>
                  <div className="text-white small">
                    {selectedNotif.emailSent ? (
                      <span className="text-success"><i className="fa-solid fa-check me-1"></i>Sent successfully</span>
                    ) : selectedNotif.emailError ? (
                      <span className="text-danger"><i className="fa-solid fa-circle-xmark me-1"></i>Failed: {selectedNotif.emailError}</span>
                    ) : (
                      <span className="text-muted">No external email record</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-muted text-xs text-end">
              Created: {new Date(selectedNotif.createdAt).toLocaleString()}
            </div>
          </div>
        </Modal>
      )}

      {/* Super Admin Email Configuration Modal */}
      {showConfigModal && (
        <Modal
          title="Official Email Service Configuration"
          isOpen={true}
          onClose={() => setShowConfigModal(false)}
        >
          <form onSubmit={handleSaveConfig} className="d-flex flex-column gap-3">
            <div className="alert alert-info py-2 small mb-0">
              <i className="fa-solid fa-circle-info me-2"></i>
              SMTP settings are securely pulled from server environment variables (never stored plaintext in database).
            </div>

            <div>
              <label htmlFor="senderName" className="form-label text-muted small">Sender Name</label>
              <input
                type="text"
                id="senderName"
                className="form-control form-control-sm bg-dark text-white border-secondary"
                value={configForm.senderName}
                onChange={(e) => setConfigForm({ ...configForm, senderName: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="senderEmail" className="form-label text-muted small">Sender Email Address</label>
              <input
                type="email"
                id="senderEmail"
                className="form-control form-control-sm bg-dark text-white border-secondary"
                value={configForm.senderEmail}
                onChange={(e) => setConfigForm({ ...configForm, senderEmail: e.target.value })}
                required
              />
            </div>

            <div className="form-check form-switch mt-2">
              <input
                type="checkbox"
                id="global-email-toggle"
                className="form-check-input"
                checked={configForm.globalEmailEnabled}
                onChange={(e) => setConfigForm({ ...configForm, globalEmailEnabled: e.target.checked })}
              />
              <label htmlFor="global-email-toggle" className="form-check-label text-white small fw-medium">
                Global Email Dispatch Enabled
              </label>
            </div>

            <div className="border-top border-secondary pt-3">
              <div className="text-muted small fw-semibold mb-2">Per-Event Email Dispatch Toggles:</div>
              <div className="d-flex flex-column gap-2">
                {Object.keys(TYPE_META).map((typeKey) => (
                  <div key={typeKey} className="form-check form-switch">
                    <input
                      type="checkbox"
                      id={`toggle-${typeKey}`}
                      className="form-check-input"
                      checked={configForm.enabledTypes[typeKey] ?? true}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          enabledTypes: {
                            ...configForm.enabledTypes,
                            [typeKey]: e.target.checked,
                          },
                        })
                      }
                    />
                    <label htmlFor={`toggle-${typeKey}`} className="form-check-label text-light text-xs">
                      {TYPE_META[typeKey]?.label || typeKey}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top border-secondary">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowConfigModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={configSaving}
              >
                {configSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
