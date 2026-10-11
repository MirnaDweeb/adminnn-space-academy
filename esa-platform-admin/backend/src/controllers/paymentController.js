const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const onlinePaymentService = require('../services/onlinePaymentService');
const paymobService = require('../services/paymobService');
const PaymentTransaction = require('../models/PaymentTransaction');
const Invoice = require('../models/Invoice');
const Enrollment = require('../models/Enrollment');
const { ROLES } = require('../constants/roles');
const { PAYMENT_STATUS, PAYMENT_PROVIDER, PAYMENT_RECORDING_TYPE } = require('../constants/statuses');
const { recordAudit } = require('../services/auditService');

/**
 * POST /api/payments/enrollments/:id/pay
 * Initiates an online Paymob payment for a student enrollment invoice.
 */
const initiateOnlinePayment = asyncHandler(async (req, res) => {
  const result = await onlinePaymentService.initiateOnlinePaymentForEnrollment({
    enrollmentId: req.params.id,
    studentUser: req.user,
  });

  sendSuccess(res, 201, result);
});

/**
 * GET /api/payments/enrollments/:id/status
 * Retrieves payment and settlement status for an enrollment.
 */
const getPaymentStatus = asyncHandler(async (req, res) => {
  const result = await onlinePaymentService.getPaymentStatusForEnrollment({
    enrollmentId: req.params.id,
    studentUser: req.user,
  });

  sendSuccess(res, 200, result);
});

/**
 * POST /api/payments/paymob/callback
 * Server-to-server webhook endpoint called by Paymob.
 */
const handlePaymobWebhook = asyncHandler(async (req, res) => {
  // HMAC may be provided in query ?hmac=... or custom header
  const hmac = req.query.hmac || req.headers['x-paymob-hmac'] || req.headers['hmac'];

  if (!hmac) {
    throw ApiError.unauthorized('Missing Paymob HMAC signature');
  }

  const result = await onlinePaymentService.handlePaymobCallback(req.body, hmac);
  sendSuccess(res, 200, result);
});

/**
 * GET /api/payments/paymob/callback
 * Browser redirect return endpoint from Paymob checkout.
 */
const handlePaymobReturn = asyncHandler(async (req, res) => {
  const { id, order, success, hmac, amount_cents } = req.query;

  // If callback query params are present and HMAC is provided, process transaction
  if (id && hmac) {
    try {
      await onlinePaymentService.handlePaymobCallback(req.query, hmac);
    } catch (err) {
      console.warn('Paymob return processing warning:', err.message);
    }
  }

  // Redirect to frontend return verification page
  const clientUrl = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
  const queryStr = new URLSearchParams(req.query).toString();
  return res.redirect(`${clientUrl}/student/payments/return?${queryStr}`);
});

/**
 * POST /api/payments/paymob/simulate
 * Simulates a realistic sandbox payment callback for automated tests and sandbox UI.
 *
 * Security guards (executed in order):
 *   1. Route requires authentication (protect) and STUDENT/SUPER_ADMIN role (authorize) — done in router.
 *   2. Returns 404 when NODE_ENV === 'production' OR IS_SIMULATION is false (fail-closed).
 *   3. Requires transactionNumber in body.
 *   4. Loads and verifies the transaction exists.
 *   5. STUDENT callers must own the transaction (via invoice → enrollment chain).
 *      SUPER_ADMIN callers are exempt from ownership checks.
 *   6. Transaction must be PENDING or INITIATED, provider PAYMOB, recordingType ONLINE.
 *   7. Amount is derived server-side from the invoice; client-supplied amountCents is ignored.
 *   8. Records a PAYMENT_SIMULATED audit entry so simulations are distinguishable in logs.
 */
