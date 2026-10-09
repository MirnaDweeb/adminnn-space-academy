const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const Course = require('../models/Course');
const AuditLog = require('../models/AuditLog');
const Application = require('../models/Application');
const Cohort = require('../models/Cohort');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const Certificate = require('../models/Certificate');
const {
  validateProgramInput,
  validateProgramStatusTransition,
} = require('../validators/programValidators');
const { recordAudit } = require('../services/auditService');
const { ROLES } = require('../constants/roles');
const { PROGRAM_STATUS } = require('../constants/statuses');

// POST /api/programs
const createProgram = asyncHandler(async (req, res) => {
  validateProgramInput(req.body);
  const {
    title,
    description = '',
    division,
    level,
    targetAudience = '',
    price = 0,
    capacity,
    deliveryMode,
    status = PROGRAM_STATUS.DRAFT,
    category = '',
    transportationOption = 'NONE',
    registrationStartDate,
    registrationEndDate,
    startDate,
    endDate,
    reopeningDate,
    assignedInstructors = [],
    prerequisites = [],
    requiredEducation = '',
    targetMajors = [],
  } = req.body;

  // A division admin may only create programs inside their own division.
  if (req.user.role !== ROLES.SUPER_ADMIN && division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot create a program outside your division');
  }

  const program = await Course.create({
    title: title.trim(),
    description: description.trim(),
    division,
    level,
    targetAudience: targetAudience.trim(),
    price: Number(price) || 0,
    capacity: Number(capacity),
    deliveryMode,
    status: status || PROGRAM_STATUS.DRAFT,
    category: category ? category.trim() : '',
    transportationOption: transportationOption || 'NONE',
    registrationStartDate: registrationStartDate ? new Date(registrationStartDate) : undefined,
    registrationEndDate: registrationEndDate ? new Date(registrationEndDate) : undefined,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    reopeningDate: reopeningDate ? new Date(reopeningDate) : undefined,
    assignedInstructors: Array.isArray(assignedInstructors) ? assignedInstructors : [],
    prerequisites: Array.isArray(prerequisites) ? prerequisites : [],
    requiredEducation: requiredEducation ? requiredEducation.trim() : '',
    targetMajors: Array.isArray(targetMajors) ? targetMajors : [],
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await recordAudit({
    user: req.user,
    action: 'PROGRAM_CREATED',
    resource: 'Course',
    resourceId: program._id,
    division: program.division,
    before: null,
    after: program.toObject(),
    reason: `Program created by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 201, { program });
});

// GET /api/programs
const listPrograms = asyncHandler(async (req, res) => {
  const { status, search = '', division, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (division && division !== 'all') {
      filter.division = division;
    }
  } else if (req.scopeDivision && req.scopeDivision !== 'all') {
    filter.division = req.scopeDivision;
  }

  if (status) {
    filter.status = status;
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { targetAudience: searchRegex },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await Course.countDocuments(filter);
  const programs = await Course.find(filter)
    .populate('createdBy', 'fullName email role')
    .populate('updatedBy', 'fullName email role')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  sendSuccess(
    res,
    200,
    { programs },
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    }
  );
});

// GET /api/programs/:id
const getProgramById = asyncHandler(async (req, res) => {
  const program = await Course.findById(req.params.id)
    .populate('createdBy', 'fullName email role')
    .populate('updatedBy', 'fullName email role');

  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  // Scoping check for division admins
  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (program.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access a program outside your division');
    }
  }

  const auditLogs = await AuditLog.find({
    resource: 'Course',
    resourceId: program._id,
  })
    .sort({ timestamp: -1 })
    .populate('user', 'fullName email role');

  sendSuccess(res, 200, { program, auditLogs });
});

// PUT /api/programs/:id
const updateProgram = asyncHandler(async (req, res) => {
  validateProgramInput(req.body, { partial: true });
  const program = await Course.findById(req.params.id);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && program.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify a program outside your division');
  }

  const before = program.toObject();

  if (req.body.title !== undefined) program.title = req.body.title.trim();
  if (req.body.description !== undefined) program.description = req.body.description.trim();
  if (req.body.level !== undefined) program.level = req.body.level;
  if (req.body.targetAudience !== undefined) program.targetAudience = req.body.targetAudience.trim();
  if (req.body.price !== undefined) program.price = Number(req.body.price);
  if (req.body.capacity !== undefined) program.capacity = Number(req.body.capacity);
  if (req.body.deliveryMode !== undefined) program.deliveryMode = req.body.deliveryMode;
  if (req.body.category !== undefined) program.category = req.body.category.trim();
  if (req.body.transportationOption !== undefined) program.transportationOption = req.body.transportationOption;
  if (req.body.registrationStartDate !== undefined) program.registrationStartDate = req.body.registrationStartDate ? new Date(req.body.registrationStartDate) : undefined;
  if (req.body.registrationEndDate !== undefined) program.registrationEndDate = req.body.registrationEndDate ? new Date(req.body.registrationEndDate) : undefined;
  if (req.body.startDate !== undefined) program.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
  if (req.body.endDate !== undefined) program.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
  if (req.body.reopeningDate !== undefined) program.reopeningDate = req.body.reopeningDate ? new Date(req.body.reopeningDate) : undefined;
  if (Array.isArray(req.body.assignedInstructors)) program.assignedInstructors = req.body.assignedInstructors;
  if (Array.isArray(req.body.prerequisites)) program.prerequisites = req.body.prerequisites;
  if (req.body.requiredEducation !== undefined) program.requiredEducation = req.body.requiredEducation.trim();
  if (Array.isArray(req.body.targetMajors)) program.targetMajors = req.body.targetMajors;

  if (req.body.status !== undefined && req.body.status !== program.status) {
    validateProgramStatusTransition(program.status, req.body.status);
    program.status = req.body.status;
  }

  program.updatedBy = req.user._id;
  await program.save();

  await recordAudit({
    user: req.user,
    action: 'PROGRAM_UPDATED',
    resource: 'Course',
    resourceId: program._id,
    division: program.division,
    before,
    after: program.toObject(),
    reason: req.body.reason || `Program updated by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 200, { program });
});

// PATCH /api/programs/:id/status
const updateProgramStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!status) {
    throw ApiError.badRequest('status is required');
  }

  const program = await Course.findById(req.params.id);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && program.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify a program outside your division');
  }

  validateProgramStatusTransition(program.status, status);

  const before = { status: program.status };
  program.status = status;
  program.updatedBy = req.user._id;
  await program.save();

  await recordAudit({
    user: req.user,
    action: 'PROGRAM_STATUS_CHANGED',
    resource: 'Course',
    resourceId: program._id,
    division: program.division,
    before,
    after: { status: program.status },
    reason: reason || `Program status transitioned from ${before.status} to ${status} by ${req.user.role} ${req.user.fullName}`,
  });

  sendSuccess(res, 200, { program });
});

