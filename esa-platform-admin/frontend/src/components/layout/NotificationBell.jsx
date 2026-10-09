import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getMineNotifications({ limit: 8 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const handleUpdate = () => fetchNotifications();
    window.addEventListener('notifications-updated', handleUpdate);
    // Background polling every 30 seconds to keep unread counter fresh
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      window.removeEventListener('notifications-updated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
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
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      await handleMarkAsRead(item._id);
    }
    setIsOpen(false);
    const targetRoute = getNotificationTargetRoute(item, user);
    if (targetRoute) {
      navigate(targetRoute);
    }
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        type="button"
        id="notification-bell-btn"
        className={`${styles.bellBtn} ${isOpen ? styles.active : ''}`}
        onClick={handleToggle}
        title="Notifications"
        aria-label="Open Notifications"
      >
        <i className="fa-solid fa-bell" aria-hidden="true"></i>
        {unreadCount > 0 && (
          <span className={styles.badge} id="notification-unread-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} id="notification-dropdown-panel">
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
              >
                <i className="fa-solid fa-check-double" aria-hidden="true"></i>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {loading && notifications.length === 0 ? (
              <div className={styles.empty}>
                <i className="fa-solid fa-spinner fa-spin emptyIcon" aria-hidden="true"></i>
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <i className="fa-regular fa-bell-slash" aria-hidden="true"></i>
                </div>
                <p>No notifications yet</p>
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
                        backgroundColor: `${config.accentColor}20`,
                        color: config.accentColor,
                      }}
                    >
                      <i className={`fa-solid ${config.icon}`} aria-hidden="true"></i>
                    </div>
                    <div className={styles.contentCol}>
                      <div className={styles.itemTitle}>
                        <span>{item.title}</span>
                        {!item.read && <span className={styles.dot} title="Unread"></span>}
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
                            <i className="fa-solid fa-check me-1" aria-hidden="true"></i>
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

          <div className={styles.footer}>
            <Link
              to="/notifications"
              className={styles.viewAllLink}
              onClick={() => setIsOpen(false)}
            >
              <span>View all notifications</span>
              <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
