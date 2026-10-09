const Invoice = require('../models/Invoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const Enrollment = require('../models/Enrollment');
const Application = require('../models/Application');
const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const paymobService = require('./paymobService');
const {
  ENROLLMENT_STATUS,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  PAYMENT_RECORDING_TYPE,
  PAYMENT_PROVIDER,
  APPLICATION_STATUS,
} = require('../constants/statuses');
const { notifyUser, wrapEmailHtml } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');


/**
 * Initiates an online Paymob payment attempt for an enrollment invoice.
 * Security rules:
 * - Authenticated student must own the enrollment.
 * - Enrollment must be PENDING_PAYMENT.
 * - Invoice must be PENDING and payment deadline must not be expired.
 * - Amount is strictly pulled from the MongoDB Invoice record (NEVER frontend input).
 */
async function initiateOnlinePaymentForEnrollment({ enrollmentId, studentUser }) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }

  // Student ownership check
  if (enrollment.student.toString() !== studentUser._id.toString()) {
    throw ApiError.forbidden('You can only initiate payment for your own enrollment');
  }

  // Status check
  if (enrollment.status === ENROLLMENT_STATUS.CONFIRMED) {
    throw ApiError.badRequest('This enrollment is already confirmed');
  }

  if (enrollment.status !== ENROLLMENT_STATUS.PENDING_PAYMENT) {
    throw ApiError.badRequest(
      `Cannot initiate payment for enrollment in "${enrollment.status}" status`
    );
  }

  // Locate active pending invoice
  const invoice = await Invoice.findOne({
    enrollment: enrollment._id,
    status: INVOICE_STATUS.PENDING,
  });

  if (!invoice) {
    // Check if already paid or expired
    const otherInvoice = await Invoice.findOne({ enrollment: enrollment._id }).sort({ createdAt: -1 });
    if (otherInvoice?.status === INVOICE_STATUS.PAID) {
      throw ApiError.badRequest('The invoice for this enrollment has already been paid');
    }
    if (otherInvoice?.status === INVOICE_STATUS.EXPIRED) {
      throw ApiError.badRequest('The invoice payment deadline has expired');
    }
    throw ApiError.notFound('No pending invoice found for this enrollment');
  }

  // Deadline expiration enforcement
  if (invoice.dueAt && new Date(invoice.dueAt) <= new Date()) {
    throw ApiError.badRequest('Payment deadline has expired. This reservation is no longer eligible for payment.');
  }

  // Authoritative amount
  const amount = invoice.amount;
  const amountCents = Math.round(amount * 100);

  // Fetch program details for invoice items
  const program = await Course.findById(invoice.program);
  const programTitle = program?.title || 'Academy Training Program';

  // Split student full name
  const nameParts = (studentUser.fullName || 'Student User').trim().split(' ');
  const firstName = nameParts[0] || 'Student';
  const lastName = nameParts.slice(1).join(' ') || 'Candidate';

  const transactionNumber = `TXN-ONL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create append-only PaymentTransaction in INITIATED status
  const transaction = await PaymentTransaction.create({
    transactionNumber,
    invoice: invoice._id,
    enrollment: enrollment._id,
    amount,
    currency: invoice.currency || 'EGP',
    method: PAYMENT_METHOD.ONLINE_CARD,
    reference: transactionNumber,
    recordingType: PAYMENT_RECORDING_TYPE.ONLINE,
    provider: PAYMENT_PROVIDER.PAYMOB,
    recordedBy: studentUser._id,
    status: PAYMENT_STATUS.INITIATED,
    notes: `Online checkout initiated by student ${studentUser.fullName}`,
  });

  // Paymob Step 1 & 2: Authenticate and Register Order
  let authToken;
  let order;
  let paymentKey;

  try {
    authToken = await paymobService.authenticate();
    order = await paymobService.registerOrder({
      authToken,
      amountCents,
      merchantOrderId: transactionNumber,
      items: [
        {
          name: programTitle,
          amount_cents: amountCents,
          description: `Invoice ${invoice.invoiceNumber}`,
          quantity: '1',
        },
      ],
    });

    // Paymob Step 3: Payment Key
    const billingData = {
      apartment: 'NA',
      email: studentUser.email,
      floor: 'NA',
      first_name: firstName,
      street: 'Academy Campus',
      building: 'NA',
      phone_number: studentUser.phone || '+201000000000',
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'Cairo',
      country: 'EG',
      last_name: lastName,
      state: 'Cairo',
    };

    paymentKey = await paymobService.generatePaymentKey({
      authToken,
      amountCents,
      orderId: order.id,
      billingData,
    });
  } catch (err) {
    transaction.status = PAYMENT_STATUS.FAILED;
    transaction.notes = `Gateway initiation error: ${err.message}`;
    await transaction.save();
    throw ApiError.badRequest(`Payment gateway initialization failed: ${err.message}`);
  }

  // Update transaction with gateway details
  transaction.gatewayOrderId = String(order.id);
  transaction.paymentAttemptId = paymentKey;
  transaction.status = PAYMENT_STATUS.PENDING;
  await transaction.save();

  // Audit log: PAYMENT_INITIATED
  await recordAudit({
    user: studentUser,
    action: 'PAYMENT_INITIATED',
    resource: 'PaymentTransaction',
    resourceId: transaction._id,
    division: invoice.division,
    before: null,
    after: {
      transactionNumber: transaction.transactionNumber,
      invoiceNumber: invoice.invoiceNumber,
      amount: transaction.amount,
      provider: 'PAYMOB',
      gatewayOrderId: transaction.gatewayOrderId,
    },
    reason: `Online payment attempt initiated by ${studentUser.fullName} for invoice ${invoice.invoiceNumber} (${amount} EGP)`,
  });

  const checkoutUrl = paymobService.getCheckoutUrl(paymentKey);

  return {
    transactionId: transaction._id,
    transactionNumber: transaction.transactionNumber,
    gatewayOrderId: transaction.gatewayOrderId,
    checkoutUrl,
    amount,
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    invoiceNumber: invoice.invoiceNumber,
    programTitle,
  };
}

/**
 * Handles Paymob server-to-server transaction webhook / callback.
 * Ensures:
 * - Strict HMAC signature validation.
 * - Idempotency (duplicate callbacks return same settled state without double action).
 * - Exact amount and currency match.
 * - Late callback protection: if invoice is EXPIRED or enrollment is CANCELLED, do NOT resurrect!
 * - Confirms Enrollment & updates Application upon verified settlement.
 * - Emits audit logs.
 */
async function handlePaymobCallback(payload, receivedHmac) {
  // 1. Verify HMAC
  const isValidHmac = paymobService.verifyHmac(payload, receivedHmac);
  if (!isValidHmac) {
    throw ApiError.unauthorized('Invalid Paymob HMAC signature');
  }

  const tx = payload.obj || payload;
  const gatewayTransactionId = String(tx.id);
  const gatewayOrderId = tx.order ? String(tx.order.id || tx.order) : null;
  const merchantOrderId = tx.order?.merchant_order_id || null;
  const amountCents = Number(tx.amount_cents);
  const isSuccess = tx.success === true;
  const isPending = tx.pending === true;

  // 2. IDEMPOTENCY: Check if this gateway transaction ID is already settled
  const existingSettled = await PaymentTransaction.findOne({
    gatewayTransactionId,
    status: PAYMENT_STATUS.PAID,
  });

  if (existingSettled) {
    return {
      success: true,
      isDuplicate: true,
      message: 'Transaction already processed and settled (idempotent)',
      transactionNumber: existingSettled.transactionNumber,
      status: PAYMENT_STATUS.PAID,
    };
  }

  // 3. Locate existing PaymentTransaction by merchant order ID or gateway order ID
  let transaction = null;
  if (merchantOrderId) {
    transaction = await PaymentTransaction.findOne({ transactionNumber: merchantOrderId });
  }
  if (!transaction && gatewayOrderId) {
    transaction = await PaymentTransaction.findOne({ gatewayOrderId });
  }

  if (!transaction) {
    throw ApiError.notFound(`No matching payment transaction found for order ${merchantOrderId || gatewayOrderId}`);
  }

  const invoice = await Invoice.findById(transaction.invoice);
  if (!invoice) {
    throw ApiError.notFound('Associated invoice not found');
  }

  const enrollment = await Enrollment.findById(invoice.enrollment);
  if (!enrollment) {
    throw ApiError.notFound('Associated enrollment not found');
  }

  // 4. LATE CALLBACK PROTECTION: If deadline expired or enrollment cancelled, do not resurrect!
  if (invoice.status === INVOICE_STATUS.EXPIRED || enrollment.status === ENROLLMENT_STATUS.CANCELLED) {
    transaction.status = PAYMENT_STATUS.FAILED;
    transaction.gatewayTransactionId = gatewayTransactionId;
    transaction.notes = 'Payment rejected: deadline expired and enrollment was already cancelled';
    await transaction.save();

    await recordAudit({
      user: { fullName: 'Paymob Gateway', role: 'SYSTEM' },
      action: 'PAYMENT_FAILED',
      resource: 'PaymentTransaction',
      resourceId: transaction._id,
      division: invoice.division,
      before: { status: transaction.status },
      after: {
        status: PAYMENT_STATUS.FAILED,
        gatewayTransactionId,
        reason: 'Late callback received after deadline expiry; enrollment cancelled',
      },
      reason: `Late payment callback for invoice ${invoice.invoiceNumber} rejected because enrollment ${enrollment._id} is cancelled`,
    });

    return {
      success: false,
      status: 'EXPIRED_REJECTED',
      message: 'Payment received after deadline expiry. Enrollment remains cancelled.',
    };
  }

  // 5. AMOUNT MISMATCH CHECK
  const expectedCents = Math.round(invoice.amount * 100);
  if (amountCents !== expectedCents) {
    transaction.status = PAYMENT_STATUS.FAILED;
    transaction.gatewayTransactionId = gatewayTransactionId;
    transaction.notes = `Amount mismatch: expected ${expectedCents} cents (${invoice.amount} EGP), received ${amountCents} cents`;
    await transaction.save();

    await recordAudit({
      user: { fullName: 'Paymob Gateway', role: 'SYSTEM' },
      action: 'PAYMENT_FAILED',
      resource: 'PaymentTransaction',
      resourceId: transaction._id,
      division: invoice.division,
      before: null,
      after: {
        status: PAYMENT_STATUS.FAILED,
        expectedCents,
        receivedCents: amountCents,
      },
      reason: `Payment failed due to amount mismatch on invoice ${invoice.invoiceNumber}`,
    });

    return {
      success: false,
      status: 'AMOUNT_MISMATCH',
      message: 'Payment amount does not match invoice amount',
    };
  }

  // 6. HANDLE SUCCESSFUL SETTLEMENT
  if (isSuccess && !isPending) {
    const rawPan = tx.source_data?.pan || '';
    const maskedPan = rawPan.length >= 4 ? `**** **** **** ${rawPan.slice(-4)}` : '';
    const methodType = tx.source_data?.type === 'wallet' ? PAYMENT_METHOD.MOBILE_WALLET : PAYMENT_METHOD.ONLINE_CARD;

    transaction.status = PAYMENT_STATUS.PAID;
    transaction.gatewayTransactionId = gatewayTransactionId;
    transaction.paidAt = new Date();
    transaction.method = methodType;
    transaction.reference = gatewayTransactionId;
    transaction.gatewayReference = maskedPan;
    transaction.gatewayResponse = {
      sourceType: tx.source_data?.type,
      cardSubType: tx.source_data?.sub_type,
      lastFour: rawPan.slice(-4),
      gatewayOrderId,
    };
    await transaction.save();

    // Mark Invoice PAID
    invoice.status = INVOICE_STATUS.PAID;
    invoice.paidAt = new Date();
    await invoice.save();

    // Transition linked Enrollment to CONFIRMED
    const beforeEnrollmentStatus = enrollment.status;
    enrollment.status = ENROLLMENT_STATUS.CONFIRMED;
    enrollment.confirmedAt = new Date();
    await enrollment.save();

    // Update Application to CONFIRMED
    const application = await Application.findById(enrollment.application);
    if (application) {
      application.status = APPLICATION_STATUS.CONFIRMED;
      await application.save();
    }

    // Audit Log: PAYMENT_RECORDED (Online)
    await recordAudit({
      user: { fullName: 'Paymob Gateway', role: 'SYSTEM' },
      action: 'PAYMENT_RECORDED',
      resource: 'PaymentTransaction',
      resourceId: transaction._id,
      division: invoice.division,
      before: null,
      after: {
        transactionNumber: transaction.transactionNumber,
        invoiceNumber: invoice.invoiceNumber,
        amount: transaction.amount,
        recordingType: PAYMENT_RECORDING_TYPE.ONLINE,
        provider: 'PAYMOB',
        gatewayTransactionId,
        method: transaction.method,
      },
      reason: `Online Paymob payment of ${transaction.amount} EGP verified for invoice ${invoice.invoiceNumber}`,
    });

    // Audit Log: ENROLLMENT_CONFIRMED
    await recordAudit({
      user: { fullName: 'Paymob Gateway', role: 'SYSTEM' },
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
        gatewayTransactionId,
      },
      reason: `Enrollment confirmed upon verified online Paymob settlement of invoice ${invoice.invoiceNumber}`,
    });

    // Phase 14: Notify student of online payment confirmation (failure-safe, non-blocking)
    try {
      const course = await Course.findById(invoice.program).select('title');
      const programTitle = course ? course.title : 'Program';

      await notifyUser({
        recipientId: invoice.student,
        type: NOTIFICATION_TYPE.PAYMENT_CONFIRMED,
        title: `Payment Confirmed - Receipt #${transaction.transactionNumber}`,
        message: `Your online payment of ${transaction.amount} ${transaction.currency || 'EGP'} for "${programTitle}" has been confirmed. Your enrollment is now CONFIRMED.`,
        relatedResource: {
          resourceType: 'Invoice',
          resourceId: invoice._id,
        },
        division: invoice.division,
        email: {
          subject: `Payment Receipt: ${transaction.transactionNumber} - ${programTitle}`,
          text: `Dear Student,\n\nYour online payment of ${transaction.amount} ${transaction.currency || 'EGP'} for "${programTitle}" has been confirmed.\n\nReceipt: ${transaction.transactionNumber}\nInvoice: ${invoice.invoiceNumber}\n\nThank you,\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: 'Online Payment Receipt Confirmation',
            contentHtml: `
              <p>Dear Student,</p>
              <p>Your online payment for <strong>${programTitle}</strong> has been successfully processed and confirmed.</p>
              <div class="card">
                <p style="margin: 0;"><strong>Transaction Reference:</strong> ${transaction.transactionNumber}</p>
                <p style="margin: 4px 0;"><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
                <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ${transaction.amount} ${transaction.currency || 'EGP'}</p>
                <p style="margin: 4px 0;"><strong>Enrollment Status:</strong> <span style="color: #4ade80;">CONFIRMED</span></p>
              </div>
            `,
            actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/student/invoices`,
            actionText: 'View Receipts',
          }),
        },
      });
    } catch (paymobNotifErr) {
      console.error('[PaymobSettlement:NotifyError]', paymobNotifErr.message);
    }

    return {

      success: true,
      status: PAYMENT_STATUS.PAID,
      transactionNumber: transaction.transactionNumber,
      invoiceNumber: invoice.invoiceNumber,
      enrollmentId: enrollment._id,
    };
  }

  // 7. HANDLE PENDING STATUS
  if (isPending) {
    transaction.status = PAYMENT_STATUS.PENDING;
    transaction.gatewayTransactionId = gatewayTransactionId;
    await transaction.save();

    return {
      success: true,
      status: PAYMENT_STATUS.PENDING,
      message: 'Payment is pending gateway authorization',
    };
  }

  // 8. HANDLE FAILED STATUS
  transaction.status = PAYMENT_STATUS.FAILED;
  transaction.gatewayTransactionId = gatewayTransactionId;
  transaction.notes = tx.data?.message || 'Payment declined by card issuer / gateway';
  await transaction.save();

  await recordAudit({
    user: { fullName: 'Paymob Gateway', role: 'SYSTEM' },
    action: 'PAYMENT_FAILED',
    resource: 'PaymentTransaction',
    resourceId: transaction._id,
    division: invoice.division,
    before: null,
    after: {
      status: PAYMENT_STATUS.FAILED,
      gatewayTransactionId,
      error: transaction.notes,
    },
    reason: `Online payment attempt failed for invoice ${invoice.invoiceNumber}: ${transaction.notes}`,
  });

  return {
    success: false,
    status: PAYMENT_STATUS.FAILED,
    message: transaction.notes,
  };
}

