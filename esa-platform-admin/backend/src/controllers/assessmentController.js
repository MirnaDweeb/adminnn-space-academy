const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const assessmentService = require('../services/assessmentService');
const ProgramAssessment = require('../models/ProgramAssessment');

// =========================================================================
// ADMIN CONTROLLERS
// =========================================================================

// POST /api/admin/assessments
const createAssessmentAdmin = asyncHandler(async (req, res) => {
  const assessment = await assessmentService.createAssessment({
    ...req.body,
    user: req.user,
  });
  sendSuccess(res, 201, { assessment });
});

// GET /api/admin/assessments
const listAssessmentsAdmin = asyncHandler(async (req, res) => {
  const division = req.scopeDivision || req.query.division;
  const result = await assessmentService.listAssessments({
    division,
    programId: req.query.programId,
    isActive: req.query.isActive,
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
    user: req.user,
  });
  sendSuccess(res, 200, result);
});

// GET /api/admin/assessments/:id
const getAssessmentByIdAdmin = asyncHandler(async (req, res) => {
  const assessment = await assessmentService.getAssessmentById(req.params.id, req.user, false);
  sendSuccess(res, 200, { assessment });
});

// PUT /api/admin/assessments/:id
const updateAssessmentAdmin = asyncHandler(async (req, res) => {
  const assessment = await assessmentService.updateAssessment(req.params.id, req.body, req.user);
  sendSuccess(res, 200, { assessment });
});

// PATCH /api/admin/assessments/:id/status
const toggleAssessmentStatusAdmin = asyncHandler(async (req, res) => {
  const assessment = await assessmentService.toggleAssessmentStatus(
    req.params.id,
    req.body.isActive,
    req.user
  );
  sendSuccess(res, 200, { assessment });
});

// DELETE /api/admin/assessments/:id
const deleteAssessmentAdmin = asyncHandler(async (req, res) => {
  const result = await assessmentService.deleteAssessment(req.params.id, req.user);
  sendSuccess(res, 200, result);
});

// GET /api/admin/assessments/:id/attempts
const listAttemptsForAssessmentAdmin = asyncHandler(async (req, res) => {
  const attempts = await assessmentService.listAttemptsForAssessment(req.params.id, req.user);
  sendSuccess(res, 200, { attempts, count: attempts.length });
});

// =========================================================================
// STUDENT CONTROLLERS
// =========================================================================

// GET /api/student/assessments/program/:programId
const getAssessmentsForProgramStudent = asyncHandler(async (req, res) => {
  const assessments = await ProgramAssessment.find({
    program: req.params.programId,
    isActive: true,
  })
    .select('-questions.correctAnswer')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, { assessments });
});

// GET /api/student/assessments/:id
const getAssessmentByIdStudent = asyncHandler(async (req, res) => {
  const assessment = await assessmentService.getAssessmentById(req.params.id, req.user, true);
  sendSuccess(res, 200, { assessment });
});

// POST /api/student/assessments/:id/submit
const submitAssessmentAttemptStudent = asyncHandler(async (req, res) => {
  const result = await assessmentService.submitAssessmentAttempt({
    assessmentId: req.params.id,
    answers: req.body.answers || [],
    completionTimeMinutes: req.body.completionTimeMinutes || 1,
    user: req.user,
  });
  sendSuccess(res, 201, result);
});

// GET /api/student/assessments/my-attempts
const getMyAssessmentAttemptsStudent = asyncHandler(async (req, res) => {
  const attempts = await assessmentService.listStudentAttempts(req.user._id);
  sendSuccess(res, 200, { attempts });
});

module.exports = {
  createAssessmentAdmin,
  listAssessmentsAdmin,
  getAssessmentByIdAdmin,
  updateAssessmentAdmin,
  toggleAssessmentStatusAdmin,
  deleteAssessmentAdmin,
  listAttemptsForAssessmentAdmin,
  getAssessmentsForProgramStudent,
  getAssessmentByIdStudent,
  submitAssessmentAttemptStudent,
  getMyAssessmentAttemptsStudent,
};
