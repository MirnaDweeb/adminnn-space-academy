const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const {
  generateInvoiceForEnrollment,
  recordPaymentForInvoice,
  processExpiredInvoices,
  listInvoices,
  getInvoiceById,
  getInvoiceForEnrollment,
  listStudentInvoices,
  updateInvoiceMetadata,
  adjustPaymentTransaction,
} = require('../services/financeService');

/**
 * POST /api/admin/enrollments/:id/invoice
 * Generates an Invoice for a PENDING_PAYMENT enrollment.
 */
const generateInvoiceAdmin = asyncHandler(async (req, res) => {
  const { dueAtHours, dueAtCustom, notes } = req.body || {};

  const invoice = await generateInvoiceForEnrollment({
    enrollmentId: req.params.id,
    adminUser: req.user,
    dueAtHours,
    dueAtCustom,
    notes,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 201, { invoice });
});

/**
 * POST /api/admin/invoices/:id/payments
 * Records a payment against an invoice.
 */
const recordPaymentAdmin = asyncHandler(async (req, res) => {
  const { amount, method, reference, notes } = req.body || {};

  const result = await recordPaymentForInvoice({
    invoiceId: req.params.id,
    adminUser: req.user,
    amount,
    method,
    reference,
    notes,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 201, result);
});

/**
 * POST /api/admin/invoices/process-expired
 * Runs the deadline sweep, expires past-due unpaid invoices, releases seats,
 * and triggers Phase 9's FIFO waitlist promotion.
 */
const processExpiredInvoicesAdmin = asyncHandler(async (req, res) => {
  const result = await processExpiredInvoices({
    adminUser: req.user,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, result);
});

/**
 * GET /api/admin/invoices
 * Lists division-scoped invoices with filtering and pagination.
 */
const listInvoicesAdmin = asyncHandler(async (req, res) => {
  const { invoices, pagination } = await listInvoices({
    query: req.query,
    user: req.user,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, { invoices }, pagination);
});

/**
 * GET /api/admin/invoices/:id
 * Retrieves an invoice with its payment transaction history.
 */
const getInvoiceByIdAdmin = asyncHandler(async (req, res) => {
  const result = await getInvoiceById({
    invoiceId: req.params.id,
    user: req.user,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, result);
});

/**
 * GET /api/admin/enrollments/:id/invoice
 * Retrieves the invoice associated with an enrollment.
 */
const getInvoiceByEnrollmentAdmin = asyncHandler(async (req, res) => {
  const result = await getInvoiceForEnrollment({
    enrollmentId: req.params.id,
    user: req.user,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, result);
});

/**
 * GET /api/students/mine/invoices
 * Allows a student to view their own invoices (read-only).
 */
const listMyInvoices = asyncHandler(async (req, res) => {
  const invoices = await listStudentInvoices({
    studentId: req.user._id,
  });

  sendSuccess(res, 200, { invoices });
});

/**
 * PATCH /api/admin/invoices/:id
 * Updates allowed invoice metadata (notes, dueAt extension if pending).
 */
const updateInvoiceMetadataAdmin = asyncHandler(async (req, res) => {
  const { notes, dueAt } = req.body || {};

  const invoice = await updateInvoiceMetadata({
    invoiceId: req.params.id,
    adminUser: req.user,
    notes,
    dueAt,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 200, { invoice, message: 'Invoice metadata updated successfully' });
});

/**
 * POST /api/admin/payments/:id/adjust
 * Accounting-safe payment adjustment on a PaymentTransaction.
 */
const adjustPaymentAdmin = asyncHandler(async (req, res) => {
  const { amount, adjustedAmount, reason } = req.body || {};
  const targetAmount = amount !== undefined ? amount : adjustedAmount;

  const result = await adjustPaymentTransaction({
    transactionId: req.params.id,
    adminUser: req.user,
    adjustmentAmount: targetAmount,
    reason,
    scopeDivision: req.scopeDivision,
  });

  sendSuccess(res, 201, {
    ...result,
    message: 'Payment adjustment recorded successfully in immutable financial ledger',
  });
});

module.exports = {
  generateInvoiceAdmin,
  recordPaymentAdmin,
  processExpiredInvoicesAdmin,
  listInvoicesAdmin,
  getInvoiceByIdAdmin,
  getInvoiceByEnrollmentAdmin,
  listMyInvoices,
  updateInvoiceMetadataAdmin,
  adjustPaymentAdmin,
};