// DELETE /api/programs/:id (Delete or Safe Archive)
const deleteOrArchiveProgram = asyncHandler(async (req, res) => {
  const program = await Course.findById(req.params.id);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && program.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot delete or archive a program outside your division');
  }

  // Count references across platform entities
  const [appCount, cohortCount, enrollCount, invoiceCount, certCount] = await Promise.all([
    Application.countDocuments({ program: program._id }),
    Cohort.countDocuments({ program: program._id }),
    Enrollment.countDocuments({ program: program._id }),
    Invoice.countDocuments({ program: program._id }),
    Certificate.countDocuments({ program: program._id }),
  ]);

  const totalReferences = appCount + cohortCount + enrollCount + invoiceCount + certCount;
  const before = program.toObject();

  if (totalReferences > 0) {
    // Preserve business rules: Safe archive instead of hard delete
    program.status = PROGRAM_STATUS.ARCHIVED;
    program.isArchived = true;
    program.archivedAt = new Date();
    program.archivedBy = req.user._id;
    program.updatedBy = req.user._id;
    await program.save();

    await recordAudit({
      user: req.user,
      action: 'PROGRAM_ARCHIVED',
      resource: 'Course',
      resourceId: program._id,
      division: program.division,
      before,
      after: program.toObject(),
      reason: req.body.reason || `Program safely archived due to ${totalReferences} existing operational references (Applications: ${appCount}, Cohorts: ${cohortCount}, Enrollments: ${enrollCount}, Invoices: ${invoiceCount}, Certificates: ${certCount})`,
    });

    return sendSuccess(res, 200, {
      program,
      archived: true,
      deleted: false,
      message: `Program has active references and was safely archived rather than deleted (${totalReferences} linked records preserved).`,
      references: { applications: appCount, cohorts: cohortCount, enrollments: enrollCount, invoices: invoiceCount, certificates: certCount },
    });
  }

  // No active references — safe deletion allowed
  await Course.findByIdAndDelete(program._id);

  await recordAudit({
    user: req.user,
    action: 'PROGRAM_DELETED',
    resource: 'Course',
    resourceId: program._id,
    division: program.division,
    before,
    after: null,
    reason: req.body.reason || `Program "${program.title}" deleted by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 200, {
    deleted: true,
    archived: false,
    message: `Program "${program.title}" was successfully deleted.`,
  });
});

module.exports = {
  createProgram,
  listPrograms,
  getProgramById,
  updateProgram,
  updateProgramStatus,
  deleteOrArchiveProgram,
};
