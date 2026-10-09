const Invoice = require('../models/Invoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const Enrollment = require('../models/Enrollment');
const Application = require('../models/Application');
const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { cancelEnrollment } = require('./enrollmentService');
const {
  ENROLLMENT_STATUS,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  APPLICATION_STATUS,
} = require('../constants/statuses');
const { ROLES } = require('../constants/roles');
const { notifyUser, wrapEmailHtml } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');


/**
 * Generates an Invoice for a PENDING_PAYMENT enrollment.
 * Default deadline window is 72 hours from issuance (or custom dueAt override).
 *
 * @param {Object} params
 * @param {string} params.enrollmentId
 * @param {Object} params.adminUser
 * @param {number} [params.dueAtHours=72]
 * @param {Date|string} [params.dueAtCustom]
 * @param {string} [params.notes]
 * @param {string} [params.scopeDivision]
 * @returns {Promise<Object>} Created Invoice
 */
async function generateInvoiceForEnrollment({
  enrollmentId,
  adminUser,
  dueAtHours = 72,
  dueAtCustom = null,
  notes = '',
  scopeDivision,
}) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }

  // Division scoping check
  if (scopeDivision && scopeDivision !== 'all' && enrollment.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot generate an invoice for an enrollment outside your division');
  }

  // Enrollment must be in PENDING_PAYMENT
  if (enrollment.status !== ENROLLMENT_STATUS.PENDING_PAYMENT) {
    throw ApiError.badRequest(
      `Invoices can only be generated for enrollments in "${ENROLLMENT_STATUS.PENDING_PAYMENT}" status. Current status is "${enrollment.status}".`
    );
  }

  // Duplicate active invoice check
  const existingActive = await Invoice.findOne({
    enrollment: enrollment._id,
    status: { $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.PAID] },
  });

  if (existingActive) {
    throw ApiError.conflict(
      `An active invoice already exists for this enrollment (Invoice: ${existingActive.invoiceNumber}, Status: ${existingActive.status}).`
    );
  }

  // Fetch program to obtain official price
  const course = await Course.findById(enrollment.program);
  if (!course) {
    throw ApiError.notFound('Associated program not found');
  }

  const amount = Number(course.price) || 0;
  const issuedAt = new Date();
  const dueAt = dueAtCustom
    ? new Date(dueAtCustom)
    : new Date(issuedAt.getTime() + dueAtHours * 60 * 60 * 1000);

  const invoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const invoice = await Invoice.create({
    invoiceNumber,
    enrollment: enrollment._id,
    application: enrollment.application,
    student: enrollment.student,
    program: course._id,
    division: enrollment.division,
    amount,
    currency: 'EGP',
    status: INVOICE_STATUS.PENDING,
    issuedAt,
    dueAt,
    notes: notes.trim(),
    createdBy: adminUser._id,
  });

  // Record audit log
  await recordAudit({
    user: adminUser,
    action: 'INVOICE_CREATED',
    resource: 'Invoice',
    resourceId: invoice._id,
    division: invoice.division,
    before: null,
    after: {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
      enrollmentId: enrollment._id,
      studentId: enrollment.student,
      programId: course._id,
    },
    reason: `Invoice ${invoice.invoiceNumber} generated for ${amount} EGP (Due: ${dueAt.toISOString()}) by ${adminUser.fullName}`,
  });

  await invoice.populate([
    { path: 'student', select: 'fullName email phone' },
    { path: 'program', select: 'title division price capacity level' },
    { path: 'createdBy', select: 'fullName email role' },
  ]);

  return invoice;
}

/**
 * Records an immutable PaymentTransaction against an invoice.
 * If total payments satisfy or exceed the invoice amount, marks invoice PAID
 * and transitions linked Enrollment to CONFIRMED.
 *
 * @param {Object} params
 * @param {string} params.invoiceId
 * @param {Object} params.adminUser
 * @param {number} params.amount
 * @param {string} params.method
 * @param {string} [params.reference]
 * @param {string} [params.notes]
 * @param {string} [params.scopeDivision]
 * @returns {Promise<Object>}
 */
