const ProgramAssessment = require('../models/ProgramAssessment');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const Course = require('../models/Course');
const Application = require('../models/Application');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { ROLES } = require('../constants/roles');

/**
 * Creates a new assessment for a program (decision support).
 */
async function createAssessment(data) {
  const {
    title,
    description = '',
    instructions = '',
    questions = [],
    thresholds = {},
    timeLimitMinutes = 30,
    user,
  } = data;
  const targetProgId = data.programId || data.program;
  const program = await Course.findById(targetProgId);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (program.division !== adminDivision) {
      throw ApiError.forbidden(`Cannot create assessment for a program outside your division (${program.division})`);
    }
  }

  if (!title || !title.trim()) {
    throw ApiError.badRequest('Assessment title is required');
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw ApiError.badRequest('At least one assessment question is required');
  }

  // Validate questions
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.questionText || !q.questionText.trim()) {
      throw ApiError.badRequest(`Question #${i + 1} text is required`);
    }
    if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
      throw ApiError.badRequest(`Question #${i + 1} must have a correct answer defined`);
    }
  }

  const assessment = await ProgramAssessment.create({
    title: title.trim(),
    description: description.trim(),
    instructions: instructions.trim() || 'Please answer all questions before submitting.',
    program: program._id,
    division: program.division,
    questions,
    thresholds: {
      recommended: Number(thresholds.recommended) || 80,
      foundation: Number(thresholds.foundation) || 60,
      manualReview: Number(thresholds.manualReview) || 40,
    },
    timeLimitMinutes: Math.max(Number(timeLimitMinutes) || 30, 5),
    isActive: true,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await recordAudit({
    user,
    action: 'ASSESSMENT_CREATED',
    resource: 'ProgramAssessment',
    resourceId: assessment._id,
    division: assessment.division,
    after: assessment.toObject(),
    reason: `Assessment "${assessment.title}" created for program "${program.title}" by ${user.role} ${user.fullName}`,
  });

  return assessment;
}

/**
 * Lists assessments with division scoping.
 */
async function listAssessments({ division, programId, isActive, search, page = 1, limit = 20, user }) {
  const filter = {};

  if (user.role === ROLES.SUPER_ADMIN) {
    if (division && division !== 'all') {
      filter.division = division;
    }
  } else {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    filter.division = adminDivision;
  }

  if (programId && programId !== 'all') {
    filter.program = programId;
  }

  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  if (search && search.trim()) {
    filter.title = new RegExp(search.trim(), 'i');
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await ProgramAssessment.countDocuments(filter);
  const assessments = await ProgramAssessment.find(filter)
    .populate('program', 'title division level price')
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  return {
    assessments,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

/**
 * Gets a single assessment by ID.
 * When isStudent is true, hides correct answers.
 */
async function getAssessmentById(id, user, isStudent = false) {
  const assessment = await ProgramAssessment.findById(id)
    .populate('program', 'title division level description')
    .populate('createdBy', 'fullName email');

  if (!assessment) {
    throw ApiError.notFound('Assessment not found');
  }

  if (isStudent && !assessment.isActive) {
    throw ApiError.badRequest('This assessment is currently inactive');
  }

  if (!isStudent && user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (assessment.division !== adminDivision) {
      throw ApiError.forbidden('You cannot view an assessment outside your division');
    }
  }

  const obj = assessment.toObject();

  if (isStudent) {
    // Strip correct answers for students taking the test
    obj.questions = obj.questions.map((q) => {
      const { correctAnswer, ...rest } = q;
      return rest;
    });
  }

  return obj;
}

/**
 * Updates an assessment.
 */
async function updateAssessment(id, data, user) {
  const assessment = await ProgramAssessment.findById(id);
  if (!assessment) {
    throw ApiError.notFound('Assessment not found');
  }

  if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (assessment.division !== adminDivision) {
      throw ApiError.forbidden('You cannot modify an assessment outside your division');
    }
  }

  const before = assessment.toObject();

  if (data.title && data.title.trim()) assessment.title = data.title.trim();
  if (data.description !== undefined) assessment.description = data.description.trim();
  if (data.instructions !== undefined) assessment.instructions = data.instructions.trim();
  if (Array.isArray(data.questions) && data.questions.length > 0) assessment.questions = data.questions;
  if (data.thresholds) {
    assessment.thresholds = {
      recommended: Number(data.thresholds.recommended) || assessment.thresholds.recommended,
      foundation: Number(data.thresholds.foundation) || assessment.thresholds.foundation,
      manualReview: Number(data.thresholds.manualReview) || assessment.thresholds.manualReview,
    };
  }
  if (data.timeLimitMinutes) assessment.timeLimitMinutes = Math.max(Number(data.timeLimitMinutes), 5);
  if (data.isActive !== undefined) assessment.isActive = Boolean(data.isActive);

  assessment.updatedBy = user._id;
  await assessment.save();

  await recordAudit({
    user,
    action: 'ASSESSMENT_UPDATED',
    resource: 'ProgramAssessment',
    resourceId: assessment._id,
    division: assessment.division,
    before,
    after: assessment.toObject(),
    reason: `Assessment updated by ${user.role} ${user.fullName}`,
  });

  return assessment;
}

/**
 * Toggles assessment active/inactive status.
 */
async function toggleAssessmentStatus(id, isActive, user) {
  return updateAssessment(id, { isActive }, user);
}

/**
 * Deletes or archives an assessment.
 */
async function deleteAssessment(id, user) {
  const assessment = await ProgramAssessment.findById(id);
  if (!assessment) {
    throw ApiError.notFound('Assessment not found');
  }

  if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (assessment.division !== adminDivision) {
      throw ApiError.forbidden('You cannot delete an assessment outside your division');
    }
  }

  const attemptsCount = await AssessmentAttempt.countDocuments({ assessment: assessment._id });
  if (attemptsCount > 0) {
    // Soft deactivation if attempts exist
    assessment.isActive = false;
    assessment.updatedBy = user._id;
    await assessment.save();

    await recordAudit({
      user,
      action: 'ASSESSMENT_DEACTIVATED',
      resource: 'ProgramAssessment',
      resourceId: assessment._id,
      division: assessment.division,
      after: { isActive: false },
      reason: `Assessment deactivated rather than deleted because ${attemptsCount} student attempts exist`,
    });

    return { message: 'Assessment has student attempts and was deactivated rather than deleted', archived: true };
  }

  await ProgramAssessment.findByIdAndDelete(assessment._id);

  await recordAudit({
    user,
    action: 'ASSESSMENT_DELETED',
    resource: 'ProgramAssessment',
    resourceId: assessment._id,
    division: assessment.division,
    before: assessment.toObject(),
    reason: `Assessment deleted by ${user.role} ${user.fullName}`,
  });

  return { message: 'Assessment deleted successfully', deleted: true };
}

/**
 * Student Assessment Submission Flow.
 * Grades the attempt, assigns decision-support result, links to student application.
 * (Does NOT auto-accept or reject; provides decision-support evidence).
 */
async function submitAssessmentAttempt({ assessmentId, answers = [], completionTimeMinutes = 1, user }) {
  const assessment = await ProgramAssessment.findById(assessmentId);
  if (!assessment || !assessment.isActive) {
    throw ApiError.notFound('Active assessment not found');
  }

  let totalPoints = 0;
  let maxPoints = 0;
  const gradedAnswers = [];

  assessment.questions.forEach((q, idx) => {
    const weight = Number(q.weight) || 1;
    maxPoints += weight;

    const studentAns = answers.find((a) => a.questionIndex === idx || a.questionId === String(q._id));
    const selectedAnswer = studentAns ? studentAns.selectedAnswer : null;

    let isCorrect = false;
    if (selectedAnswer !== null && selectedAnswer !== undefined) {
      if (Array.isArray(q.correctAnswer)) {
        if (Array.isArray(selectedAnswer)) {
          isCorrect =
            q.correctAnswer.length === selectedAnswer.length &&
            q.correctAnswer.every((ans) => selectedAnswer.includes(ans));
        }
      } else {
        isCorrect = String(selectedAnswer).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
      }
    }

    const points = isCorrect ? weight : 0;
    totalPoints += points;

    gradedAnswers.push({
      questionIndex: idx,
      questionText: q.questionText,
      selectedAnswer,
      isCorrect,
      pointsAwarded: points,
      maxPoints: weight,
    });
  });

  const scorePercentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  // Determine decision-support recommendation result
  let result = 'NOT_RECOMMENDED';
  if (scorePercentage >= assessment.thresholds.recommended) {
    result = 'RECOMMENDED';
  } else if (scorePercentage >= assessment.thresholds.foundation) {
    result = 'FOUNDATION_RECOMMENDED';
  } else if (scorePercentage >= assessment.thresholds.manualReview) {
    result = 'MANUAL_REVIEW';
  }

  // Link to existing student application for this program if one exists
  const application = await Application.findOne({
    student: user._id,
    program: assessment.program,
  }).sort({ createdAt: -1 });

  const attempt = await AssessmentAttempt.create({
    assessment: assessment._id,
    program: assessment.program,
    student: user._id,
    division: assessment.division,
    application: application ? application._id : null,
    answers: gradedAnswers,
    totalPoints,
    maxPoints,
    score: scorePercentage,
    completionTimeMinutes: Math.max(Number(completionTimeMinutes) || 1, 1),
    result,
    submittedAt: new Date(),
  });

  // Decision support note on application without bypassing human admission workflow
  if (application) {
    application.notes = application.notes || [];
    application.notes.push({
      author: user._id,
      authorRole: 'SYSTEM',
      body: `Student completed program assessment "${assessment.title}". Score: ${scorePercentage}% (${result}). Decision support evidence recorded.`,
      createdAt: new Date(),
    });
    await application.save();
  }

  return {
    attempt,
    attemptId: attempt._id,
    score: scorePercentage,
    totalPoints,
    maxPoints,
    result,
    submittedAt: attempt.submittedAt,
    completionTimeMinutes: attempt.completionTimeMinutes,
    message: 'Assessment submitted successfully. Results will be reviewed by the admissions committee.',
  };
}

/**
 * Lists attempts for an assessment.
 */
async function listAttemptsForAssessment(assessmentId, user) {
  const assessment = await ProgramAssessment.findById(assessmentId);
  if (!assessment) throw ApiError.notFound('Assessment not found');

  if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (assessment.division !== adminDivision) {
      throw ApiError.forbidden('You cannot view attempts for an assessment outside your division');
    }
  }

  const attempts = await AssessmentAttempt.find({ assessment: assessment._id })
    .populate('student', 'fullName email')
    .sort({ submittedAt: -1 });

  return attempts;
}

/**
 * Lists student's own attempts.
 */
async function listStudentAttempts(studentUserId) {
  const attempts = await AssessmentAttempt.find({ student: studentUserId })
    .populate('assessment', 'title program')
    .populate('program', 'title division level')
    .sort({ submittedAt: -1 });

  return attempts;
}

module.exports = {
  createAssessment,
  listAssessments,
  getAssessmentById,
  updateAssessment,
  toggleAssessmentStatus,
  deleteAssessment,
  submitAssessmentAttempt,
  listAttemptsForAssessment,
  listStudentAttempts,
};
