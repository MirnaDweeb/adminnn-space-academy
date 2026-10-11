import apiClient from './apiClient';

/**
 * Fetch authenticated user's notifications.
 */
export async function getMineNotifications(params = {}) {
  const response = await apiClient.get('/notifications/mine', { params });
  return response.data.data;
}

/**
 * Mark a single notification as read (owner only).
 */
export async function markNotificationRead(id) {
  const response = await apiClient.patch(`/notifications/${id}/read`);
  return response.data.data;
}

/**
 * Mark all authenticated user's notifications as read.
 */
export async function markAllNotificationsRead() {
  const response = await apiClient.patch('/notifications/mark-all-read');
  return response.data.data;
}

/**
 * Admin: List notifications with division scoping and filters.
 */
export async function listAdminNotifications(params = {}) {
  const response = await apiClient.get('/admin/notifications', { params });
  return response.data.data;
}

/**
 * Super Admin: Get official email service configuration.
 */
export async function getEmailConfig() {
  const response = await apiClient.get('/admin/notifications/email-config');
  return response.data.data.config;
}

/**
 * Super Admin: Update official email service configuration.
 */
export async function updateEmailConfig(payload) {
  const response = await apiClient.patch('/admin/notifications/email-config', payload);
  return response.data.data.config;
}

/**
 * Admin: Preview recipients for broadcast announcement.
 */
export async function previewBroadcastRecipients(params = {}) {
  const response = await apiClient.get('/admin/notifications/broadcast-preview', { params });
  return response.data.data;
}

/**
 * Admin: Send targeted broadcast announcement to cohort, program, or division.
 */
export async function broadcastAnnouncement(payload) {
  const response = await apiClient.post('/admin/notifications/broadcast', payload);
  return response.data.data;
}

/**
 * Admin: Safe retry for a failed email dispatch on an existing notification record.
 */
export async function retryNotificationEmail(notificationId) {
  const response = await apiClient.post(`/admin/notifications/${notificationId}/retry-email`);
  return response.data.data;
}

/**
 * Admin: Send individual message to an authorized student via in-app and/or email.
 */
export async function sendStudentMessage(payload) {
  const response = await apiClient.post('/admin/notifications/message-student', payload);
  return response.data.data;
}

/**
 * Admin: Send personalized feedback completion reminder to a student before certificate delivery.
 */
export async function sendFeedbackReminder(payload) {
  const response = await apiClient.post('/admin/notifications/feedback-reminder', payload);
  return response.data.data;
}

export default {
  getMineNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAdminNotifications,
  getEmailConfig,
  updateEmailConfig,
  previewBroadcastRecipients,
  broadcastAnnouncement,
  retryNotificationEmail,
  sendStudentMessage,
  sendFeedbackReminder,
};
