const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Course = require('../models/Course');
const { recordAudit } = require('./auditService');
const { sendEmail, wrapEmailHtml } = require('./notificationService');
const { INVOICE_STATUS } = require('../constants/statuses');
const { NOTIFICATION_TYPE } = require('../constants/notifications');
const { ROLES } = require('../constants/roles');
const ApiError = require('../utils/ApiError');

// Cooldown window in milliseconds (24 hours)
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Default window for "Due Soon" (in hours)
const DEFAULT_DUE_SOON_WINDOW_HOURS = 24;

/**
 * Format a Date object into a readable institutional string.
 * Example: "Saturday, 10 October 2026 at 14:30"
 */
function formatDeadlineDateTime(date) {
  if (!date) return 'Specified Deadline';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Cairo',
  }) + ' (Cairo Time)';
}

/**
 * Builds division filter for Mongoose queries based on user role and scopeDivision.
 */
function buildDivisionFilter(user, scopeDivision) {
  if (user && user.role === ROLES.SUPER_ADMIN) {
    if (scopeDivision && scopeDivision !== 'all' && scopeDivision !== 'ALL') {
      return { division: scopeDivision };
    }
    return {};
  }
  if (scopeDivision && scopeDivision !== 'all') {
    return { division: scopeDivision };
  }
  if (user && user.division) {
    return { division: user.division };
  }
  return {};
}

/**
 * GET summary KPI counts for the Payment Reminders dashboard.
 * All numbers derived live from actual database records.
 *
 * @param {Object} params
 * @param {Object} params.user
 * @param {string} params.scopeDivision
 * @param {number} [params.dueSoonWindowHours=24]
 */
async function getPaymentRemindersSummary({ user, scopeDivision, dueSoonWindowHours = DEFAULT_DUE_SOON_WINDOW_HOURS }) {
  const divFilter = buildDivisionFilter(user, scopeDivision);
  const now = new Date();
  const windowLimit = new Date(now.getTime() + dueSoonWindowHours * 60 * 60 * 1000);
  const cooldownThreshold = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Invoices Due Soon: status=PENDING, dueAt in (now, now + window]
  const dueSoonQuery = {
    ...divFilter,
    status: INVOICE_STATUS.PENDING,
    dueAt: { $gt: now, $lte: windowLimit },
  };

  // 2. Invoices Overdue: status in [PENDING, EXPIRED], dueAt <= now
  const overdueQuery = {
    ...divFilter,
    status: { $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.EXPIRED] },
    dueAt: { $lte: now },
  };

  // 3. Reminders sent within last 30 days
  const remindersSentQuery = {
    ...divFilter,
    type: { $in: [NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON, NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE] },
    createdAt: { $gte: thirtyDaysAgo },
  };

  // Execute base counts & candidate fetches
  const [
    dueSoonInvoices,
    overdueInvoices,
    remindersSentLast30Days,
    dueSoonCandidates,
    overdueCandidates,
    recentReminders,
  ] = await Promise.all([
    Invoice.countDocuments(dueSoonQuery),
    Invoice.countDocuments(overdueQuery),
    Notification.countDocuments(remindersSentQuery),
    Invoice.find(dueSoonQuery).select('_id student dueAt').lean(),
    Invoice.find(overdueQuery).select('_id student dueAt status').lean(),
    Notification.find({
      type: { $in: [NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON, NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE] },
      createdAt: { $gte: cooldownThreshold },
    }).select('recipient relatedResource.resourceId type createdAt').lean(),
  ]);

  // Build a lookup set of "studentId:invoiceId:type" currently in 24h cooldown
  const inCooldownSet = new Set();
  recentReminders.forEach((r) => {
    const studentId = r.recipient ? r.recipient.toString() : '';
    const invoiceId = r.relatedResource && r.relatedResource.resourceId ? r.relatedResource.resourceId.toString() : '';
    if (studentId && invoiceId) {
      inCooldownSet.add(`${studentId}:${invoiceId}:${r.type}`);
      // Also track general invoice cooldown
      inCooldownSet.add(`${studentId}:${invoiceId}:ANY`);
    }
  });

  // Calculate distinct eligible students for Due Soon
  const dueSoonStudentSet = new Set();
  let dueSoonEligibleInvoiceCount = 0;
  dueSoonCandidates.forEach((inv) => {
    const sId = inv.student ? inv.student.toString() : '';
    const iId = inv._id.toString();
    const isCooling = inCooldownSet.has(`${sId}:${iId}:${NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON}`) ||
                      inCooldownSet.has(`${sId}:${iId}:ANY`);
    if (!isCooling && sId) {
      dueSoonStudentSet.add(sId);
      dueSoonEligibleInvoiceCount++;
    }
  });

  // Calculate distinct eligible students for Overdue
  const overdueStudentSet = new Set();
  let overdueEligibleInvoiceCount = 0;
  overdueCandidates.forEach((inv) => {
    const sId = inv.student ? inv.student.toString() : '';
    const iId = inv._id.toString();
    const isCooling = inCooldownSet.has(`${sId}:${iId}:${NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE}`) ||
                      inCooldownSet.has(`${sId}:${iId}:ANY`);
    if (!isCooling && sId) {
      overdueStudentSet.add(sId);
      overdueEligibleInvoiceCount++;
    }
  });

  // Union of distinct students across both categories who can receive a reminder
  const allEligibleStudents = new Set([...dueSoonStudentSet, ...overdueStudentSet]);

  return {
    dueSoonInvoices,
    overdueInvoices,
    remindersSentLast30Days,
    eligibleStudentsCount: allEligibleStudents.size,
    dueSoonDistinctStudents: dueSoonStudentSet.size,
    dueSoonEligibleInvoices: dueSoonEligibleInvoiceCount,
    overdueDistinctStudents: overdueStudentSet.size,
    overdueEligibleInvoices: overdueEligibleInvoiceCount,
    cooldownWindowHours: 24,
    dueSoonWindowHours,
  };
}

