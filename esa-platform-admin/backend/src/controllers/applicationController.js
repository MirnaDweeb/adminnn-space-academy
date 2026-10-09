const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const Application = require('../models/Application');
const Course = require('../models/Course');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const AuditLog = require('../models/AuditLog');
const ReadinessResult = require('../models/ReadinessResult');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const { APPLICATION_STATUS } = require('../constants/statuses');
const { ROLES } = require('../constants/roles');
const { recordAudit } = require('../services/auditService');
const {
  validateApplicationDecision,
  validateReadinessEvaluation,
} = require('../validators/applicationValidators');
const { evaluateStudentReadiness } = require('../services/readinessService');
const { notifyUser, wrapEmailHtml } = require('../services/notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');



// POST /api/applications  (student submits an application to a program)
const createApplication = asyncHandler(async (req, res) => {
  const { programId } = req.body;
  if (!programId) throw ApiError.badRequest('programId is required');

  const program = await Course.findById(programId);
  if (!program) throw ApiError.notFound('Program not found');

  const application = await Application.create({
    student: req.user._id,
    program: program._id,
    division: program.division,
    status: APPLICATION_STATUS.SUBMITTED,
    submittedAt: new Date(),
  });

  await recordAudit({
    user: req.user,
    action: 'APPLICATION_SUBMIT',
    resource: 'Application',
    resourceId: application._id,
    division: application.division,
    after: application.toObject(),
    reason: `Application submitted by student ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 201, { application });
});

// GET /api/applications/mine (student's own applications)
const listMyApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ student: req.user._id })
    .populate('program', 'title division status capacity price deliveryMode')
    .sort({ createdAt: -1 });
  sendSuccess(res, 200, { applications });
});

// GET /api/admin/applications (division-scoped, for admins)
const listApplicationsForAdmin = asyncHandler(async (req, res) => {
  const { status, program, search = '', division, page = 1, limit = 20 } = req.query;
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

  if (program) {
    filter.program = program;
  }

  if (search && search.trim()) {
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ],
    }).select('_id');
    const userIds = matchingUsers.map((u) => u._id);
    filter.student = { $in: userIds };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await Application.countDocuments(filter);
  const applications = await Application.find(filter)
    .populate('student', 'fullName email')
    .populate('program', 'title division price capacity deliveryMode level')
    .populate('reviewedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  sendSuccess(
    res,
    200,
    { applications },
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    }
  );
});

// GET /api/admin/applications/:id (division-scoped detail view)
const getApplicationByIdForAdmin = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate('student', 'fullName email phone')
    .populate('program', 'title description division price capacity deliveryMode level status')
    .populate('reviewedBy', 'fullName email role')
    .populate('reviewNotes.author', 'fullName email role');

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (application.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access an application outside your division');
    }
  }

  const auditLogs = await AuditLog.find({
    resource: 'Application',
    resourceId: application._id,
  })
    .sort({ timestamp: -1 })
    .populate('user', 'fullName email role');

  const latestReadiness = await ReadinessResult.findOne({ application: application._id })
    .populate('evaluatedBy', 'fullName email role')
    .populate('recommendedProgram', 'title division level deliveryMode')
    .sort({ evaluatedAt: -1, createdAt: -1 });

  const readinessHistoryCount = await ReadinessResult.countDocuments({ application: application._id });

  const enrollment = await Enrollment.findOne({ application: application._id })
    .populate('createdBy', 'fullName email role');
  let invoice = null;
  if (enrollment) {
    invoice = await Invoice.findOne({ enrollment: enrollment._id })
      .populate('createdBy', 'fullName email role');
  }

  sendSuccess(res, 200, {
    application,
    auditLogs,
    latestReadiness,
    readinessHistoryCount,
    enrollment,
    invoice,
  });
});

// POST /api/admin/applications/:id/notes (append review note)
const addApplicationReviewNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    throw ApiError.badRequest('Note content is required');
  }

  const application = await Application.findById(req.params.id);
  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (application.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot add notes to an application outside your division');
    }
  }

  const newNote = {
    author: req.user._id,
    authorName: req.user.fullName,
    authorRole: req.user.role,
    note: note.trim(),
    timestamp: new Date(),
  };

  application.reviewNotes.push(newNote);
  await application.save();

  await recordAudit({
    user: req.user,
    action: 'APPLICATION_NOTE_ADDED',
    resource: 'Application',
    resourceId: application._id,
    division: application.division,
    before: null,
    after: { note: newNote.note, author: req.user.fullName },
    reason: `Review note added by ${req.user.role} ${req.user.fullName}`,
  });

  sendSuccess(res, 201, {
    note: newNote,
    reviewNotes: application.reviewNotes,
  });
});

// PATCH /api/admin/applications/:id/decision (decision workflow: ACCEPT, REJECT, WAITLIST, REQUEST_INFO)
const updateApplicationDecision = asyncHandler(async (req, res) => {
  const { decision, reason = '' } = req.body;

  const application = await Application.findById(req.params.id);
  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (application.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot make decisions on an application outside your division');
    }
  }

  const targetStatus = validateApplicationDecision(application.status, decision);

  const before = {
    status: application.status,
    decision: application.decision,
    decisionReason: application.decisionReason,
  };

  application.decision = decision;
  application.decisionReason = reason.trim();
  application.status = targetStatus;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  application.adminDecision = {
    decidedBy: req.user._id,
    decidedAt: new Date(),
    outcome: decision,
  };

  await application.save();

  await recordAudit({
    user: req.user,
    action: 'APPLICATION_DECISION_MADE',
    resource: 'Application',
    resourceId: application._id,
    division: application.division,
    before,
    after: {
      status: application.status,
      decision: application.decision,
      decisionReason: application.decisionReason,
      reviewedBy: req.user.fullName,
    },
    reason: reason.trim() || `Decision ${decision} applied by ${req.user.role} ${req.user.fullName}`,
  });

  // Phase 14: Notification side-effect (failure-safe, non-blocking)
  try {
    const course = await Course.findById(application.program).select('title');
    const programTitle = course ? course.title : 'Training Program';
    const decisionText = decision.replace(/_/g, ' ');
    const noteText = reason.trim() ? ` Note: ${reason.trim()}` : '';

    await notifyUser({
      recipientId: application.student,
      type: NOTIFICATION_TYPE.APPLICATION_DECISION,
      title: `Application Decision: ${decisionText}`,
      message: `Your application for "${programTitle}" has been updated to ${decisionText}.${noteText}`,
      relatedResource: {
        resourceType: 'Application',
        resourceId: application._id,
      },
      division: application.division,
      email: {
        subject: `Application Outcome: ${decisionText} - ${programTitle}`,
        text: `Dear Student,\n\nYour application for "${programTitle}" has been updated to "${decisionText}".${noteText}\n\nPlease visit the portal to view complete details.\n\nEgyptian Space Agency Academy`,
        html: wrapEmailHtml({
          title: `Application Outcome: ${decisionText}`,
          contentHtml: `
            <p>Dear Student,</p>
            <p>Your application status for <strong>${programTitle}</strong> has been updated:</p>
            <div class="card">
              <p style="margin: 0; font-size: 16px;"><strong>Status:</strong> <span style="color: #60a5fa;">${decisionText}</span></p>
              ${reason.trim() ? `<p style="margin: 8px 0 0; color: #94a3b8;"><strong>Note:</strong> ${reason.trim()}</p>` : ''}
            </div>
            <p>Please log in to your ESA Academy account to check details and next steps.</p>
          `,
          actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/dashboard`,
          actionText: 'View Dashboard',
        }),
      },
    });
  } catch (notifyErr) {
    console.error('[ApplicationDecision:NotifySideEffectError]', notifyErr.message);
  }

  sendSuccess(res, 200, { application });

});

