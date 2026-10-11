const Notification = require('../models/Notification');
const OfficialEmailConfiguration = require('../models/OfficialEmailConfiguration');
const User = require('../models/User');
const Cohort = require('../models/Cohort');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Evaluation = require('../models/Evaluation');
const Feedback = require('../models/Feedback');
const { sendEmail, wrapEmailHtml } = require('../services/notificationService');
const { recordAudit } = require('../services/auditService');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { ROLES } = require('../constants/roles');
const { ROLE_TO_DIVISION } = require('../constants/divisions');
const { NOTIFICATION_TYPE } = require('../constants/notifications');

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
  const { page = 1, limit = 20, type, read, search, division, emailStatus } = req.query;

  const andClauses = [];

  // Division scoping logic
  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (division && division !== 'all' && division !== 'ALL') {
      andClauses.push({ division });
    }
  } else {
    // Division admins can only see notifications within their own division
    if (!req.scopeDivision || req.scopeDivision === 'all') {
      throw ApiError.forbidden('Division scope required');
    }
    if (division && division !== 'all' && division !== req.scopeDivision) {
      throw ApiError.forbidden("You cannot access another division's notifications");
    }
    andClauses.push({ division: req.scopeDivision });
  }

  if (type && type.trim()) {
    andClauses.push({ type: type.trim() });
  }

  if (typeof read !== 'undefined' && read !== '') {
    const isRead = read === 'true' || read === true;
    andClauses.push({ read: isRead });
  }

  if (emailStatus && emailStatus.trim()) {
    const statusUpper = emailStatus.trim().toUpperCase();
    if (statusUpper === 'SENT') {
      andClauses.push({ emailSent: true });
    } else if (statusUpper === 'FAILED') {
      andClauses.push({
        $or: [
          { emailError: { $ne: null } },
          { emailSent: false, emailError: { $exists: true, $ne: null } },
        ],
      });
    } else if (statusUpper === 'NONE' || statusUpper === 'IN_APP') {
      andClauses.push({
        emailSent: false,
        $or: [{ emailError: null }, { emailError: { $exists: false } }],
      });
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id');

    andClauses.push({
      $or: [
        { title: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } },
        { recipient: { $in: matchingUsers.map((u) => u._id) } },
      ],
    });
  }

  const query = andClauses.length > 0 ? { $and: andClauses } : {};

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

// Helper to resolve broadcast recipient users based on parameters
async function resolveRecipients({ cohortId, programId, targetType = 'ALL_ENROLLED', user, scopeDivision }) {
  let division = scopeDivision;
  if (user.role !== ROLES.SUPER_ADMIN) {
    division = scopeDivision || ROLE_TO_DIVISION[user.role] || user.division;
  }

  let recipients = [];

  if (cohortId) {
    const cohort = await Cohort.findById(cohortId).populate('program');
    if (!cohort) throw ApiError.notFound('Cohort not found');

    if (user.role !== ROLES.SUPER_ADMIN && cohort.division !== division) {
      throw ApiError.forbidden('You cannot broadcast to a cohort outside your division');
    }

    if (targetType === 'ELIGIBLE_CERTIFICATES') {
      const passEvals = await Evaluation.find({ cohort: cohortId, outcome: 'PASS' }).populate(
        'student',
        'fullName email division'
      );
      recipients = passEvals.map((e) => e.student).filter(Boolean);
    } else {
      // ALL_ENROLLED in this cohort
      const enrollments = await Enrollment.find({
        cohort: cohortId,
        status: { $in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] },
      }).populate('student', 'fullName email division');
      recipients = enrollments.map((e) => e.student).filter(Boolean);
    }
  } else if (programId) {
    const program = await Course.findById(programId);
    if (!program) throw ApiError.notFound('Program not found');

    if (user.role !== ROLES.SUPER_ADMIN && program.division !== division) {
      throw ApiError.forbidden('You cannot broadcast to a program outside your division');
    }

    if (targetType === 'ELIGIBLE_CERTIFICATES') {
      const passEvals = await Evaluation.find({ program: programId, outcome: 'PASS' }).populate(
        'student',
        'fullName email division'
      );
      recipients = passEvals.map((e) => e.student).filter(Boolean);
    } else {
      const enrollments = await Enrollment.find({
        program: programId,
        status: { $in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] },
      }).populate('student', 'fullName email division');
      recipients = enrollments.map((e) => e.student).filter(Boolean);
    }
  } else {
    // Cross-program students in division
    const userQuery = { role: ROLES.STUDENT, isActive: true };
    if (division && division !== 'all' && division !== 'ALL') {
      userQuery.division = division;
    }
    recipients = await User.find(userQuery).select('fullName email division');
  }

  // Deduplicate by _id
  const uniqueMap = new Map();
  recipients.forEach((r) => {
    if (r && r._id) uniqueMap.set(String(r._id), r);
  });

  return Array.from(uniqueMap.values());
}