/**
 * Returns current payment & verification status for an enrollment.
 */
async function getPaymentStatusForEnrollment({ enrollmentId, studentUser }) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }

  if (enrollment.student.toString() !== studentUser._id.toString()) {
    throw ApiError.forbidden('You can only inspect payment status for your own enrollment');
  }

  const invoice = await Invoice.findOne({ enrollment: enrollment._id }).sort({ createdAt: -1 });
  const transactions = invoice
    ? await PaymentTransaction.find({ invoice: invoice._id }).sort({ recordedAt: -1 })
    : [];

  return {
    enrollment: {
      id: enrollment._id,
      status: enrollment.status,
      confirmedAt: enrollment.confirmedAt,
      cancelledAt: enrollment.cancelledAt,
    },
    invoice: invoice
      ? {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          dueAt: invoice.dueAt,
          paidAt: invoice.paidAt,
        }
      : null,
    transactions: transactions.map((t) => ({
      transactionNumber: t.transactionNumber,
      amount: t.amount,
      currency: t.currency,
      recordingType: t.recordingType,
      provider: t.provider,
      method: t.method,
      status: t.status,
      recordedAt: t.recordedAt,
      gatewayTransactionId: t.gatewayTransactionId,
    })),
  };
}

module.exports = {
  initiateOnlinePaymentForEnrollment,
  handlePaymobCallback,
  getPaymentStatusForEnrollment,
};