const simulateSandboxPayment = asyncHandler(async (req, res) => {
  // Guard 1: Only available in simulation / development mode.
  // Checking IS_SIMULATION catches any deployment where env vars are missing or have mock values.
  if (process.env.NODE_ENV === 'production' || !paymobService.IS_SIMULATION) {
    throw ApiError.notFound('Endpoint not available');
  }

  const {
    transactionNumber,
    gatewayTransactionId,
    gatewayOrderId,
    // NOTE: amountCents from the client is intentionally NOT used — amount is derived server-side.
    success = true,
  } = req.body || {};

  // Guard 2: transactionNumber required
  if (!transactionNumber) {
    throw ApiError.badRequest('transactionNumber is required');
  }

  // Guard 3: Load the transaction (always, regardless of role)
  const transaction = await PaymentTransaction.findOne({ transactionNumber });
  if (!transaction) {
    throw ApiError.notFound('Payment transaction not found');
  }

  // Guard 4: OWNERSHIP CHECK for STUDENT callers
  if (req.user.role === ROLES.STUDENT) {
    // Load invoice → enrollment → verify student ownership
    const txInvoice = await Invoice.findById(transaction.invoice);
    if (!txInvoice) {
      throw ApiError.notFound('Associated invoice not found');
    }
    const txEnrollment = await Enrollment.findById(txInvoice.enrollment);
    if (!txEnrollment) {
      throw ApiError.notFound('Associated enrollment not found');
    }
    if (txEnrollment.student.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('You can only simulate payments for your own transaction');
    }
  }
  // SUPER_ADMIN is exempt from ownership checks

  // Guard 5: Only simulate for transactions that are in a simulatable state
  const simulatableStatuses = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED];
  if (
    !simulatableStatuses.includes(transaction.status) ||
    transaction.provider !== PAYMENT_PROVIDER.PAYMOB ||
    transaction.recordingType !== PAYMENT_RECORDING_TYPE.ONLINE
  ) {
    throw ApiError.badRequest(
      `Transaction cannot be simulated: requires status PENDING or INITIATED, provider PAYMOB, and recordingType ONLINE ` +
      `(current: status=${transaction.status}, provider=${transaction.provider}, recordingType=${transaction.recordingType})`
    );
  }

  // Derive authoritative amount from the Invoice (never from client input)
  const invoice = await Invoice.findById(transaction.invoice);
  if (!invoice) {
    throw ApiError.notFound('Associated invoice not found');
  }
  const serverAmountCents = Math.round(invoice.amount * 100);

  const simTxId = gatewayTransactionId || Math.floor(10000000 + Math.random() * 90000000);
  const simOrderId = gatewayOrderId || Math.floor(10000000 + Math.random() * 90000000);

  const { payload, hmac } = paymobService.buildSimulatedCallback({
    transactionId: simTxId,
    orderId: simOrderId,
    amountCents: serverAmountCents,        // ← server-derived, never client-supplied
    merchantOrderId: transactionNumber,
    success: success !== false,
  });

  // Audit: record simulation attempt so every simulated settlement is distinguishable
  await recordAudit({
    user: req.user,
    action: 'PAYMENT_SIMULATED',
    resource: 'PaymentTransaction',
    resourceId: transaction._id,
    division: invoice.division || null,
    before: { status: transaction.status },
    after: {
      transactionNumber,
      simTxId,
      simOrderId,
      success: success !== false,
      amountCents: serverAmountCents,
      actorRole: req.user.role,
    },
    reason: `Sandbox payment simulation triggered by ${req.user.fullName} (${req.user.role}) for transaction ${transactionNumber} — success=${success !== false}`,
  });

  const result = await onlinePaymentService.handlePaymobCallback(payload, hmac);
  sendSuccess(res, 200, {
    result,
    simulated: {
      gatewayTransactionId: simTxId,
      gatewayOrderId: simOrderId,
      amountCents: serverAmountCents,
      success: success !== false,
    },
  });
});

module.exports = {
  initiateOnlinePayment,
  getPaymentStatus,
  handlePaymobWebhook,
  handlePaymobReturn,
  simulateSandboxPayment,
};
