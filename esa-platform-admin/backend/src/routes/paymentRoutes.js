const express = require('express');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');
const {
  initiateOnlinePayment,
  getPaymentStatus,
  handlePaymobWebhook,
  handlePaymobReturn,
  simulateSandboxPayment,
} = require('../controllers/paymentController');

const router = express.Router();

// 1. Student online payment initiation & status checks (Authenticated Student only)
router.post('/enrollments/:id/pay', protect, authorize(ROLES.STUDENT), initiateOnlinePayment);
router.get('/enrollments/:id/status', protect, authorize(ROLES.STUDENT), getPaymentStatus);

// 2. Paymob gateway callbacks (Public endpoints; secured via SHA-512 HMAC signature verification)
router.post('/paymob/callback', handlePaymobWebhook);
router.get('/paymob/callback', handlePaymobReturn);

// 3. Sandbox simulation endpoint for automated tests and sandbox verification
router.post('/paymob/simulate', simulateSandboxPayment);

module.exports = router;
