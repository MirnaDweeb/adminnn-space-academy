const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { ROLES } = require('../constants/roles');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const {
  enrollApplication,
  cancelEnrollment,
  getProgramCapacitySummary,
} = require('../services/enrollmentService');

/**
 * POST /api/admin/applications/:id/enroll
 * Reserves a seat or waitlists an eligible application (atomic & concurrency-safe).
 */
const enrollApplicationAdmin = asyncHandler(async (req, res) => {
  const { enrollment, application, capacity } = await enrollApplication({
    applicationId: req.params.id,
    adminUser: req.user,
    scopeDivision: req.scopeDivision,
  });

  await enrollment.populate([
    { path: 'student', select: 'fullName email phone' },
    { path: 'program', select: 'title division capacity level' },
    { path: 'createdBy', select: 'fullName email role' },
  ]);

  sendSuccess(res, 201, {
    enrollment,
    application,
    capacity,
  });
});

/**
 * GET /api/admin/programs/:id/enrollments
 * Lists enrollments for a program with status filtering and capacity summary.
 */
const getProgramEnrollmentsAdmin = asyncHandler(async (req, res) => {
  const program = await Course.findById(req.params.id);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (program.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access enrollments for a program outside your division');
    }
  }

  const { status, page = 1, limit = 20 } = req.query;
  const filter = { program: program._id };

  if (status && status.trim()) {
    filter.status = status.trim();
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await Enrollment.countDocuments(filter);
  const enrollments = await Enrollment.find(filter)
    .populate('student', 'fullName email phone')
    .populate('application', 'status eligibilityStatus decision createdAt')
    .populate('createdBy', 'fullName email role')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Attach associated invoice to each enrollment (if exists)
  const enrollmentIds = enrollments.map((e) => e._id);
  const invoices = await Invoice.find({ enrollment: { $in: enrollmentIds } });
  const invoiceMap = {};
  invoices.forEach((inv) => {
    invoiceMap[inv.enrollment.toString()] = inv;
  });

  const enrollmentsWithInvoice = enrollments.map((enr) => {
    const plain = enr.toObject();
    plain.invoice = invoiceMap[enr._id.toString()] || null;
    return plain;
  });

  const capacity = await getProgramCapacitySummary(program._id);

  sendSuccess(
    res,
    200,
    {
      enrollments: enrollmentsWithInvoice,
      capacity,
    },
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    }
  );
});

/**
 * PATCH /api/admin/enrollments/:id/cancel
 * Cancels an active enrollment, releases reserved capacity, and triggers FIFO waitlist promotion.
 */
const cancelEnrollmentAdmin = asyncHandler(async (req, res) => {
  const { reason } = req.body || {};

  const { enrollment, promotedEnrollment, capacity } = await cancelEnrollment({
    enrollmentId: req.params.id,
    adminUser: req.user,
    reason,
    scopeDivision: req.scopeDivision,
  });

  await enrollment.populate([
    { path: 'student', select: 'fullName email phone' },
    { path: 'program', select: 'title division capacity' },
  ]);

  if (promotedEnrollment) {
    await promotedEnrollment.populate([
      { path: 'student', select: 'fullName email phone' },
      { path: 'program', select: 'title division capacity' },
    ]);
  }

  sendSuccess(res, 200, {
    enrollment,
    promotedEnrollment,
    capacity,
  });
});

/**
 * GET /api/admin/programs/:id/capacity
 * Fetches capacity summary for a program.
 */
const getProgramCapacityAdmin = asyncHandler(async (req, res) => {
  const program = await Course.findById(req.params.id);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (program.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access capacity for a program outside your division');
    }
  }

  const capacity = await getProgramCapacitySummary(program._id);
  sendSuccess(res, 200, { capacity });
});

module.exports = {
  enrollApplicationAdmin,
  getProgramEnrollmentsAdmin,
  cancelEnrollmentAdmin,
  getProgramCapacityAdmin,
};
