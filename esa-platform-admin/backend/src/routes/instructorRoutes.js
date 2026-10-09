const express = require('express');
const {
  listInstructorCohorts,
  getInstructorCohortDetails,
  recordAttendance,
  getAttendance,
  createAssignmentAdmin,
  listAssignmentsAdmin,
  recordGrades,
  getGrades,
} = require('../controllers/cohortController');
const { getCohortEvaluationsInstructor } = require('../controllers/evaluationController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

const router = express.Router();

// Allow Instructors as well as Division/Super Admins
const INSTRUCTOR_OR_ADMIN_ROLES = [
  ROLES.INSTRUCTOR,
  ROLES.SUPER_ADMIN,
  ROLES.PRE_UNIVERSITY_ADMIN,
  ROLES.UNIVERSITY_ADMIN,
];

router.use(protect, authorize(...INSTRUCTOR_OR_ADMIN_ROLES));

// Cohort listing and details for instructor
router.get('/cohorts', listInstructorCohorts);
router.get('/cohorts/:id', getInstructorCohortDetails);

// Session Attendance
router.post('/cohorts/:id/attendance', recordAttendance);
router.get('/cohorts/:id/attendance', getAttendance);

// Cohort Assignments
router.post('/cohorts/:id/assignments', createAssignmentAdmin);
router.get('/cohorts/:id/assignments', listAssignmentsAdmin);

// Assignment Grading
router.post('/assignments/:id/grades', recordGrades);
router.get('/assignments/:id/grades', getGrades);

// Phase 12: Cohort Evaluations (read-only for assigned instructor)
router.get('/cohorts/:id/evaluations', getCohortEvaluationsInstructor);

module.exports = router;
