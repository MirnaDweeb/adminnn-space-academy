import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  listAdminNotifications,
  getEmailConfig,
  updateEmailConfig,
  previewBroadcastRecipients,
  broadcastAnnouncement,
  retryNotificationEmail,
  sendStudentMessage,
  sendFeedbackReminder,
} from '../../services/api/notificationService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import styles from './AdminNotificationsPage.module.css';

const TYPE_META = {
  APPLICATION_DECISION: {
    label: 'Application Decision',
    icon: 'fa-file-signature',
    badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle',
  },
  PAYMENT_CONFIRMED: {
    label: 'Payment Confirmed',
    icon: 'fa-receipt',
    badgeClass: 'bg-success-subtle text-success border border-success-subtle',
  },
  PAYMENT_EXPIRED: {
    label: 'Payment Expired',
    icon: 'fa-clock-rotate-left',
    badgeClass: 'bg-warning-subtle text-warning border border-warning-subtle',
  },
  ENROLLMENT_WAITLISTED: {
    label: 'Waitlisted',
    icon: 'fa-hourglass-half',
    badgeClass: 'bg-info-subtle text-info border border-info-subtle',
  },
  ENROLLMENT_PROMOTED: {
    label: 'Waitlist Promoted',
    icon: 'fa-arrow-up-right-dots',
    badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle',
  },
  EVALUATION_PUBLISHED: {
    label: 'Evaluation Result',
    icon: 'fa-chart-pie',
    badgeClass: 'bg-indigo-subtle text-indigo border border-indigo-subtle',
  },
  CERTIFICATE_ISSUED: {
    label: 'Certificate Issued',
    icon: 'fa-award',
    badgeClass: 'bg-success-subtle text-success border border-success-subtle',
  },
  CERTIFICATE_REVOKED: {
    label: 'Certificate Revoked',
    icon: 'fa-ban',
    badgeClass: 'bg-danger-subtle text-danger border border-danger-subtle',
  },
  GENERAL_ANNOUNCEMENT: {
    label: 'Broadcast Announcement',
    icon: 'fa-bullhorn',
    badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle',
  },
  STUDENT_MESSAGE: {
    label: 'Student Message',
    icon: 'fa-envelope',
    badgeClass: 'bg-info-subtle text-info border border-info-subtle',
  },
  FEEDBACK_REMINDER: {
    label: 'Feedback Reminder',
    icon: 'fa-clipboard-question',
    badgeClass: 'bg-warning-subtle text-warning border border-warning-subtle',
  },
};

