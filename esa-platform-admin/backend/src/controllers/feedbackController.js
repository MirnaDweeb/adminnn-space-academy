/**
 * feedbackController.js
 *
 * Controllers for Admin Feedback Center and Student Feedback Submission.
 */

const feedbackService = require('../services/feedbackService');

/**
 * GET /api/admin/feedback
 */
async function listFeedbackAdminController(req, res, next) {
  try {
    const { division, program, cohort, rating, feedbackType, sentiment, search, page, limit } = req.query;
    const activeDivision = req.scopeDivision || req.division || division;

    const result = await feedbackService.listFeedbackAdmin({
      user: req.user,
      division: activeDivision,
      program,
      cohort,
      rating,
      feedbackType,
      sentiment,
      search,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/feedback/summary
 */
async function getFeedbackSummaryAdminController(req, res, next) {
  try {
    const { division, program, cohort } = req.query;
    const activeDivision = req.scopeDivision || req.division || division;

    const result = await feedbackService.getFeedbackSummaryAdmin({
      user: req.user,
      division: activeDivision,
      program,
      cohort,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/student/mine/feedback
 */
async function submitFeedbackController(req, res, next) {
  try {
    const { programId, cohortId, rating, feedbackType, comments, strengths, improvements } = req.body;
    const feedback = await feedbackService.submitStudentFeedback({
      studentId: req.user._id,
      programId,
      cohortId,
      rating,
      feedbackType,
      comments,
      strengths,
      improvements,
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully. Thank you for helping improve the Academy.',
      data: { feedback },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFeedbackAdminController,
  getFeedbackSummaryAdminController,
  submitFeedbackController,
};
