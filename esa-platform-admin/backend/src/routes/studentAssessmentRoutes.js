const express = require('express');
const {
  getAssessmentsForProgramStudent,
  getAssessmentByIdStudent,
  submitAssessmentAttemptStudent,
  getMyAssessmentAttemptsStudent,
} = require('../controllers/assessmentController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

const router = express.Router();

// Student-accessible assessment endpoints
router.use(protect);

router.get('/my-attempts', authorize(ROLES.STUDENT), getMyAssessmentAttemptsStudent);
router.get('/program/:programId', getAssessmentsForProgramStudent);
router.get('/:id', getAssessmentByIdStudent);
router.post('/:id/submit', authorize(ROLES.STUDENT), submitAssessmentAttemptStudent);

module.exports = router;
