const Notification = require('../models/Notification');
const OfficialEmailConfiguration = require('../models/OfficialEmailConfiguration');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { ROLES } = require('../constants/roles');

// GET /api/notifications/mine (authenticated user's own notifications)
const getMineNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, read, type } = req.query;

  const query = { recipient: req.user._id };

  if (typeof read !== 'undefined' && read !== '') {
    query.read = read === 'true' || read === true;
  }

  if (type && type.trim()) {
    query.type = type.trim();
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ read: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipient: req.user._id, read: false }),
  ]);

  sendSuccess(res, 200, {
    notifications,
    unreadCount,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// PATCH /api/notifications/:id/read (mark notification as read - owner only)
const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  // Owner verification
  if (notification.recipient.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You do not have permission to modify this notification');
  }

  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }

  const unreadCount = await Notification.countDocuments({ recipient: req.user._id, read: false });

  sendSuccess(res, 200, {
    notification,
    unreadCount,
  });
});

// PATCH /api/notifications/mark-all-read (mark all own notifications as read)
const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );

  sendSuccess(res, 200, {
    modifiedCount: result.modifiedCount || 0,
    unreadCount: 0,
  });
});

// GET /api/admin/notifications (division-scoped oversight log - read-only)
const listAdminNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, read, search, division } = req.query;

  const query = {};

  // Division scoping logic
  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (division && division !== 'all') {
      query.division = division;
    }
  } else {
    // Division admins can only see notifications within their own division
    if (!req.scopeDivision || req.scopeDivision === 'all') {
      throw ApiError.forbidden('Division scope required');
    }
    if (division && division !== 'all' && division !== req.scopeDivision) {
      throw ApiError.forbidden("You cannot access another division's notifications");
    }
    query.division = req.scopeDivision;
  }


  if (type && type.trim()) {
    query.type = type.trim();
  }

  if (typeof read !== 'undefined' && read !== '') {
    query.read = read === 'true' || read === true;
  }

  if (search && search.trim()) {
    const term = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id');

    query.$or = [
      { title: { $regex: term, $options: 'i' } },
      { message: { $regex: term, $options: 'i' } },
      { recipient: { $in: matchingUsers.map((u) => u._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .populate('recipient', 'fullName email role phone studentProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Notification.countDocuments(query),
  ]);

  sendSuccess(res, 200, {
    notifications,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});

// GET /api/admin/notifications/email-config (Super Admin only)
const getEmailConfigAdmin = asyncHandler(async (req, res) => {
  const config = await OfficialEmailConfiguration.getOrCreateConfig();
  sendSuccess(res, 200, { config });
});

// PATCH /api/admin/notifications/email-config (Super Admin only)
const updateEmailConfigAdmin = asyncHandler(async (req, res) => {
  const { senderName, senderEmail, globalEmailEnabled, enabledTypes } = req.body;

  const config = await OfficialEmailConfiguration.getOrCreateConfig();

  if (senderName && senderName.trim()) {
    config.senderName = senderName.trim();
  }
  if (senderEmail && senderEmail.trim()) {
    config.senderEmail = senderEmail.trim().toLowerCase();
  }
  if (typeof globalEmailEnabled === 'boolean') {
    config.globalEmailEnabled = globalEmailEnabled;
  }
  if (enabledTypes && typeof enabledTypes === 'object') {
    config.enabledTypes = { ...config.enabledTypes, ...enabledTypes };
  }

  config.updatedBy = req.user._id;
  await config.save();

  sendSuccess(res, 200, { config });
});

module.exports = {
  getMineNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAdminNotifications,
  getEmailConfigAdmin,
  updateEmailConfigAdmin,
};
