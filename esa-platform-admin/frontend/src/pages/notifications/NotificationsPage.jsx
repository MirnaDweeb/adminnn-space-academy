import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  getMineNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../services/api/notificationService';
import {
  getNotificationConfig,
  getNotificationTargetRoute,
} from '../../utils/notificationIcons';
import PageHeader from '../../components/common/PageHeader';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRead, setFilterRead] = useState('all'); // 'all', 'unread', 'read'
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 15 });

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, limit: 15 };
      if (filterRead === 'unread') params.read = false;
      if (filterRead === 'read') params.read = true;
      if (filterType) params.type = filterType;

      const data = await getMineNotifications(params);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setPagination(data.pagination || { total: 0, totalPages: 1, limit: 15 });
    } catch (err) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [page, filterRead, filterType]);

  const handleMarkAsRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  return (
    <div className="py-4">
      <PageHeader
        title="My Notifications"
        subtitle="Stay informed about application outcomes, invoice deadlines, evaluations, and official certificates"
        actions={
          unreadCount > 0 && (
            <button
              type="button"
              id="page-mark-all-read-btn"
              className="btn btn-outline-primary btn-sm"
              onClick={handleMarkAllRead}
            >
              <i className="fa-solid fa-check-double me-2" aria-hidden="true"></i>
              Mark All as Read ({unreadCount})
            </button>
          )
        }
      />

      {/* Filter and Tab Bar */}
      <div className="card mb-4 bg-dark-eval border-secondary-subtle">
        <div className="card-body p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="btn-group btn-group-sm" role="group" aria-label="Read status filters">
            <button
              type="button"
              id="filter-tab-all"
              className={`btn ${filterRead === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilterRead('all'); setPage(1); }}
            >
              All
            </button>
            <button
              type="button"
              id="filter-tab-unread"
              className={`btn ${filterRead === 'unread' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilterRead('unread'); setPage(1); }}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
            <button
              type="button"
              id="filter-tab-read"
              className={`btn ${filterRead === 'read' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilterRead('read'); setPage(1); }}
            >
              Read
            </button>
          </div>

          <div className="d-flex align-items-center gap-2">
            <label htmlFor="filter-type" className="form-label mb-0 text-muted small">
              Type:
            </label>
            <select
              id="filter-type"
              className="form-select form-select-sm bg-dark text-white border-secondary-subtle"
              style={{ width: '200px' }}
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading && notifications.length === 0 ? (
        <LoadingState message="Loading notifications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadNotifications} />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications found"
          message={
            filterRead === 'unread'
              ? 'You have read all your notifications!'
              : 'You have not received any notifications yet.'
          }
          icon="fa-regular fa-bell-slash"
        />
      ) : (
        <div className="d-flex flex-column gap-3" id="notifications-list">
          {notifications.map((item) => {
            const meta = getNotificationConfig(item.type);
            return (
              <div
                key={item._id}
                className={`card border-secondary-subtle transition-all ${
                  !item.read
                    ? 'bg-dark-eval border-start-primary'
                    : 'bg-dark'
                }`}
                style={{
                  borderLeft: !item.read ? '4px solid #3b82f6' : undefined,
                }}
              >
                <div className="card-body p-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge border px-2 py-1 text-xs d-inline-flex align-items-center gap-1 ${meta.badgeClass}`}>
                        <i className={`fa-solid ${meta.icon}`} aria-hidden="true"></i>
                        {meta.label}
                      </span>
                      {item.division && (
                        <span className="badge bg-secondary-subtle text-light border border-secondary text-xs">
                          {item.division === 'PRE_UNIVERSITY' ? 'Pre-University' : 'University'}
                        </span>
                      )}
                      {!item.read && (
                        <span className="badge bg-primary text-white text-xs">New</span>
                      )}
                    </div>

                    <div className="d-flex align-items-center gap-3 text-muted small">
                      <span>
                        <i className="fa-regular fa-clock me-1" aria-hidden="true"></i>
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      {!item.read && (
                        <button
                          type="button"
                          className="btn btn-outline-info btn-xs py-0 px-2 text-xs"
                          onClick={() => handleMarkAsRead(item._id)}
                        >
                          <i className="fa-solid fa-check me-1" aria-hidden="true"></i>
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>

                  <h5 className="card-title text-white mb-2 fs-6 fw-semibold">
                    {item.title}
                  </h5>

                  <p className="card-text text-light-emphasis small mb-0" style={{ whiteSpace: 'pre-line' }}>
                    {item.message}
                  </p>

                  {item.relatedResource && (
                    <div className="mt-3 pt-2 border-top border-secondary-subtle d-flex justify-content-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                        onClick={() => {
                          if (!item.read) handleMarkAsRead(item._id);
                          navigate(getNotificationTargetRoute(item, user));
                        }}
                      >
                        <span>Open Related Resource</span>
                        <i className="fa-solid fa-arrow-up-right-from-square ms-1" aria-hidden="true"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top border-secondary-subtle">
              <span className="text-muted small">
                Showing page {page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="fa-solid fa-chevron-left me-1" aria-hidden="true"></i>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next

                  <i className="fa-solid fa-chevron-right ms-1" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
