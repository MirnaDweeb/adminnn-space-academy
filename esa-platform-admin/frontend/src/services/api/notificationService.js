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
