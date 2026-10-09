const evaluationService = require('../services/evaluationService');

async function evaluateCohortAdmin(req, res, next) {
  try {
    const result = await evaluationService.evaluateCohort({
      cohortId: req.params.id,
      user: req.user,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getCohortEvaluationsAdmin(req, res, next) {
  try {
    const result = await evaluationService.getCohortEvaluations({
      cohortId: req.params.id,
      user: req.user,
      studentId: req.query.studentId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getCohortEvaluationsInstructor(req, res, next) {
  try {
    const result = await evaluationService.getCohortEvaluations({
      cohortId: req.params.id,
      user: req.user,
      studentId: req.query.studentId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getMyEvaluations(req, res, next) {
  try {
    const evaluations = await evaluationService.getStudentEvaluations(req.user._id);
    res.json({ success: true, data: evaluations });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  evaluateCohortAdmin,
  getCohortEvaluationsAdmin,
  getCohortEvaluationsInstructor,
  getMyEvaluations,
};