/**
 * Preview eligible candidates before sending a bulk reminder batch.
 *
 * @param {Object} params
 * @param {string} params.category - 'DUE_SOON' or 'OVERDUE'
 * @param {Object} params.user
 * @param {string} params.scopeDivision
 * @param {number} [params.dueSoonWindowHours=24]
 */
async function previewPaymentReminders({
  category,
  user,
  scopeDivision,
  dueSoonWindowHours = DEFAULT_DUE_SOON_WINDOW_HOURS,
}) {
  if (!['DUE_SOON', 'OVERDUE'].includes(category)) {
    throw ApiError.badRequest('Invalid category. Must be "DUE_SOON" or "OVERDUE"');
  }

  const divFilter = buildDivisionFilter(user, scopeDivision);
  const now = new Date();
  const windowLimit = new Date(now.getTime() + dueSoonWindowHours * 60 * 60 * 1000);
  const cooldownThreshold = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const reminderType = category === 'DUE_SOON'
    ? NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON
    : NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE;

  // Determine query
  const invoiceQuery = {
    ...divFilter,
  };

  if (category === 'DUE_SOON') {
    invoiceQuery.status = INVOICE_STATUS.PENDING;
    invoiceQuery.dueAt = { $gt: now, $lte: windowLimit };
  } else {
    invoiceQuery.status = { $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.EXPIRED] };
    invoiceQuery.dueAt = { $lte: now };
  }

  // Count total excluded invoices in this division (paid or cancelled)
  const excludedCount = await Invoice.countDocuments({
    ...divFilter,
    status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED] },
  });

  // Fetch candidate invoices
  const candidateInvoices = await Invoice.find(invoiceQuery)
    .populate('student', 'fullName email phone')
    .populate('program', 'title division price')
    .sort({ dueAt: 1 })
    .lean();

  // Fetch recent reminders in cooldown
  const recentReminders = await Notification.find({
    type: reminderType,
    createdAt: { $gte: cooldownThreshold },
  }).select('recipient relatedResource.resourceId createdAt').lean();

  const cooldownSet = new Set();
  recentReminders.forEach((r) => {
    const sId = r.recipient ? r.recipient.toString() : '';
    const iId = r.relatedResource && r.relatedResource.resourceId ? r.relatedResource.resourceId.toString() : '';
    if (sId && iId) cooldownSet.add(`${sId}:${iId}`);
  });

  const readyCandidates = [];
  const skippedCooldownInvoices = [];
  const distinctStudentsSet = new Set();

  candidateInvoices.forEach((inv) => {
    const sId = inv.student ? inv.student._id.toString() : '';
    const iId = inv._id.toString();
    const inCooldown = cooldownSet.has(`${sId}:${iId}`);

    if (inCooldown) {
      skippedCooldownInvoices.push(inv);
    } else {
      readyCandidates.push(inv);
      if (sId) distinctStudentsSet.add(sId);
    }
  });

  return {
    category,
    eligibleInvoicesCount: candidateInvoices.length,
    distinctStudentsCount: distinctStudentsSet.size,
    candidateCount: readyCandidates.length,
    skippedCooldownCount: skippedCooldownInvoices.length,
    excludedCount,
    sampleCandidates: readyCandidates.slice(0, 10).map((inv) => ({
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      studentName: inv.student?.fullName || 'Unknown Student',
      studentEmail: inv.student?.email || '',
      programTitle: inv.program?.title || 'Program',
      amount: inv.amount,
      dueAt: inv.dueAt,
      status: inv.status,
      formattedDeadline: formatDeadlineDateTime(inv.dueAt),
    })),
  };
}