async function recordPaymentForInvoice({
  invoiceId,
  adminUser,
  amount,
  method,
  reference = '',
  notes = '',
  scopeDivision,
}) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  // Division scoping check
  if (scopeDivision && scopeDivision !== 'all' && invoice.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot record a payment for an invoice outside your division');
  }

  if (invoice.status === INVOICE_STATUS.PAID) {
    throw ApiError.badRequest('Invoice is already fully paid');
  }

  if (invoice.status === INVOICE_STATUS.EXPIRED) {
    throw ApiError.badRequest('Cannot record payment on an expired invoice');
  }

  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    throw ApiError.badRequest('Cannot record payment on a cancelled invoice');
  }

  const payAmount = Number(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    throw ApiError.badRequest('Payment amount must be a positive number');
  }

  if (!Object.values(PAYMENT_METHOD).includes(method)) {
    throw ApiError.badRequest(
      `Invalid payment method "${method}". Valid methods: ${Object.values(PAYMENT_METHOD).join(', ')}`
    );
  }

  const transactionNumber = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create immutable payment transaction
  const transaction = await PaymentTransaction.create({
    transactionNumber,
    invoice: invoice._id,
    enrollment: invoice.enrollment,
    amount: payAmount,
    currency: invoice.currency || 'EGP',
    method,
    reference: reference.trim(),
    notes: notes.trim(),
    recordingType: 'MANUAL',
    provider: 'MANUAL',
    recordedBy: adminUser._id,
    recordedAt: new Date(),
    status: PAYMENT_STATUS.RECORDED,
  });

  // Calculate cumulative payments for this invoice
  const allTxns = await PaymentTransaction.find({
    invoice: invoice._id,
    status: { $in: [PAYMENT_STATUS.RECORDED, PAYMENT_STATUS.PAID] },
  });
  const totalPaid = allTxns.reduce((sum, t) => sum + t.amount, 0);

  // Record PAYMENT_RECORDED Audit Log
  await recordAudit({
    user: adminUser,
    action: 'PAYMENT_RECORDED',
    resource: 'PaymentTransaction',
    resourceId: transaction._id,
    division: invoice.division,
    before: null,
    after: {
      transactionNumber: transaction.transactionNumber,
      invoiceNumber: invoice.invoiceNumber,
      amount: transaction.amount,
      method: transaction.method,
      reference: transaction.reference,
      totalPaid,
      invoiceAmount: invoice.amount,
    },
    reason: `Payment of ${payAmount} EGP (${method}) recorded against invoice ${invoice.invoiceNumber} by ${adminUser.fullName}`,
  });

  let enrollment = null;
  const isFullyPaid = totalPaid >= invoice.amount;

  if (isFullyPaid) {
    const beforeInvoiceStatus = invoice.status;
    invoice.status = INVOICE_STATUS.PAID;
    invoice.paidAt = new Date();
    await invoice.save();

    // Transition linked Enrollment from PENDING_PAYMENT to CONFIRMED
    enrollment = await Enrollment.findById(invoice.enrollment);
    if (enrollment) {
      const beforeEnrollmentStatus = enrollment.status;
      enrollment.status = ENROLLMENT_STATUS.CONFIRMED;
      enrollment.confirmedAt = new Date();
      await enrollment.save();

      // Update application to CONFIRMED
      const application = await Application.findById(enrollment.application);
      if (application) {
        application.status = APPLICATION_STATUS.CONFIRMED;
        await application.save();
      }

      // Record ENROLLMENT_CONFIRMED Audit Log
      await recordAudit({
        user: adminUser,
        action: 'ENROLLMENT_CONFIRMED',
        resource: 'Enrollment',
        resourceId: enrollment._id,
        division: enrollment.division,
        before: { status: beforeEnrollmentStatus },
        after: {
          status: enrollment.status,
          confirmedAt: enrollment.confirmedAt,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          totalPaid,
        },
        reason: `Enrollment confirmed upon settlement of invoice ${invoice.invoiceNumber}`,
      });
    }
  }

  await transaction.populate('recordedBy', 'fullName email role');
  await invoice.populate([
    { path: 'student', select: 'fullName email phone' },
    { path: 'program', select: 'title division price capacity' },
  ]);

  // Phase 14: Payment confirmation notification (failure-safe, non-blocking)
  if (isFullyPaid) {
    try {
      const studentObj = invoice.student;
      const programObj = invoice.program;
      const programTitle = programObj?.title || 'Training Program';
      const studentEmail = studentObj?.email;
      const studentName = studentObj?.fullName || 'Student';

      await notifyUser({
        recipientId: studentObj?._id || invoice.student,
        type: NOTIFICATION_TYPE.PAYMENT_CONFIRMED,
        title: `Payment Confirmed - Receipt #${transaction.transactionNumber}`,
        message: `Your payment of ${transaction.amount} ${transaction.currency || 'EGP'} for "${programTitle}" has been received and confirmed. Your enrollment is now active.`,
        relatedResource: {
          resourceType: 'Invoice',
          resourceId: invoice._id,
        },
        division: invoice.division,
        email: {
          to: studentEmail,
          studentName,
          subject: `Payment Receipt: ${transaction.transactionNumber} - ${programTitle}`,
          text: `Dear ${studentName},\n\nWe have received and confirmed your payment of ${transaction.amount} ${transaction.currency || 'EGP'} for "${programTitle}".\n\nTransaction: ${transaction.transactionNumber}\nInvoice: ${invoice.invoiceNumber}\nStatus: Confirmed\n\nThank you,\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: 'Payment Receipt Confirmation',
            contentHtml: `
              <p>Dear <strong>${studentName}</strong>,</p>
              <p>We are pleased to confirm receipt of your payment for <strong>${programTitle}</strong>.</p>
              <div class="card">
                <p style="margin: 0;"><strong>Receipt / Transaction:</strong> ${transaction.transactionNumber}</p>
                <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
                <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ${transaction.amount} ${transaction.currency || 'EGP'}</p>
                <p style="margin: 4px 0;"><strong>Enrollment Status:</strong> <span style="color: #4ade80;">CONFIRMED</span></p>
              </div>
              <p>Your enrollment has been successfully confirmed. You can access your cohort details from your student portal.</p>
            `,
            actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/student/invoices`,
            actionText: 'View Invoices & Receipts',
          }),
        },
      });
    } catch (notifErr) {
      console.error('[PaymentConfirmation:NotifyError]', notifErr.message);
    }
  }


  return {
    transaction,
    invoice,
    enrollment,
    totalPaid,
    isFullyPaid,
  };
}