function sanitizeRecipientName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Enrolled Student';
  // Strip repeated/duplicate '(Verified)' suffixes that were appended during test script runs
  const cleaned = fullName.replace(/(\s*\((?:Verified|Test)\))+/gi, '').trim();
  return cleaned || fullName;
}

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
  const [emailStatusFilter, setEmailStatusFilter] = useState('');
  const [selectedDivision, setSelectedDivision] = useState(division || '');

  // Detail Modal
  const [selectedNotif, setSelectedNotif] = useState(null);

  // Email Retry & Action Toast state
  const [retryingEmailId, setRetryingEmailId] = useState(null);
  const [actionToast, setActionToast] = useState(null);

  // Individual Student Messaging Modal state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTarget, setMessageTarget] = useState(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageChannels, setMessageChannels] = useState({ inApp: true, email: true });
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [messageSuccess, setMessageSuccess] = useState('');

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

  // Broadcast Announcement Modal State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastPreviewLoading, setBroadcastPreviewLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastSuccess, setBroadcastSuccess] = useState('');
  const [broadcastPreview, setBroadcastPreview] = useState(null);
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    targetType: 'ALL_ENROLLED',
    programId: '',
    cohortId: '',
  });

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('template') === 'certificate' || searchParams.get('action') === 'broadcast') {
      setShowBroadcastModal(true);
      if (searchParams.get('template') === 'certificate') {
        setBroadcastForm((prev) => ({
          ...prev,
          title: 'Your Training Certificate Is Ready',
          message:
            'Congratulations! Your official Egyptian Space Agency training certificate has been generated and is ready for collection and digital verification.',
          targetType: 'ELIGIBLE_CERTIFICATES',
        }));
      }
    }
  }, [searchParams]);

  const loadNotifications = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError(null);
        const queryParams = {
          page,
          limit: 15,
          search: search.trim() || undefined,
          type: typeFilter || undefined,
          read: readFilter !== '' ? readFilter : undefined,
          emailStatus: emailStatusFilter || undefined,
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
        setError(err.message || 'Failed to load notifications oversight log');
      } finally {
        setLoading(false);
      }
    },
    [search, typeFilter, readFilter, emailStatusFilter, selectedDivision, division, isSuperAdmin]
  );

  const loadConfig = useCallback(async () => {
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
  }, [isSuperAdmin]);

  useEffect(() => {
    loadNotifications(1);
    loadConfig();
  }, [loadNotifications, loadConfig]);

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

  const handlePreviewRecipients = async () => {
    try {
      setBroadcastPreviewLoading(true);
      setBroadcastError('');
      const params = {
        targetType: broadcastForm.targetType,
        cohortId: broadcastForm.cohortId || undefined,
        programId: broadcastForm.programId || undefined,
        division: selectedDivision || division,
      };
      const res = await previewBroadcastRecipients(params);
      setBroadcastPreview(res);
    } catch (err) {
      setBroadcastError(err.response?.data?.message || err.message || 'Failed to preview recipients.');
    } finally {
      setBroadcastPreviewLoading(false);
    }
  };

  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    try {
      setBroadcastLoading(true);
      setBroadcastError('');
      const payload = {
        title: broadcastForm.title,
        message: broadcastForm.message,
        targetType: broadcastForm.targetType,
        cohortId: broadcastForm.cohortId || undefined,
        programId: broadcastForm.programId || undefined,
        division: selectedDivision || division,
      };
      const res = await broadcastAnnouncement(payload);
      setBroadcastSuccess(res.message || `Announcement sent to ${res.sentCount} students.`);
      setTimeout(() => {
        setShowBroadcastModal(false);
        setBroadcastSuccess('');
        setBroadcastPreview(null);
        setBroadcastForm({
          title: '',
          message: '',
          targetType: 'ALL_ENROLLED',
          programId: '',
          cohortId: '',
        });
        loadNotifications(1);
      }, 1200);
    } catch (err) {
      setBroadcastError(err.response?.data?.message || err.message || 'Failed to deliver broadcast announcement.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleRetryEmail = async (notifItem) => {
    try {
      setRetryingEmailId(notifItem._id);
      setActionToast(null);
      const res = await retryNotificationEmail(notifItem._id);
      setActionToast({
        type: res.success ? 'success' : 'warning',
        message: res.message || 'Email re-dispatch executed.',
      });
      if (res.notification) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === notifItem._id ? { ...n, ...res.notification } : n))
        );
        if (selectedNotif && selectedNotif._id === notifItem._id) {
          setSelectedNotif({ ...selectedNotif, ...res.notification });
        }
      }
    } catch (err) {
      setActionToast({
        type: 'danger',
        message: err.response?.data?.message || err.message || 'Failed to retry email dispatch.',
      });
    } finally {
      setRetryingEmailId(null);
    }
  };

  const handleOpenStudentMessage = (recipient) => {
    setMessageTarget(recipient);
    setMessageSubject('');
    setMessageBody('');
    setMessageChannels({ inApp: true, email: Boolean(recipient?.email) });
    setMessageError('');
    setMessageSuccess('');
    setShowMessageModal(true);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageTarget || !messageTarget._id) return;
    try {
      setMessageSending(true);
      setMessageError('');
      setMessageSuccess('');

      const res = await sendStudentMessage({
        studentId: messageTarget._id,
        title: messageSubject.trim(),
        message: messageBody.trim(),
        channels: messageChannels,
      });

      setMessageSuccess(res.message || 'Message delivered successfully.');
      setTimeout(() => {
        setShowMessageModal(false);
        setMessageSuccess('');
        loadNotifications(1);
      }, 1200);
    } catch (err) {
      setMessageError(err.response?.data?.message || err.message || 'Failed to send message.');
    } finally {
      setMessageSending(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('');
    setReadFilter('');
    setEmailStatusFilter('');
    if (isSuperAdmin) setSelectedDivision('');
  };

  const hasActiveFilters = Boolean(
    search.trim() || typeFilter || readFilter !== '' || emailStatusFilter || (isSuperAdmin && selectedDivision)
  );

  // Directly display server-side filtered and paginated records
  const displayedNotifications = notifications;

  // KPI calculations based on current dataset & pagination total
  const stats = useMemo(() => {
    const unreadCount = notifications.filter((n) => !n.read).length;
    const sentCount = notifications.filter((n) => n.emailSent).length;
    const failCount = notifications.filter((n) => n.emailError || (!n.emailSent && n.emailError !== null)).length;
    return {
      total: pagination.total,
      unread: unreadCount,
      sent: sentCount,
      failed: failCount,
    };
  }, [notifications, pagination.total]);

  // Columns definition for DataTable with key and label
  const columns = [
    {
      key: 'recipient',
      label: 'Recipient',
      render: (item) => {
        const cleanName = sanitizeRecipientName(item.recipient?.fullName);
        const isVerified =
          item.recipient?.fullName?.includes('(Verified)') ||
          item.recipient?.studentProfile?.isVerified;
        return (
          <div>
            <div className={styles.recipientName}>{cleanName}</div>
            <div className={styles.recipientMetaRow}>
              <span className={styles.recipientEmail}>
                {item.recipient?.email || 'Confidential Student'}
              </span>
              {isVerified && <span className={styles.verifiedBadge}>Verified</span>}
              {item.recipient?.role && (
                <span className={styles.roleTag}>
                  {item.recipient.role.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      label: 'Event Type',
      render: (item) => {
        const meta = TYPE_META[item.type] || {
          label: item.type?.replace(/_/g, ' ') || 'Alert',
          icon: 'fa-bell',
          badgeClass: 'bg-secondary-subtle text-secondary border border-secondary-subtle',
        };
        return (
          <span className={`badge px-2 py-1 text-xs d-inline-flex align-items-center gap-1 ${meta.badgeClass}`}>
            <i className={`fa-solid ${meta.icon}`} aria-hidden="true" />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'title',
      label: 'Notification Message',
      render: (item) => (
        <div style={{ maxWidth: '300px' }}>
          <div className={styles.notifTitle} title={item.title}>
            {item.title}
          </div>
          <div className={styles.notifMessage} title={item.message}>
            {item.message}
          </div>
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Division',
      render: (item) => (
        <span className={styles.badgeDivision}>
          {item.division
            ? item.division === 'PRE_UNIVERSITY'
              ? 'Pre-University'
              : 'University'
            : 'Cross-Division'}
        </span>
      ),
    },
    {
      key: 'inApp',
      label: 'In-App Status',
      render: (item) =>
        item.read ? (
          <span
            className={styles.badgeInAppRead}
            title={item.readAt ? `Read on ${new Date(item.readAt).toLocaleString()}` : 'Marked as read'}
          >
            <i className="fa-solid fa-check" aria-hidden="true" />
            Read
          </span>
        ) : (
          <span className={styles.badgeInAppUnread}>
            <i className="fa-regular fa-envelope" aria-hidden="true" />
            Unread
          </span>
        ),
    },
    {
      key: 'email',
      label: 'Email Dispatch',
      render: (item) => {
        if (item.emailSent) {
          return (
            <span
              className={styles.badgeEmailSent}
              title="Official email successfully dispatched via Nodemailer SMTP"
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              Sent
            </span>
          );
        }
        if (item.emailError) {
          return (
            <span
              className={styles.badgeEmailFailed}
              title={`Delivery Failure: ${item.emailError}`}
            >
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              Failed
            </span>
          );
        }
        return <span className={styles.badgeEmailNone}>In-App Only</span>;
      },
    },
    {
      key: 'date',
      label: 'Timestamp',
      render: (item) => (
        <span className={styles.dateCell}>
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div className="d-flex align-items-center gap-1 flex-wrap">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm py-0 px-2"
            onClick={() => setSelectedNotif(item)}
            id={`btn-view-notification-${item._id}`}
            title="Inspect full notification record"
          >
            <i className="fa-solid fa-eye me-1" aria-hidden="true" /> Details
          </button>
          {!item.emailSent && item.recipient?.email && (
            <button
              type="button"
              className="btn btn-outline-warning btn-sm py-0 px-2"
              disabled={retryingEmailId === item._id}
              onClick={() => handleRetryEmail(item)}
              id={`btn-resend-email-${item._id}`}
              title="Retry sending notification email"
            >
              {retryingEmailId === item._id ? (
                <i className="fa-solid fa-spinner fa-spin me-1" aria-hidden="true" />
              ) : (
                <i className="fa-solid fa-rotate-right me-1" aria-hidden="true" />
              )}
              Resend
            </button>
          )}
          {item.recipient && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-2"
              onClick={() => handleOpenStudentMessage(item.recipient)}
              id={`btn-message-student-${item._id}`}
              title="Send direct message to this student"
            >
              <i className="fa-solid fa-paper-plane me-1" aria-hidden="true" /> Message
            </button>
          )}
          {item.data?.certificateId && (
            <Link
              to={
                item.division === 'UNIVERSITY'
                  ? `/admin/university/certificates?search=${item.data.certificateId}`
                  : item.division === 'PRE_UNIVERSITY'
                  ? `/admin/pre-university/certificates?search=${item.data.certificateId}`
                  : `/admin/certificates?search=${item.data.certificateId}`
              }
              className="btn btn-outline-info btn-sm py-0 px-2"
              title="View Certificate in Registry"
            >
              <i className="fa-solid fa-certificate me-1" aria-hidden="true" /> Certificate
            </Link>
          )}
        </div>
      ),
    },
  ];

  const pageDivisionTitle = division ? DIVISION_LABELS[division] || division : 'Platform';

  return (
    <div className={styles.container}>
      {/* 1. Header */}
      <PageHeader
        title={`${pageDivisionTitle} Notification Oversight Log`}
        subtitle="Auditable record of student alerts, official email deliveries, and administrative announcements across training cohorts."
        division={division}
        actions={
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
              onClick={() => setShowBroadcastModal(true)}
              id="btn-broadcast-announcement"
            >
              <i className="fa-solid fa-bullhorn" aria-hidden="true" />
              <span>Broadcast Announcement</span>
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                id="admin-email-config-btn"
                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                onClick={() => setShowConfigModal(true)}
              >
                <i className="fa-solid fa-gear" aria-hidden="true" />
                <span>Email Configuration</span>
              </button>
            )}
          </div>
        }
      />

      {/* 2. KPI Summary Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Total Notifications</span>
            <div className={`${styles.kpiIconWrap} ${styles.iconNavy}`}>
              <i className="fa-solid fa-bell" aria-hidden="true" />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{stats.total}</span>
          </div>
          <div className={styles.kpiSubtext}>Auditable records in current scope</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>In-App Unread</span>
            <div className={`${styles.kpiIconWrap} ${styles.iconBlue}`}>
              <i className="fa-solid fa-envelope-open-text" aria-hidden="true" />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{stats.unread}</span>
          </div>
          <div className={styles.kpiSubtext}>Pending student review on active page</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Emails Dispatched</span>
            <div className={`${styles.kpiIconWrap} ${styles.iconGreen}`}>
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{stats.sent}</span>
          </div>
          <div className={styles.kpiSubtext}>Confirmed SMTP transactional dispatches</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>Delivery Failures</span>
            <div className={`${styles.kpiIconWrap} ${styles.iconRose}`}>
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{stats.failed}</span>
          </div>
          <div className={styles.kpiSubtext}>Dispatches requiring administrative retry</div>
        </div>
      </div>

      {/* 3. Super Admin Email Configuration Summary Banner */}
      {isSuperAdmin && emailConfig && (
        <div className={styles.configBanner}>
          <div className={styles.configBannerLeft}>
            <div className={styles.configIconWrap}>
              <i className="fa-solid fa-server" aria-hidden="true" />
            </div>
            <div>
              <div className={styles.configTitle}>
                Official Transactional Email Service: {emailConfig.senderName} ({emailConfig.senderEmail})
              </div>
              <div className={styles.configSubtitle}>
                Transport: Nodemailer SMTP | Status:{' '}
                {emailConfig.globalEmailEnabled ? (
                  <span className="text-success fw-bold">Active & Enabled</span>
                ) : (
                  <span className="text-danger fw-bold">Suspended (Disabled)</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => setShowConfigModal(true)}
          >
            <i className="fa-solid fa-sliders me-1" aria-hidden="true" />
            Manage Settings
          </button>
        </div>
      )}

      {/* Action Toast Alert Banner */}
      {actionToast && (
        <div
          className={`alert alert-${actionToast.type} alert-dismissible fade show d-flex align-items-center justify-content-between p-2 mb-3 small`}
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            <i
              className={`fa-solid ${
                actionToast.type === 'success'
                  ? 'fa-circle-check text-success'
                  : actionToast.type === 'danger'
                  ? 'fa-circle-exclamation text-danger'
                  : 'fa-triangle-exclamation text-warning'
              }`}
            />
            <span>{actionToast.message}</span>
          </div>
          <button
            type="button"
            className="btn-close p-2"
            aria-label="Close"
            onClick={() => setActionToast(null)}
          />
        </div>
      )}

      {/* 4. Table Card & Filter Toolbar */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeaderRow}>
          <div className={styles.tableTitleWrap}>
            <h2 className={styles.tableTitle}>Notification Records</h2>
            <span className={styles.tableCountBadge}>
              {pagination.total} {pagination.total === 1 ? 'Record' : 'Records'}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search title, message, or recipient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="input-search-notifications"
            />
          </div>

          <div className={styles.filters}>
            {isSuperAdmin && (
              <select
                className={styles.selectInput}
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                id="select-notif-division"
                aria-label="Filter by division"
              >
                <option value="">All Divisions</option>
                <option value="PRE_UNIVERSITY">Pre-University</option>
                <option value="UNIVERSITY">University</option>
              </select>
            )}

            <select
              className={styles.selectInput}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              id="select-notif-type"
              aria-label="Filter by event type"
            >
              <option value="">All Event Types</option>
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>

            <select
              className={styles.selectInput}
              value={readFilter}
              onChange={(e) => setReadFilter(e.target.value)}
              id="select-notif-read"
              aria-label="Filter by in-app read state"
            >
              <option value="">All Read States</option>
              <option value="false">Unread Only</option>
              <option value="true">Read Only</option>
            </select>

            <select
              className={styles.selectInput}
              value={emailStatusFilter}
              onChange={(e) => setEmailStatusFilter(e.target.value)}
              id="select-notif-email-status"
              aria-label="Filter by email delivery"
            >
              <option value="">All Email Statuses</option>
              <option value="SENT">Email Sent</option>
              <option value="FAILED">Email Failed</option>
              <option value="NONE">In-App Only</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className={styles.clearFilterBtn}
                onClick={handleResetFilters}
                id="btn-clear-notification-filters"
                title="Reset all search and filter criteria"
              >
                <i className="fa-solid fa-filter-circle-xmark" aria-hidden="true" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Table & States */}
        {loading ? (
          <LoadingState message="Loading notification oversight log..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadNotifications(pagination.page)} />
        ) : displayedNotifications.length === 0 ? (
          <EmptyState
            title="No Notification Records Found"
            message={
              hasActiveFilters
                ? 'No notifications match the active filter criteria. Click Reset Filters to view all records.'
                : 'No notification records exist for this division scope.'
            }
            icon="fa-regular fa-bell-slash"
          />
        ) : (
          <DataTable
            columns={columns}
            rows={displayedNotifications}
            pagination={{
              page: pagination.page,
              totalPages: pagination.totalPages,
              total: pagination.total,
              onPageChange: (p) => loadNotifications(p),
            }}
            emptyTitle="No notification records found"
            id="table-admin-notifications"
          />
        )}
      </div>

      {/* 5. Detail Inspection Modal */}
      {selectedNotif && (
        <Modal
          title="Notification Audit Record"
          isOpen={Boolean(selectedNotif)}
          onClose={() => setSelectedNotif(null)}
          size="md"
        >
          <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
            <div>
              <div className="fw-bold text-dark fs-6">
                {sanitizeRecipientName(selectedNotif.recipient?.fullName)}
              </div>
              <div className="text-muted small">
                {selectedNotif.recipient?.email || 'Confidential Student Account'}
              </div>
            </div>
            <div className="text-end">
              <span className="badge bg-secondary-subtle text-secondary me-1">
                {selectedNotif.recipient?.role?.replace(/_/g, ' ') || 'USER'}
              </span>
              <span className="badge bg-light text-dark border">
                {selectedNotif.division
                  ? selectedNotif.division.replace(/_/g, ' ')
                  : 'Cross-Division'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-light rounded border mb-3 small">
            <div className="row g-2">
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Event Type:</span>
                <div className="fw-medium text-dark">
                  {TYPE_META[selectedNotif.type]?.label || selectedNotif.type}
                </div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Creation Date:</span>
                <div className="fw-medium text-dark">
                  {new Date(selectedNotif.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">In-App Read State:</span>
                <div>
                  {selectedNotif.read ? (
                    <span className="text-success fw-medium">
                      Read {selectedNotif.readAt ? `(${new Date(selectedNotif.readAt).toLocaleString()})` : ''}
                    </span>
                  ) : (
                    <span className="text-primary fw-medium">Unread by student</span>
                  )}
                </div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Email Dispatch:</span>
                <div>
                  {selectedNotif.emailSent ? (
                    <span className="text-success fw-medium">
                      <i className="fa-solid fa-circle-check me-1" />
                      Dispatched Successfully
                    </span>
                  ) : selectedNotif.emailError ? (
                    <span className="text-danger fw-medium">
                      <i className="fa-solid fa-triangle-exclamation me-1" />
                      Dispatch Failed
                    </span>
                  ) : (
                    <span className="text-muted">In-App Only (No Email Sent)</span>
                  )}
                </div>
              </div>
            </div>

            {selectedNotif.emailError && (
              <div className="mt-2 pt-2 border-top">
                <span className="text-danger fw-semibold">Email Error Diagnostic:</span>
                <div className="p-2 bg-danger bg-opacity-10 border border-danger border-opacity-25 rounded text-danger small mt-1 font-monospace">
                  {selectedNotif.emailError}
                </div>
              </div>
            )}
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold text-dark small">Notification Subject & Title</label>
            <div className="p-2 bg-white border rounded text-dark small fw-medium">
              {selectedNotif.title}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold text-dark small">Message Body</label>
            <div
              className="p-3 bg-white border rounded small text-dark"
              style={{ minHeight: '80px', lineHeight: 1.55 }}
            >
              {selectedNotif.message}
            </div>
          </div>

          {selectedNotif.relatedResource && (
            <div className="mb-3">
              <label className="form-label fw-bold text-dark small">Linked Academy Resource</label>
              <div className="p-2 bg-light border rounded small text-dark d-flex align-items-center gap-2">
                <i className="fa-solid fa-link text-secondary" />
                <span>
                  <strong>Type:</strong> {selectedNotif.relatedResource.resourceType} |{' '}
                  <strong>ID:</strong>{' '}
                  <span className="font-monospace">{selectedNotif.relatedResource.resourceId}</span>
                </span>
              </div>
            </div>
          )}

          <div className="d-flex justify-content-between align-items-center pt-3 border-top mt-3">
            <div className="d-flex gap-2">
              {!selectedNotif.emailSent && selectedNotif.recipient?.email && (
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  disabled={retryingEmailId === selectedNotif._id}
                  onClick={() => handleRetryEmail(selectedNotif)}
                >
                  {retryingEmailId === selectedNotif._id ? (
                    <i className="fa-solid fa-spinner fa-spin me-1" />
                  ) : (
                    <i className="fa-solid fa-rotate-right me-1" />
                  )}
                  Resend Email
                </button>
              )}
              {selectedNotif.recipient && (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => {
                    const recipient = selectedNotif.recipient;
                    setSelectedNotif(null);
                    handleOpenStudentMessage(recipient);
                  }}
                >
                  <i className="fa-solid fa-paper-plane me-1" /> Message Student
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedNotif(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* 6. Email Configuration Modal (Super Admin only) */}
      {isSuperAdmin && (
        <Modal
          title="Official Email Service Configuration"
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          size="md"
        >
          <form onSubmit={handleSaveConfig}>
            <div className="mb-3">
              <label className="form-label text-dark fw-bold small">Official Sender Name</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={configForm.senderName}
                onChange={(e) => setConfigForm({ ...configForm, senderName: e.target.value })}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label text-dark fw-bold small">Official Sender Email</label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={configForm.senderEmail}
                onChange={(e) => setConfigForm({ ...configForm, senderEmail: e.target.value })}
                required
              />
            </div>

            <div className="mb-3 form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="globalEmailSwitch"
                checked={configForm.globalEmailEnabled}
                onChange={(e) =>
                  setConfigForm({ ...configForm, globalEmailEnabled: e.target.checked })
                }
              />
              <label className="form-check-label text-dark fw-semibold small" htmlFor="globalEmailSwitch">
                Global Transactional Email Dispatch Enabled
              </label>
            </div>

            <div className="border-top pt-3 mb-3">
              <label className="form-label text-dark fw-bold small mb-2">
                Category Delivery Toggles
              </label>
              <div className="row g-2">
                {Object.entries(TYPE_META).map(([typeKey, typeMeta]) => (
                  <div key={typeKey} className="col-12 col-sm-6">
                    <div className="form-check form-switch small">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`switch-${typeKey}`}
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
                      <label className="form-check-label text-dark" htmlFor={`switch-${typeKey}`}>
                        {typeMeta.label}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 border-top pt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowConfigModal(false)}
                disabled={configSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={configSaving}
              >
                {configSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 7. Broadcast Announcement Modal */}
      <Modal
        title="Broadcast Academy Announcement"
        isOpen={showBroadcastModal}
        onClose={() => {
          setShowBroadcastModal(false);
          setBroadcastError('');
          setBroadcastSuccess('');
        }}
        size="md"
      >
        <form onSubmit={handleSendBroadcast}>
          {broadcastError && <div className="alert alert-danger py-2 small">{broadcastError}</div>}
          {broadcastSuccess && <div className="alert alert-success py-2 small">{broadcastSuccess}</div>}

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Target Audience</label>
            <select
              className="form-select form-select-sm"
              value={broadcastForm.targetType}
              onChange={(e) => {
                setBroadcastForm({ ...broadcastForm, targetType: e.target.value });
                setBroadcastPreview(null);
              }}
            >
              <option value="ALL_ENROLLED">All Enrolled Candidates in Scope</option>
              <option value="ELIGIBLE_CERTIFICATES">Candidates with Passing Evaluations</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Announcement Title</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g. Schedule Update or Lab Safety Guidelines"
              value={broadcastForm.title}
              onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Announcement Message</label>
            <textarea
              className="form-control form-control-sm"
              rows={4}
              placeholder="Provide clear institutional instructions..."
              value={broadcastForm.message}
              onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
              required
            />
          </div>

          {/* Recipient preview check */}
          <div className="mb-3 p-2 bg-light border rounded small d-flex justify-content-between align-items-center">
            <div>
              <span className="text-secondary fw-semibold">Targeted Students: </span>
              {broadcastPreviewLoading ? (
                <span className="text-muted">Calculating...</span>
              ) : broadcastPreview ? (
                <span className="text-primary fw-bold">{broadcastPreview.count} Students</span>
              ) : (
                <span className="text-muted">Click to preview count</span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-2"
              onClick={handlePreviewRecipients}
              disabled={broadcastPreviewLoading}
            >
              Preview Audience
            </button>
          </div>

          <div className="d-flex justify-content-end gap-2 border-top pt-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowBroadcastModal(false)}
              disabled={broadcastLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={broadcastLoading}
            >
              {broadcastLoading ? 'Delivering...' : 'Send Broadcast'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 8. Individual Student Messaging Modal */}
      <Modal
        title="Send Individual Student Message"
        isOpen={showMessageModal}
        onClose={() => {
          setShowMessageModal(false);
          setMessageError('');
          setMessageSuccess('');
        }}
        size="md"
      >
        <form onSubmit={handleSendMessage}>
          {messageError && <div className="alert alert-danger py-2 small">{messageError}</div>}
          {messageSuccess && <div className="alert alert-success py-2 small">{messageSuccess}</div>}

          {messageTarget && (
            <div className="p-3 mb-3 bg-light border rounded small">
              <div className="d-flex align-items-center justify-content-between mb-1">
                <span className="fw-bold text-dark">
                  {sanitizeRecipientName(messageTarget.fullName)}
                </span>
                <span className="badge bg-secondary-subtle text-secondary border">
                  {messageTarget.role ? messageTarget.role.replace(/_/g, ' ') : 'STUDENT'}
                </span>
              </div>
              <div className="text-muted d-flex align-items-center gap-2">
                <i className="fa-regular fa-envelope" />
                <span>{messageTarget.email || 'No email registered'}</span>
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Delivery Channels</label>
            <div className="d-flex gap-3">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="channel-inapp"
                  checked={messageChannels.inApp}
                  onChange={(e) =>
                    setMessageChannels((prev) => ({ ...prev, inApp: e.target.checked }))
                  }
                />
                <label className="form-check-label small" htmlFor="channel-inapp">
                  In-App Notification
                </label>
              </div>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="channel-email"
                  checked={messageChannels.email}
                  disabled={!messageTarget?.email}
                  onChange={(e) =>
                    setMessageChannels((prev) => ({ ...prev, email: e.target.checked }))
                  }
                />
                <label className="form-check-label small" htmlFor="channel-email">
                  Official Email {!messageTarget?.email && '(Unavailable)'}
                </label>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Subject</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g. Important Update Regarding Your Cohort Participation"
              value={messageSubject}
              onChange={(e) => setMessageSubject(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label text-dark fw-bold small">Message Body</label>
            <textarea
              className="form-control form-control-sm"
              rows={4}
              placeholder="Type your official administrative message..."
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              required
            />
          </div>

          <div className="d-flex justify-content-end gap-2 border-top pt-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowMessageModal(false)}
              disabled={messageSending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={messageSending || (!messageChannels.inApp && !messageChannels.email)}
            >
              {messageSending ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-1" /> Sending...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane me-1" /> Send Message
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