/**
 * Sends a single payment reminder for an eligible invoice.
 *
 * @param {Object} params
 * @param {string} params.invoiceId
 * @param {string} params.category - 'DUE_SOON' or 'OVERDUE'
 * @param {boolean} [params.force=false]
 * @param {Object} params.adminUser
 * @param {string} params.scopeDivision
 */
async function sendSinglePaymentReminder({
  invoiceId,
  category,
  force = false,
  adminUser,
  scopeDivision,
}) {
  if (!['DUE_SOON', 'OVERDUE'].includes(category)) {
    throw ApiError.badRequest('Invalid category. Must be "DUE_SOON" or "OVERDUE"');
  }

  const invoice = await Invoice.findById(invoiceId)
    .populate('student', 'fullName email phone division role')
    .populate('program', 'title division price level');

  if (!invoice) {
    throw ApiError.notFound('Invoice record not found');
  }

  // 1. Division isolation check
  if (adminUser.role !== ROLES.SUPER_ADMIN) {
    const adminDiv = scopeDivision || adminUser.division;
    if (invoice.division !== adminDiv) {
      throw ApiError.forbidden('You cannot manage invoices outside your authorized division');
    }
  }

  // 2. State & settlement checks
  if (invoice.status === INVOICE_STATUS.PAID) {
    throw ApiError.badRequest(
      `Cannot send reminder: Invoice ${invoice.invoiceNumber} has already been paid and settled.`
    );
  }
  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    throw ApiError.badRequest(
      `Cannot send reminder: Invoice ${invoice.invoiceNumber} is cancelled and no longer active.`
    );
  }

  const now = new Date();
  const deadlinePassed = invoice.dueAt <= now;

  if (category === 'DUE_SOON') {
    if (deadlinePassed) {
      throw ApiError.badRequest(
        `Payment deadline for invoice ${invoice.invoiceNumber} has already passed. Please select the "Overdue" notification category.`
      );
    }
    if (invoice.status !== INVOICE_STATUS.PENDING) {
      throw ApiError.badRequest(
        `Only pending invoices are eligible for due-soon reminders. Current status: ${invoice.status}`
      );
    }
  } else {
    // category === 'OVERDUE'
    if (!deadlinePassed) {
      throw ApiError.badRequest(
        `Payment deadline for invoice ${invoice.invoiceNumber} has not passed yet. Please select the "Due Soon" notification category.`
      );
    }
    if (invoice.status !== INVOICE_STATUS.PENDING && invoice.status !== INVOICE_STATUS.EXPIRED) {
      throw ApiError.badRequest(
        `Invoice status ${invoice.status} is not eligible for overdue reminders.`
      );
    }
  }

  const reminderType = category === 'DUE_SOON'
    ? NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON
    : NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE;

  // 3. Cooldown guard (24 hours)
  if (!force) {
    const recentReminder = await Notification.findOne({
      recipient: invoice.student._id,
      type: reminderType,
      'relatedResource.resourceId': invoice._id,
      createdAt: { $gte: new Date(Date.now() - REMINDER_COOLDOWN_MS) },
    });

    if (recentReminder) {
      throw ApiError.badRequest(
        `A ${category === 'DUE_SOON' ? 'due-soon' : 'overdue'} reminder was already sent for invoice ${invoice.invoiceNumber} on ${new Date(recentReminder.createdAt).toLocaleString()}. A 24-hour cooldown is active to prevent repeated messages.`
      );
    }
  }

  // 4. Construct content according to official ESA Academy standards
  const student = invoice.student;
  const studentName = student.fullName || 'Student';
  const programTitle = invoice.program?.title || 'Academy Program';
  const formattedDeadline = formatDeadlineDateTime(invoice.dueAt);
  const amountDue = Number(invoice.amount).toLocaleString('en-US');

  let subject = '';
  let messageText = '';
  let contentHtml = '';

  if (category === 'DUE_SOON') {
    subject = 'Payment Deadline Approaching — ESA Academy';
    messageText = `Dear ${studentName},\n\n` +
      `This is a reminder that payment for invoice ${invoice.invoiceNumber}, related to ${programTitle}, is due on ${formattedDeadline}.\n\n` +
      `Amount due: ${amountDue} EGP.\n\n` +
      `Please complete your payment before the deadline to avoid the consequences specified in the Academy's payment policy.\n\n` +
      `If you have already paid, please contact the Academy administration or disregard this reminder once your payment has been confirmed.\n\n` +
      `ESA Academy Administration`;

    contentHtml = `
      <p>Dear <strong>${studentName}</strong>,</p>
      <p>This is an official reminder that payment for invoice <strong>${invoice.invoiceNumber}</strong>, related to <strong>${programTitle}</strong>, is approaching its deadline.</p>
      <div class="card" style="border-left-color: #3A6985;">
        <p style="margin: 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
        <p style="margin: 4px 0;"><strong>Program:</strong> ${programTitle}</p>
        <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${amountDue} EGP</p>
        <p style="margin: 4px 0;"><strong>Payment Deadline:</strong> <span style="color: #DF4F4C; font-weight: 600;">${formattedDeadline}</span></p>
      </div>
      <p>Please complete your payment before the deadline to ensure your enrollment seat remains confirmed under the Academy's 72-hour payment policy.</p>
      <p style="font-size: 0.9em; color: #94a3b8;">If you have already submitted your payment, please contact the Academy administration or disregard this reminder once confirmed.</p>
    `;
  } else {
    // OVERDUE
    subject = 'Payment Deadline Passed — ESA Academy';
    const isExpired = invoice.status === INVOICE_STATUS.EXPIRED;

    messageText = `Dear ${studentName},\n\n` +
      `Our records indicate that the payment deadline for invoice ${invoice.invoiceNumber}, related to ${programTitle}, has passed.\n\n` +
      `Amount due: ${amountDue} EGP.\n\n` +
      (isExpired
        ? `Please note that this invoice is currently marked as EXPIRED under the Academy's 72-hour policy, and your seat reservation may have been released.\n\n`
        : '') +
      `Please contact the Academy administration to confirm your payment status or discuss the next steps under the Academy's payment policy.\n\n` +
      `If you have already paid, please contact the administration so your records can be checked.\n\n` +
      `ESA Academy Administration`;

    contentHtml = `
      <p>Dear <strong>${studentName}</strong>,</p>
      <p>Our records indicate that the payment deadline for invoice <strong>${invoice.invoiceNumber}</strong>, related to <strong>${programTitle}</strong>, has passed.</p>
      <div class="card" style="border-left-color: #DF4F4C;">
        <p style="margin: 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
        <p style="margin: 4px 0;"><strong>Program:</strong> ${programTitle}</p>
        <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${amountDue} EGP</p>
        <p style="margin: 4px 0;"><strong>Invoice Status:</strong> <span style="color: #DF4F4C; font-weight: 600;">${isExpired ? 'EXPIRED (Seat Released)' : 'OVERDUE (Pending Review)'}</span></p>
        <p style="margin: 4px 0;"><strong>Original Deadline:</strong> ${formattedDeadline}</p>
      </div>
      ${isExpired
        ? `<p style="color: #ef4444;"><strong>Notice:</strong> Under the Academy's 72-hour payment policy, seat reservations for expired invoices are released to waitlisted applicants. Please reach out to administration immediately if you wish to inquire about availability.</p>`
        : `<p>Please contact the Academy administration immediately to settle the outstanding balance or confirm your payment receipt.</p>`
      }
      <p style="font-size: 0.9em; color: #94a3b8;">If you have already submitted your payment, please contact the administration so your transaction records can be verified.</p>
    `;
  }

  // 5. Create in-app Notification record
  const notification = await Notification.create({
    recipient: student._id,
    type: reminderType,
    title: subject,
    message: messageText,
    division: invoice.division,
    relatedResource: {
      resourceType: 'Invoice',
      resourceId: invoice._id,
    },
    read: false,
  });

  // 6. Transactional email dispatch
  const clientBase = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
  const emailResult = await sendEmail({
    to: student.email,
    subject: `[ESA Academy] ${subject}`,
    text: messageText,
    html: wrapEmailHtml({
      title: subject,
      contentHtml,
      actionUrl: `${clientBase}/student/invoices`,
      actionText: 'View Invoice Details',
    }),
    type: reminderType,
    division: invoice.division,
    notificationId: notification._id,
  });

  // 7. Audit log entry
  await recordAudit({
    user: adminUser,
    action: 'PAYMENT_REMINDER_SENT',
    resource: 'Invoice',
    resourceId: invoice._id,
    division: invoice.division,
    after: {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      category,
      studentId: student._id,
      studentName,
      studentEmail: student.email,
      emailSent: emailResult.success,
      emailError: emailResult.error || null,
    },
    reason: `${category === 'DUE_SOON' ? 'Due-soon' : 'Overdue'} payment reminder sent for invoice ${invoice.invoiceNumber} by ${adminUser.role} ${adminUser.fullName}`,
  });

  return {
    message: `Payment reminder successfully dispatched to ${studentName} for invoice ${invoice.invoiceNumber}.`,
    notification,
    emailResult,
  };
}

/**
 * Executes a bulk payment reminder operation for all eligible invoices in the division.
 * Implements bounded processing, duplicate cooldown skipping, and robust per-item error isolation.
 *
 * @param {Object} params
 * @param {string} params.category - 'DUE_SOON' or 'OVERDUE'
 * @param {Object} params.adminUser
 * @param {string} params.scopeDivision
 * @param {number} [params.dueSoonWindowHours=24]
 */
async function sendBulkPaymentReminders({
  category,
  adminUser,
  scopeDivision,
  dueSoonWindowHours = DEFAULT_DUE_SOON_WINDOW_HOURS,
}) {
  if (!['DUE_SOON', 'OVERDUE'].includes(category)) {
    throw ApiError.badRequest('Invalid category. Must be "DUE_SOON" or "OVERDUE"');
  }

  const divFilter = buildDivisionFilter(adminUser, scopeDivision);
  const now = new Date();
  const windowLimit = new Date(now.getTime() + dueSoonWindowHours * 60 * 60 * 1000);
  const cooldownThreshold = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const reminderType = category === 'DUE_SOON'
    ? NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON
    : NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE;

  const invoiceQuery = { ...divFilter };
  if (category === 'DUE_SOON') {
    invoiceQuery.status = INVOICE_STATUS.PENDING;
    invoiceQuery.dueAt = { $gt: now, $lte: windowLimit };
  } else {
    invoiceQuery.status = { $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.EXPIRED] };
    invoiceQuery.dueAt = { $lte: now };
  }

  // Server-generated candidate list (capped at 200 per batch for safe execution)
  const candidateInvoices = await Invoice.find(invoiceQuery)
    .populate('student', 'fullName email phone division role')
    .populate('program', 'title division price level')
    .limit(200);

  let sentCount = 0;
  let skippedCooldownCount = 0;
  let failedCount = 0;
  const notifiedStudentIds = new Set();
  const results = [];

  for (const invoice of candidateInvoices) {
    try {
      // Re-verify invoice payment state right before dispatch
      if (invoice.status === INVOICE_STATUS.PAID || invoice.status === INVOICE_STATUS.CANCELLED) {
        continue;
      }

      // Check 24-hour cooldown
      const recentReminder = await Notification.findOne({
        recipient: invoice.student?._id,
        type: reminderType,
        'relatedResource.resourceId': invoice._id,
        createdAt: { $gte: cooldownThreshold },
      });

      if (recentReminder) {
        skippedCooldownCount++;
        results.push({
          invoiceNumber: invoice.invoiceNumber,
          status: 'SKIPPED_COOLDOWN',
          studentEmail: invoice.student?.email,
        });
        continue;
      }

      // Dispatch reminder
      const sendResult = await sendSinglePaymentReminder({
        invoiceId: invoice._id,
        category,
        force: false,
        adminUser,
        scopeDivision,
      });

      sentCount++;
      if (invoice.student?._id) {
        notifiedStudentIds.add(invoice.student._id.toString());
      }
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        status: 'SENT',
        emailSent: sendResult.emailResult?.success || false,
      });
    } catch (err) {
      failedCount++;
      console.error(`[BulkReminder:Error] Failed for invoice ${invoice.invoiceNumber}:`, err.message);
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        status: 'FAILED',
        error: err.message,
      });
    }
  }

  // Record bulk audit log
  await recordAudit({
    user: adminUser,
    action: 'BULK_PAYMENT_REMINDERS_SENT',
    resource: 'Invoice',
    division: scopeDivision || adminUser.division,
    after: {
      category,
      candidatesFound: candidateInvoices.length,
      sentCount,
      skippedCooldownCount,
      failedCount,
      distinctStudentsNotified: notifiedStudentIds.size,
    },
    reason: `Bulk ${category} payment reminders executed: ${sentCount} sent, ${skippedCooldownCount} skipped, ${failedCount} failed by ${adminUser.role} ${adminUser.fullName}`,
  });

  return {
    category,
    eligibleInvoicesCount: candidateInvoices.length,
    sentCount,
    skippedCooldownCount,
    failedCount,
    distinctStudentsNotified: notifiedStudentIds.size,
    results,
  };
}

/**
 * Returns paginated payment reminder notification records for the history view.
 *
 * @param {Object} params
 * @param {Object} params.query
 * @param {Object} params.user
 * @param {string} params.scopeDivision
 */
async function getPaymentRemindersHistory({ query = {}, user, scopeDivision }) {
  const { page = 1, limit = 20, category, search, emailStatus } = query;
  const divFilter = buildDivisionFilter(user, scopeDivision);

  const filter = {
    ...divFilter,
    type: { $in: [NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON, NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE] },
  };

  if (category && category.trim()) {
    if (category.trim() === 'DUE_SOON') {
      filter.type = NOTIFICATION_TYPE.PAYMENT_REMINDER_DUE_SOON;
    } else if (category.trim() === 'OVERDUE') {
      filter.type = NOTIFICATION_TYPE.PAYMENT_REMINDER_OVERDUE;
    }
  }

  if (emailStatus && emailStatus.trim()) {
    const s = emailStatus.trim().toUpperCase();
    if (s === 'SENT') {
      filter.emailSent = true;
    } else if (s === 'FAILED') {
      filter.$or = [{ emailError: { $ne: null } }, { emailSent: false, emailError: { $exists: true, $ne: null } }];
    } else if (s === 'IN_APP') {
      filter.emailSent = false;
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

    const matchingUserIds = matchingUsers.map((u) => u._id);

    filter.$or = [
      { title: { $regex: term, $options: 'i' } },
      { message: { $regex: term, $options: 'i' } },
      { recipient: { $in: matchingUserIds } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [total, notifications] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter)
      .populate('recipient', 'fullName email phone division role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  // Enrich with invoice metadata where available
  const enriched = await Promise.all(
    notifications.map(async (n) => {
      let invoiceData = null;
      if (n.relatedResource && n.relatedResource.resourceId) {
        invoiceData = await Invoice.findById(n.relatedResource.resourceId)
          .select('invoiceNumber amount currency status dueAt')
          .lean();
      }
      return {
        ...n,
        invoice: invoiceData,
      };
    })
  );

  return {
    notifications: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

module.exports = {
  getPaymentRemindersSummary,
  previewPaymentReminders,
  sendSinglePaymentReminder,
  sendBulkPaymentReminders,
  getPaymentRemindersHistory,
  formatDeadlineDateTime,
  REMINDER_COOLDOWN_MS,
};
