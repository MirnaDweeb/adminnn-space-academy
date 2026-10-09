const express = require('express');
const {
  getMineNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All notification endpoints require authentication
router.use(protect);

// Current user's notification list
router.get('/mine', getMineNotifications);

// Mark all own notifications as read
router.patch('/mark-all-read', markAllNotificationsRead);

// Mark single notification as read (owner verified in controller)
router.patch('/:id/read', markNotificationRead);

module.exports = router;