// POST /api/admin/applications/:id/readiness (deterministic rule-based readiness evaluation)
const evaluateApplicationReadiness = asyncHandler(async (req, res) => {
  const { override = false } = req.body || {};

  const application = await Application.findById(req.params.id)
    .populate('student')
    .populate('program');

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (application.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access an application outside your division');
    }
  }

  // Validate terminal/decided state protection
  validateReadinessEvaluation(application.status, { override });

  const student = application.student;
  const program = application.program;
  const profile = await StudentProfile.findOne({ user: student._id });

  // Execute deterministic rule-based evaluation
  const evaluation = await evaluateStudentReadiness({
    application,
    student,
    profile,
    program,
  });

  // Always create a new historical ReadinessResult (append-only history)
  const newResult = await ReadinessResult.create({
    application: application._id,
    student: student._id,
    program: program._id,
    division: application.division,
    criteriaEvaluated: evaluation.criteriaEvaluated,
    outcome: evaluation.outcome,
    score: evaluation.score,
    recommendedProgram: evaluation.recommendedProgram,
    recommendationReason: evaluation.recommendationReason,
    evaluatedBy: req.user._id,
    evaluatorRole: req.user.role,
    evaluatedAt: new Date(),
  });

  const before = {
    eligibilityStatus: application.eligibilityStatus,
    status: application.status,
  };

  // Update application eligibilityStatus
  application.eligibilityStatus = evaluation.outcome;

  // Update status if appropriate and not in terminal state
  const isTerminal = [
    APPLICATION_STATUS.CONFIRMED,
    APPLICATION_STATUS.CANCELLED,
    APPLICATION_STATUS.COMPLETED,
    APPLICATION_STATUS.NO_SHOW,
    APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
    APPLICATION_STATUS.WAITLISTED,
  ].includes(application.status);

  if (!isTerminal) {
    if (evaluation.outcome === 'FOUNDATION_RECOMMENDED') {
      application.status = APPLICATION_STATUS.FOUNDATION_RECOMMENDED;
    } else if (evaluation.outcome === 'MANUAL_REVIEW') {
      application.status = APPLICATION_STATUS.MANUAL_REVIEW;
    } else if (
      evaluation.outcome === 'ELIGIBLE' &&
      application.status === APPLICATION_STATUS.READINESS_REQUIRED
    ) {
      application.status = APPLICATION_STATUS.SUBMITTED;
    }
  }

  await application.save();

  // Create audit log for readiness evaluation
  await recordAudit({
    user: req.user,
    action: 'READINESS_EVALUATED',
    resource: 'Application',
    resourceId: application._id,
    division: application.division,
    before,
    after: {
      eligibilityStatus: application.eligibilityStatus,
      status: application.status,
      outcome: newResult.outcome,
      score: newResult.score,
      criteriaEvaluated: newResult.criteriaEvaluated,
      readinessResultId: newResult._id,
      recommendedProgram: newResult.recommendedProgram,
    },
    reason: `Readiness evaluated: ${newResult.outcome} (${newResult.score}% criteria met) by ${req.user.fullName}`,
  });

  await newResult.populate([
    { path: 'evaluatedBy', select: 'fullName email role' },
    { path: 'recommendedProgram', select: 'title division level deliveryMode' },
  ]);

  sendSuccess(res, 201, {
    readinessResult: newResult,
    application,
  });
});

// GET /api/admin/applications/:id/readiness (readiness history and latest result)
const getApplicationReadinessHistory = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (application.division !== req.scopeDivision) {
      throw ApiError.forbidden('You cannot access an application outside your division');
    }
  }

  const results = await ReadinessResult.find({ application: application._id })
    .populate('evaluatedBy', 'fullName email role')
    .populate('recommendedProgram', 'title division level deliveryMode')
    .sort({ evaluatedAt: -1, createdAt: -1 });

  sendSuccess(res, 200, {
    latest: results[0] || null,
    history: results,
    application: {
      id: application._id,
      status: application.status,
      eligibilityStatus: application.eligibilityStatus,
      division: application.division,
    },
  });
});

module.exports = {
  createApplication,
  listMyApplications,
  listApplicationsForAdmin,
  getApplicationByIdForAdmin,
  addApplicationReviewNote,
  updateApplicationDecision,
  evaluateApplicationReadiness,
  getApplicationReadinessHistory,
};