// GET /api/admin/notifications/broadcast-preview
const previewBroadcastRecipientsAdmin = asyncHandler(async (req, res) => {
  const { cohortId, programId, targetType } = req.query;
  const recipients = await resolveRecipients({
    cohortId,
    programId,
    targetType,
    user: req.user,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, {
    count: recipients.length,
    recipients: recipients.map((r) => ({
      _id: r._id,
      fullName: r.fullName,
      email: r.email,
      division: r.division,
    })),
  });
});

// POST /api/admin/notifications/broadcast
const broadcastAnnouncementAdmin = asyncHandler(async (req, res) => {
  const {
    cohortId,
    programId,
    targetType = 'ALL_ENROLLED',
    title,
    message,
    notificationType = 'GENERAL_ANNOUNCEMENT',
  } = req.body;

  if (!title || !title.trim()) {
    throw ApiError.badRequest('Announcement title is required');
  }
  if (!message || !message.trim()) {
    throw ApiError.badRequest('Announcement message is required');
  }

  const recipients = await resolveRecipients({
    cohortId,
    programId,
    targetType,
    user: req.user,
    scopeDivision: req.scopeDivision,
  });

  if (recipients.length === 0) {
    return sendSuccess(res, 200, {
      sentCount: 0,
      totalTargeted: 0,
      message: 'No eligible recipients currently match this selection.',
    });
  }

  const createdNotifications = [];
  for (const rec of recipients) {
    try {
      const notif = await Notification.create({
        recipient: rec._id,
        type: notificationType,
        title: title.trim(),
        message: message.trim(),
        division: rec.division,
        read: false,
      });
      createdNotifications.push(notif);

      // Best effort email
      await sendEmail({
        to: rec.email,
        subject: `[Egyptian Space Agency Academy] ${title.trim()}`,
        text: message.trim(),
        type: notificationType,
        division: rec.division,
        notificationId: notif._id,
      });
    } catch (err) {
      // Continue loop for other recipients
    }
  }

  await recordAudit({
    user: req.user,
    action: 'ANNOUNCEMENT_BROADCASTED',
    resource: 'Notification',
    division: req.scopeDivision || req.user.division,
    after: {
      title,
      targetType,
      cohortId,
      programId,
      recipientsCount: createdNotifications.length,
    },
    reason: `Announcement broadcasted to ${createdNotifications.length} students by ${req.user.role} ${req.user.fullName}`,
  });

  sendSuccess(res, 200, {
    sentCount: createdNotifications.length,
    totalTargeted: recipients.length,
    message: `Announcement successfully delivered to ${createdNotifications.length} recipients.`,
  });
});

// POST /api/admin/notifications/:id/retry-email
const retryNotificationEmailAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const notif = await Notification.findById(id).populate('recipient', 'fullName email division role');
  if (!notif) {
    throw ApiError.notFound('Notification audit record not found');
  }

  // Division access control
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const adminDiv = req.scopeDivision || req.user.division;
    if (notif.division && notif.division !== adminDiv) {
      throw ApiError.forbidden("You cannot retry notification dispatch outside your authorized division");
    }
  }

  if (!notif.recipient || !notif.recipient.email) {
    throw ApiError.badRequest('Notification recipient does not have a registered email address');
  }

  // Safe retry sending email using existing service
  const result = await sendEmail({
    to: notif.recipient.email,
    subject: `[Egyptian Space Agency Academy] ${notif.title}`,
    text: notif.message,
    type: notif.type,
    division: notif.division,
    notificationId: notif._id,
  });

  const updatedNotif = await Notification.findById(id).populate('recipient', 'fullName email division role');

  await recordAudit({
    user: req.user,
    action: 'NOTIFICATION_EMAIL_RETRIED',
    resource: 'Notification',
    resourceId: notif._id,
    division: notif.division || req.scopeDivision || req.user.division,
    after: {
      emailSent: updatedNotif.emailSent,
      emailError: updatedNotif.emailError,
      recipientEmail: notif.recipient.email,
    },
    reason: `Email dispatch retried by ${req.user.role} ${req.user.fullName}: Result ${result.success ? 'Success' : 'Failure'}`,
  });

  sendSuccess(res, 200, {
    success: result.success,
    notification: updatedNotif,
    message: result.success
      ? 'Email successfully dispatched to student SMTP recipient.'
      : `Email dispatch failed: ${result.error || 'SMTP delivery error'}`,
  });
});