/**
 * Deadline sweep function: detects expired unpaid invoices and releases reserved seats,
 * triggering Phase 9's FIFO waitlist promotion.
 *
 * @param {Object} params
 * @param {Object} params.adminUser
 * @param {string} [params.scopeDivision]
 * @returns {Promise<Object>} Summary of processed expired invoices
 */
async function processExpiredInvoices({ adminUser, scopeDivision }) {
  const query = {
    status: INVOICE_STATUS.PENDING,
    dueAt: { $lte: new Date() },
  };

  if (scopeDivision && scopeDivision !== 'all') {
    query.division = scopeDivision;
  }

  const expiredInvoices = await Invoice.find(query);
  const processed = [];

  for (const invoice of expiredInvoices) {
    // 1. Mark Invoice as EXPIRED
    invoice.status = INVOICE_STATUS.EXPIRED;
    await invoice.save();

    // 2. Record INVOICE_EXPIRED Audit Log
    await recordAudit({
      user: adminUser,
      action: 'INVOICE_EXPIRED',
      resource: 'Invoice',
      resourceId: invoice._id,
      division: invoice.division,
      before: { status: INVOICE_STATUS.PENDING },
      after: {
        status: INVOICE_STATUS.EXPIRED,
        dueAt: invoice.dueAt,
        invoiceNumber: invoice.invoiceNumber,
      },
      reason: `Invoice ${invoice.invoiceNumber} expired (Due: ${invoice.dueAt.toISOString()}) - payment window elapsed`,
    });

    // Phase 14: Notify student of invoice expiration & seat release (failure-safe, non-blocking)
    try {
      const course = await Course.findById(invoice.program).select('title');
      const programTitle = course ? course.title : 'Program';

      await notifyUser({
        recipientId: invoice.student,
        type: NOTIFICATION_TYPE.PAYMENT_EXPIRED,
        title: `Payment Deadline Expired - Invoice #${invoice.invoiceNumber}`,
        message: `The payment deadline for invoice ${invoice.invoiceNumber} (${programTitle}) has passed. Your reserved enrollment seat has been released.`,
        relatedResource: {
          resourceType: 'Invoice',
          resourceId: invoice._id,
        },
        division: invoice.division,
        email: {
          subject: `Payment Deadline Expired: Invoice #${invoice.invoiceNumber} - ${programTitle}`,
          text: `Dear Student,\n\nThe payment window for invoice ${invoice.invoiceNumber} for "${programTitle}" has elapsed without receipt of payment.\n\nAs a result, your seat reservation has been released.\n\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: 'Payment Window Elapsed',
            contentHtml: `
              <p>Dear Student,</p>
              <p>The payment deadline for invoice <strong>${invoice.invoiceNumber}</strong> (${programTitle}) has passed.</p>
              <div class="card" style="border-left-color: #ef4444;">
                <p style="margin: 0; color: #f87171;"><strong>Notice:</strong> Your reserved seat in this program has been released.</p>
                <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
                <p style="margin: 4px 0;"><strong>Program:</strong> ${programTitle}</p>
              </div>
              <p>If you believe this is an error or would like to re-apply, please contact the academy administration.</p>
            `,
          }),
        },
      });
    } catch (expNotifErr) {
      console.error('[InvoiceExpired:NotifyError]', expNotifErr.message);
    }

    // 3. Cancel the linked enrollment and trigger Phase 9's FIFO waitlist promotion

    try {
      const cancelResult = await cancelEnrollment({
        enrollmentId: invoice.enrollment,
        adminUser,
        reason: 'Payment deadline expired',
        scopeDivision,
      });

      processed.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        enrollmentId: invoice.enrollment,
        promotedEnrollment: cancelResult.promotedEnrollment || null,
      });
    } catch (err) {
      console.error(`Failed to cancel enrollment ${invoice.enrollment} on invoice expiry:`, err.message);
      processed.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        enrollmentId: invoice.enrollment,
        error: err.message,
      });
    }
  }

  return {
    processedCount: processed.length,
    processed,
  };
}

/**
 * Lists invoices with filtering and pagination.
 */
async function listInvoices({ query = {}, user, scopeDivision }) {
  const { status, program, student, search, page = 1, limit = 20 } = query;
  const filter = {};

  if (user.role === ROLES.SUPER_ADMIN) {
    if (query.division && query.division !== 'all') {
      filter.division = query.division;
    }
  } else if (scopeDivision && scopeDivision !== 'all') {
    filter.division = scopeDivision;
  }

  if (status && status.trim()) {
    filter.status = status.trim();
  }

  if (program && program.trim()) {
    filter.program = program.trim();
  }

  if (student && student.trim()) {
    filter.student = student.trim();
  }

  if (search && search.trim()) {
    filter.$or = [
      { invoiceNumber: { $regex: search.trim(), $options: 'i' } },
      { notes: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await Invoice.countDocuments(filter);
  const invoices = await Invoice.find(filter)
    .populate('student', 'fullName email phone')
    .populate('program', 'title division price capacity level')
    .populate('enrollment', 'status enrolledAt confirmedAt')
    .populate('createdBy', 'fullName email role')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  return {
    invoices,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

/**
 * Retrieves an invoice with its full payment history.
 */
async function getInvoiceById({ invoiceId, user, scopeDivision }) {
  const invoice = await Invoice.findById(invoiceId)
    .populate('student', 'fullName email phone')
    .populate('program', 'title division price capacity level deliveryMode')
    .populate('enrollment', 'status enrolledAt confirmedAt cancelledAt cancelReason')
    .populate('application', 'status decision submittedAt')
    .populate('createdBy', 'fullName email role');

  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  if (user.role !== ROLES.SUPER_ADMIN && scopeDivision && scopeDivision !== 'all') {
    if (invoice.division !== scopeDivision) {
      throw ApiError.forbidden('You cannot access an invoice outside your division');
    }
  }

  const transactions = await PaymentTransaction.find({ invoice: invoice._id })
    .populate('recordedBy', 'fullName email role')
    .sort({ recordedAt: -1 });

  const totalPaid = transactions
    .filter((t) => t.status === PAYMENT_STATUS.RECORDED || t.status === PAYMENT_STATUS.PAID)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    invoice,
    transactions,
    totalPaid,
    balanceRemaining: Math.max(invoice.amount - totalPaid, 0),
  };
}

/**
 * Retrieves the invoice for an enrollment if one exists.
 */
async function getInvoiceForEnrollment({ enrollmentId, user, scopeDivision }) {
  const invoice = await Invoice.findOne({ enrollment: enrollmentId })
    .populate('student', 'fullName email phone')
    .populate('program', 'title division price capacity')
    .populate('createdBy', 'fullName email role')
    .sort({ createdAt: -1 });

  if (invoice && user.role !== ROLES.SUPER_ADMIN && scopeDivision && scopeDivision !== 'all') {
    if (invoice.division !== scopeDivision) {
      throw ApiError.forbidden('You cannot access an invoice outside your division');
    }
  }

  if (!invoice) {
    return null;
  }

  const transactions = await PaymentTransaction.find({ invoice: invoice._id }).sort({ recordedAt: -1 });

  return {
    invoice,
    transactions,
  };
}

async function listStudentInvoices({ studentId }) {
  const invoices = await Invoice.find({ student: studentId })
    .populate('program', 'title division price level')
    .populate('enrollment', 'status enrolledAt confirmedAt cancelledAt')
    .sort({ createdAt: -1 })
    .lean();

  // Attach transactions to each student invoice
  const populated = await Promise.all(
    invoices.map(async (inv) => {
      const transactions = await PaymentTransaction.find({ invoice: inv._id })
        .sort({ recordedAt: -1 })
        .select('transactionNumber amount currency method recordingType provider status recordedAt paidAt')
        .lean();
      return {
        ...inv,
        transactions,
      };
    })
  );

  return populated;
}

/**
 * Update allowed invoice metadata (notes, dueAt extension if invoice is pending).
 * Accounting-safe: cannot arbitrarily mutate status or amount.
 */
async function updateInvoiceMetadata({ invoiceId, adminUser, notes, dueAt, scopeDivision }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  if (scopeDivision && scopeDivision !== 'all' && invoice.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot modify an invoice outside your division');
  }

  const before = { notes: invoice.notes, dueAt: invoice.dueAt };

  if (notes !== undefined) {
    invoice.notes = String(notes).trim();
  }

  if (dueAt !== undefined) {
    if (invoice.status !== INVOICE_STATUS.PENDING) {
      throw ApiError.badRequest(
        `Due date can only be extended for PENDING invoices. Current status is "${invoice.status}".`
      );
    }
    const newDueDate = new Date(dueAt);
    if (isNaN(newDueDate.getTime())) {
      throw ApiError.badRequest('Invalid due date provided');
    }
    invoice.dueAt = newDueDate;
  }

  await invoice.save();

  await recordAudit({
    user: adminUser,
    action: 'INVOICE_UPDATED',
    resource: 'Invoice',
    resourceId: invoice._id,
    division: invoice.division,
    before,
    after: { notes: invoice.notes, dueAt: invoice.dueAt },
    reason: `Invoice ${invoice.invoiceNumber} administrative metadata updated by ${adminUser.fullName}`,
  });

  return invoice;
}

/**
 * Accounting-Safe Payment Adjustment.
 * Never destroys or overwrites the original transaction.
 * Creates a linked ADJUSTMENT record, recalculates invoice balance, and updates statuses.
 */
async function adjustPaymentTransaction({
  transactionId,
  adminUser,
  adjustmentAmount,
  reason,
  scopeDivision,
}) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('A clear justification reason is mandatory for financial adjustments');
  }

  const originalTxn = await PaymentTransaction.findById(transactionId).populate('invoice');
  if (!originalTxn) {
    throw ApiError.notFound('Payment transaction not found');
  }

  const invoice = await Invoice.findById(originalTxn.invoice._id || originalTxn.invoice);
  if (!invoice) {
    throw ApiError.notFound('Associated invoice not found');
  }

  if (scopeDivision && scopeDivision !== 'all' && invoice.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot adjust a transaction outside your division');
  }

  // Prevent direct manual tampering with external provider-confirmed online transactions
  if (originalTxn.provider === 'PAYMOB' && originalTxn.status === PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest(
      'Online provider-confirmed payment transactions cannot be manually modified directly. Please use official gateway refund/chargeback workflows.'
    );
  }

  const adjNum = Number(adjustmentAmount);
  if (isNaN(adjNum) || adjNum === 0) {
    throw ApiError.badRequest('Adjustment amount must be a non-zero number');
  }

  // Generate unique adjustment transaction number
  const transactionNumber = `ADJ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create immutable adjustment transaction
  const adjustmentTxn = await PaymentTransaction.create({
    transactionNumber,
    invoice: invoice._id,
    enrollment: invoice.enrollment,
    amount: adjNum, // Can be positive or negative adjustment
    currency: invoice.currency || 'EGP',
    method: originalTxn.method,
    reference: `Adjustment for ${originalTxn.transactionNumber}`,
    notes: `Financial adjustment: ${reason.trim()} | Prior Txn: ${originalTxn.transactionNumber}`,
    recordingType: 'ADJUSTMENT',
    provider: 'MANUAL',
    recordedBy: adminUser._id,
    recordedAt: new Date(),
    status: PAYMENT_STATUS.RECORDED,
  });

  // Re-calculate cumulative valid payments for invoice
  const allTxns = await PaymentTransaction.find({
    invoice: invoice._id,
    status: { $in: [PAYMENT_STATUS.RECORDED, PAYMENT_STATUS.PAID] },
  });
  const totalPaid = allTxns.reduce((sum, t) => sum + t.amount, 0);

  const prevInvoiceStatus = invoice.status;
  const enrollment = await Enrollment.findById(invoice.enrollment);

  if (totalPaid >= invoice.amount) {
    invoice.status = INVOICE_STATUS.PAID;
    invoice.paidAt = invoice.paidAt || new Date();
    if (enrollment && enrollment.status === ENROLLMENT_STATUS.PENDING_PAYMENT) {
      enrollment.status = ENROLLMENT_STATUS.CONFIRMED;
      enrollment.confirmedAt = enrollment.confirmedAt || new Date();
      await enrollment.save();
    }
  } else {
    // If total paid is now less than required amount
    if (invoice.status === INVOICE_STATUS.PAID) {
      invoice.status = INVOICE_STATUS.PENDING;
      invoice.paidAt = null;
    }
    if (enrollment && enrollment.status === ENROLLMENT_STATUS.CONFIRMED) {
      enrollment.status = ENROLLMENT_STATUS.PENDING_PAYMENT;
      await enrollment.save();
    }
  }
  await invoice.save();

  // Audit log entry
  await recordAudit({
    user: adminUser,
    action: 'PAYMENT_ADJUSTED',
    resource: 'PaymentTransaction',
    resourceId: adjustmentTxn._id,
    division: invoice.division,
    before: {
      originalTransactionNumber: originalTxn.transactionNumber,
      originalAmount: originalTxn.amount,
      invoiceStatus: prevInvoiceStatus,
    },
    after: {
      adjustmentTransactionNumber: adjustmentTxn.transactionNumber,
      adjustmentAmount: adjNum,
      newTotalPaid: totalPaid,
      invoiceStatus: invoice.status,
    },
    reason: `Payment adjustment on ${originalTxn.transactionNumber}: ${reason.trim()} by ${adminUser.fullName}`,
  });

  return {
    adjustment: adjustmentTxn,
    invoice,
    totalPaid,
  };
}

module.exports = {
  generateInvoiceForEnrollment,
  recordPaymentForInvoice,
  processExpiredInvoices,
  listInvoices,
  getInvoiceById,
  getInvoiceForEnrollment,
  listStudentInvoices,
  updateInvoiceMetadata,
  adjustPaymentTransaction,
};
