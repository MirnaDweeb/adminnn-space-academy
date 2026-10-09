const cohortService = require('../services/cohortService');

// =========================================================================
// ADMIN CONTROLLERS
// =========================================================================

async function createCohortAdmin(req, res, next) {
  try {
    const cohort = await cohortService.createCohort({
      ...req.body,
      user: req.user,
    });
    res.status(201).json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
}

async function listCohortsAdmin(req, res, next) {
  try {
    const division = req.scopeDivision || req.query.division;
    const result = await cohortService.listCohorts({
      division,
      status: req.query.status,
      instructorId: req.query.instructorId,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      user: req.user,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getCohortByIdAdmin(req, res, next) {
  try {
    const result = await cohortService.getCohortById(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function updateCohortAdmin(req, res, next) {
  try {
    const cohort = await cohortService.updateCohort(req.params.id, req.body, req.user);
    res.json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
}

async function assignEnrollmentAdmin(req, res, next) {
  try {
    const result = await cohortService.assignEnrollmentToCohort(
      req.params.id,
      req.body.enrollmentId,
      req.user
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function createAssignmentAdmin(req, res, next) {
  try {
    const assignment = await cohortService.createAssignment({
      cohortId: req.params.id,
      ...req.body,
      user: req.user,
    });
    res.status(201).json({ success: true, data: assignment });
  } catch (err) {
    next(err);
  }
}

async function listAssignmentsAdmin(req, res, next) {
  try {
    const assignments = await cohortService.listAssignmentsForCohort(req.params.id, req.user);
    res.json({ success: true, data: assignments });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// INSTRUCTOR CONTROLLERS
// =========================================================================

async function listInstructorCohorts(req, res, next) {
  try {
    const result = await cohortService.listCohorts({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      user: req.user,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getInstructorCohortDetails(req, res, next) {
  try {
    const result = await cohortService.getCohortById(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function recordAttendance(req, res, next) {
  try {
    const records = await cohortService.recordAttendanceBulk({
      cohortId: req.params.id,
      sessionId: req.body.sessionId,
      attendanceRecords: req.body.attendanceRecords || req.body.records || [],
      user: req.user,
    });
    res.json({ success: true, data: { records, count: records.length } });
  } catch (err) {
    next(err);
  }
}

async function getAttendance(req, res, next) {
  try {
    const records = await cohortService.getAttendanceForCohort(
      req.params.id,
      req.query.sessionId,
      req.user
    );
    res.json({ success: true, data: { records, count: records.length } });
  } catch (err) {
    next(err);
  }
}

async function recordGrades(req, res, next) {
  try {
    const grades = await cohortService.recordGradesBulk({
      assignmentId: req.params.id,
      grades: req.body.grades || req.body.records || [],
      user: req.user,
    });
    res.json({ success: true, data: { grades, count: grades.length } });
  } catch (err) {
    next(err);
  }
}

async function getGrades(req, res, next) {
  try {
    const grades = await cohortService.getGradesForAssignment(req.params.id, req.user);
    res.json({ success: true, data: { grades, count: grades.length } });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// STUDENT CONTROLLERS
// =========================================================================

async function getMyCohorts(req, res, next) {
  try {
    const results = await cohortService.getStudentCohortsAndRecords(req.user._id);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCohortAdmin,
  listCohortsAdmin,
  getCohortByIdAdmin,
  updateCohortAdmin,
  assignEnrollmentAdmin,
  createAssignmentAdmin,
  listAssignmentsAdmin,
  listInstructorCohorts,
  getInstructorCohortDetails,
  recordAttendance,
  getAttendance,
  recordGrades,
  getGrades,
  getMyCohorts,
};