// POST /api/admin/notifications/message-student
const sendStudentMessageAdmin = asyncHandler(async (req, res) => {
  const {
    studentId,
    title,
    message,
    channels = { inApp: true, email: true },
    relatedResource = null,
  } = req.body;

  if (!studentId) {
    throw ApiError.badRequest('Student recipient ID is required');
  }
  if (!title || !title.trim()) {
    throw ApiError.badRequest('Message subject/title is required');
  }
  if (!message || !message.trim()) {
    throw ApiError.badRequest('Message body content is required');
  }

  const student = await User.findById(studentId);
  if (!student || student.role !== ROLES.STUDENT) {
    throw ApiError.notFound('Valid student recipient record not found');
  }

  // Division access control
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const adminDiv = req.scopeDivision || req.user.division;
    if (student.division && student.division !== adminDiv) {
      const hasEnrollmentInDivision = await Enrollment.exists({
        student: student._id,
        division: adminDiv,
      });
      if (!hasEnrollmentInDivision) {
        throw ApiError.forbidden("You cannot message a student outside your authorized division");
      }
    }
  }

  const inAppWanted = channels.inApp !== false;
  const emailWanted = channels.email !== false;

  if (!inAppWanted && !emailWanted) {
    throw ApiError.badRequest('At least one delivery channel (in-app or email) must be selected');
  }

  let createdNotification = null;
  if (inAppWanted) {
    createdNotification = await Notification.create({
      recipient: student._id,
      type: NOTIFICATION_TYPE.STUDENT_MESSAGE,
      title: title.trim(),
      message: message.trim(),
      division: student.division || req.scopeDivision,
      relatedResource: relatedResource && relatedResource.resourceType && relatedResource.resourceId ? {
        resourceType: relatedResource.resourceType,
        resourceId: relatedResource.resourceId,
      } : null,
      read: false,
    });
  }

  let emailResult = { success: false, reason: 'NOT_REQUESTED' };
  if (emailWanted && student.email) {
    emailResult = await sendEmail({
      to: student.email,
      subject: `[Egyptian Space Agency Academy] ${title.trim()}`,
      text: message.trim(),
      type: NOTIFICATION_TYPE.STUDENT_MESSAGE,
      division: student.division || req.scopeDivision,
      notificationId: createdNotification ? createdNotification._id : null,
    });
  }

  await recordAudit({
    user: req.user,
    action: 'STUDENT_MESSAGED',
    resource: 'Notification',
    resourceId: createdNotification ? createdNotification._id : undefined,
    division: student.division || req.scopeDivision || req.user.division,
    after: {
      studentId: student._id,
      studentName: student.fullName,
      studentEmail: student.email,
      title: title.trim(),
      inAppSent: inAppWanted,
      emailSent: emailResult.success,
      emailError: emailResult.error || null,
    },
    reason: `Direct message dispatched to student ${student.fullName} by ${req.user.role} ${req.user.fullName}`,
  });

  const finalNotification = createdNotification
    ? await Notification.findById(createdNotification._id).populate('recipient', 'fullName email division role')
    : null;

  sendSuccess(res, 201, {
    message: `Message dispatched successfully to ${student.fullName}.`,
    notification: finalNotification,
    emailResult,
  });
});

