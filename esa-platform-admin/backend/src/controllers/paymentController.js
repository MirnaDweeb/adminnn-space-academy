const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const onlinePaymentService = require('../services/onlinePaymentService');
const paymobService = require('../services/paymobService');

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
 */
const simulateSandboxPayment = asyncHandler(async (req, res) => {
  const {
    transactionNumber,
    gatewayTransactionId,
    gatewayOrderId,
    amountCents,
    success = true,
  } = req.body || {};

  const simTxId = gatewayTransactionId || Math.floor(10000000 + Math.random() * 90000000);
  const simOrderId = gatewayOrderId || Math.floor(10000000 + Math.random() * 90000000);

  const { payload, hmac } = paymobService.buildSimulatedCallback({
    transactionId: simTxId,
    orderId: simOrderId,
    amountCents: Number(amountCents) || 520000,
    merchantOrderId: transactionNumber,
    success: success !== false,
  });

  const result = await onlinePaymentService.handlePaymobCallback(payload, hmac);
  sendSuccess(res, 200, {
    result,
    simulated: {
      gatewayTransactionId: simTxId,
      gatewayOrderId: simOrderId,
      amountCents,
      success,
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
