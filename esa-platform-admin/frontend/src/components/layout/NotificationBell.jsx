import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
import { ROLES } from '../../constants/roles';
import { ROLE_TO_DIVISION } from '../../constants/divisions';
import styles from './NotificationBell.module.css';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const bellButtonRef = useRef(null);

  const isAdmin = Boolean(
    user?.role === ROLES.SUPER_ADMIN ||
    user?.role === ROLES.PRE_UNIVERSITY_ADMIN ||
    user?.role === ROLES.UNIVERSITY_ADMIN
  );

  // Determine active division for admin navigation
  const adminDivision = user?.division || (user?.role && ROLE_TO_DIVISION[user.role]);
  const oversightLogRoute =
    user?.role === ROLES.SUPER_ADMIN
      ? '/admin/notifications'
      : adminDivision
      ? `/admin/${adminDivision}/notifications`
      : '/admin/notifications';

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getMineNotifications({ limit: 8 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch and auto-refresh listeners
  useEffect(() => {
    fetchNotifications();

    const handleUpdate = () => {
      fetchNotifications();
    };

    window.addEventListener('notifications-updated', handleUpdate);
    // Background polling every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);

    return () => {
      window.removeEventListener('notifications-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation: Escape key closes dropdown and focuses bell button
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen((prev) => !prev);
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
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
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      await handleMarkAsRead(item._id);
    }
    setIsOpen(false);
    const targetRoute = getNotificationTargetRoute(item, user, adminDivision);
    if (targetRoute) {
      navigate(targetRoute);
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={bellButtonRef}
        type="button"
        id="notification-bell-btn"
        className={`${styles.bellBtn} ${isOpen ? styles.active : ''}`}
        onClick={handleToggle}
        title="Personal Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <i className="fa-solid fa-bell" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={styles.badge}
            id="notification-unread-badge"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={styles.dropdown}
          id="notification-dropdown-panel"
          role="dialog"
          aria-label="Notifications Dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className={styles.unreadChip}>{unreadCount} unread</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                id="mark-all-notifications-read-btn"
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
                title="Mark all notifications as read"
              >
                <i className="fa-solid fa-check-double" aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Body / List */}
          <div className={styles.list}>
            {loading && notifications.length === 0 ? (
              <div className={styles.empty}>
                <i className="fa-solid fa-spinner fa-spin fs-5 mb-2" aria-hidden="true" />
                <p>Loading notifications...</p>
              </div>
            ) : error ? (
              <div className={styles.errorBox}>
                <i className="fa-solid fa-circle-exclamation me-2 text-danger" aria-hidden="true" />
                <span>{error}</span>
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={fetchNotifications}
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <i className="fa-regular fa-bell-slash" aria-hidden="true" />
                </div>
                <p className="mb-1 fw-medium text-light">No new notifications</p>
                <span className="text-secondary small">
                  {isAdmin
                    ? 'Your personal administrator inbox is up to date.'
                    : 'Important academy alerts will appear here.'}
                </span>
              </div>
            ) : (
              notifications.map((item) => {
                const config = getNotificationConfig(item.type);
                return (
                  <div
                    key={item._id}
                    data-testid="notification-bell-item"
                    className={`${styles.item} ${!item.read ? styles.unreadItem : ''}`}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                  >
                    <div
                      className={styles.iconCol}
                      style={{
                        backgroundColor: `${config.accentColor}25`,
                        color: config.accentColor,
                      }}
                    >
                      <i className={`fa-solid ${config.icon}`} aria-hidden="true" />
                    </div>
                    <div className={styles.contentCol}>
                      <div className={styles.itemTitle}>
                        <span>{item.title}</span>
                        {!item.read && <span className={styles.dot} title="Unread" />}
                      </div>
                      <div className={styles.itemMsg}>{item.message}</div>
                      <div className={styles.itemFooter}>
                        <span>{formatRelativeTime(item.createdAt)}</span>
                        {!item.read && (
                          <button
                            type="button"
                            data-testid="notification-mark-read-btn"
                            className={styles.readBtn}
                            onClick={(e) => handleMarkAsRead(item._id, e)}
                            title="Mark as read"
                          >
                            <i className="fa-solid fa-check me-1" aria-hidden="true" />
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Role-Aware Destinations */}
          <div className={styles.footer}>
            {isAdmin ? (
              <div className={styles.adminFooterActions}>
                <Link
                  to={oversightLogRoute}
                  className={styles.viewAllLink}
                  onClick={() => setIsOpen(false)}
                  id="link-admin-oversight-log"
                >
                  <i className="fa-solid fa-list-check me-1" aria-hidden="true" />
                  <span>Notification Oversight Log</span>
                  <i className="fa-solid fa-arrow-right ms-1 text-xs" aria-hidden="true" />
                </Link>
                <Link
                  to="/notifications"
                  className={styles.subLink}
                  onClick={() => setIsOpen(false)}
                >
                  My Inbox
                </Link>
              </div>
            ) : (
              <Link
                to="/notifications"
                className={styles.viewAllLink}
                onClick={() => setIsOpen(false)}
              >
                <span>View all notifications</span>
                <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