// POST /api/admin/notifications/feedback-reminder
const sendFeedbackReminderAdmin = asyncHandler(async (req, res) => {
  const { studentId, cohortId, force = false } = req.body;

  if (!studentId || !cohortId) {
    throw ApiError.badRequest('Student ID and Cohort ID are required to send a feedback reminder');
  }

  const [student, cohort] = await Promise.all([
    User.findById(studentId),
    Cohort.findById(cohortId).populate('program'),
  ]);

  if (!student || student.role !== ROLES.STUDENT) {
    throw ApiError.notFound('Student record not found');
  }
  if (!cohort) {
    throw ApiError.notFound('Cohort record not found');
  }

  // Division access control
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    const adminDiv = req.scopeDivision || req.user.division;
    if (cohort.division !== adminDiv) {
      throw ApiError.forbidden('You cannot manage feedback reminders outside your division');
    }
  }

  // 1. Check real backend feedback submission status in Feedback collection
  const existingFeedback = await Feedback.findOne({
    student: student._id,
    cohort: cohort._id,
  });
  if (existingFeedback) {
    throw ApiError.badRequest(
      `Student has already completed and submitted the required feedback for ${cohort.name || cohort.cohortNumber} on ${new Date(existingFeedback.submittedAt).toLocaleDateString()}.`
    );
  }

  // 2. Duplicate reminder guard (within 24 hours)
  if (!force) {
    const recentReminder = await Notification.findOne({
      recipient: student._id,
      type: NOTIFICATION_TYPE.FEEDBACK_REMINDER,
      'relatedResource.resourceId': cohort._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recentReminder) {
      throw ApiError.badRequest(
        `A feedback reminder was already sent to this student on ${new Date(recentReminder.createdAt).toLocaleString()}. To avoid repeated reminders, please allow adequate time before sending another.`
      );
    }
  }

  const programName = cohort.program?.title || cohort.name || 'Academy Training Program';
  const clientBase = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
  const feedbackUrl = `${clientBase}/student/cohorts?openFeedback=${cohort._id}`;

  const title = `Complete Your Program Feedback to Receive Your Certificate`;
  const message = `Hello ${student.fullName},\n\nCongratulations on reaching this stage of your program.\n\nPlease complete the required feedback form for "${programName}" using your academy account. Once your feedback is submitted and all certificate eligibility requirements are satisfied, your certificate can proceed through the academy's certificate issuance process.\n\nComplete your feedback here: ${feedbackUrl}\n\nIf you have already completed the feedback form, please check your account or contact the academy administrator if your completion status has not been updated.\n\nEgyptian Space Agency Academy`;

  const notification = await Notification.create({
    recipient: student._id,
    type: NOTIFICATION_TYPE.FEEDBACK_REMINDER,
    title,
    message,
    division: cohort.division || student.division,
    relatedResource: {
      resourceType: 'Cohort',
      resourceId: cohort._id,
    },
    read: false,
  });

  // Transactional Email dispatch
  const emailResult = await sendEmail({
    to: student.email,
    subject: `[Egyptian Space Agency Academy] ${title}`,
    text: message,
    html: wrapEmailHtml({
      title: 'Complete Your Program Feedback',
      contentHtml: `
        <p>Hello <strong>${student.fullName}</strong>,</p>
        <p>Congratulations on reaching this stage of your training in <strong>${programName}</strong>.</p>
        <div class="card" style="border-left-color: #3b82f6;">
          <p style="margin: 0;"><strong>Program:</strong> ${programName}</p>
          <p style="margin: 4px 0;"><strong>Cohort:</strong> ${cohort.cohortNumber}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #f59e0b;">Feedback Required for Certificate Issuance</span></p>
        </div>
        <p>Please take a few moments to provide your candid evaluation of the curriculum and instruction. Once your feedback is submitted and all certificate eligibility requirements are satisfied, your institutional certificate can proceed through the academy's certificate issuance process.</p>
      `,
      actionUrl: feedbackUrl,
      actionText: 'Submit Program Feedback',
    }),
    type: NOTIFICATION_TYPE.FEEDBACK_REMINDER,
    division: cohort.division || student.division,
    notificationId: notification._id,
  });

  await recordAudit({
    user: req.user,
    action: 'FEEDBACK_REMINDER_SENT',
    resource: 'Notification',
    resourceId: notification._id,
    division: cohort.division || student.division,
    after: {
      studentId: student._id,
      cohortId: cohort._id,
      programName,
      emailSent: emailResult.success,
    },
    reason: `Certificate feedback reminder sent to ${student.fullName} by ${req.user.role} ${req.user.fullName}`,
  });

  const populated = await Notification.findById(notification._id).populate('recipient', 'fullName email division role');

  sendSuccess(res, 201, {
    message: `Feedback reminder delivered to ${student.fullName}.`,
    notification: populated,
    emailResult,
  });
});

module.exports = {
  getMineNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAdminNotifications,
  getEmailConfigAdmin,
  updateEmailConfigAdmin,
  previewBroadcastRecipientsAdmin,
  broadcastAnnouncementAdmin,
  retryNotificationEmailAdmin,
  sendStudentMessageAdmin,
  sendFeedbackReminderAdmin,
};
