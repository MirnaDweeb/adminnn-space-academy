const Cohort = require('../models/Cohort');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const Assessment = require('../models/Assessment');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const InstructorProfile = require('../models/InstructorProfile');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { ROLES } = require('../constants/roles');
const { ENROLLMENT_STATUS, COHORT_STATUS, ATTENDANCE_STATUS } = require('../constants/statuses');

/**
 * Validates whether the user is authorized to manage or view the given cohort.
 */
function assertCohortAccess(cohort, user, action = 'view') {
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  // Super Admin can do everything across divisions
  if (user.role === ROLES.SUPER_ADMIN) {
    return true;
  }

  // Division Admin: must match division
  if (user.role === ROLES.PRE_UNIVERSITY_ADMIN || user.role === ROLES.UNIVERSITY_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (cohort.division !== adminDivision) {
      throw ApiError.forbidden(`You cannot access a cohort outside your division (${cohort.division})`);
    }
    return true;
  }

  // Instructor: must be the assigned instructor for this cohort
  if (user.role === ROLES.INSTRUCTOR) {
    const assignedInstructorId = cohort.instructor?._id || cohort.instructor;
    if (String(assignedInstructorId) !== String(user._id)) {
      throw ApiError.forbidden('You are not the assigned instructor for this cohort');
    }
    return true;
  }

  // Student: handled in student-specific methods
  if (user.role === ROLES.STUDENT) {
    throw ApiError.forbidden('Students cannot perform this administrative/instructor action');
  }

  throw ApiError.forbidden('Access denied');
}

/**
 * Create a new Cohort for a Program with sessions and assigned instructor.
 */
async function createCohort({ programId, name, instructorId, startDate, endDate, sessions = [], capacity, user }) {
  const program = await Course.findById(programId);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  // Division check for division admins
  if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (program.division !== adminDivision) {
      throw ApiError.forbidden(`Cannot create a cohort for a program outside your division (${program.division})`);
    }
  }

  // Instructor validation
  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== ROLES.INSTRUCTOR || !instructor.isActive) {
    throw ApiError.badRequest('Selected instructor is invalid or inactive');
  }

  // Validate instructor division
  const instructorProfile = await InstructorProfile.findOne({ user: instructor._id });
  if (instructorProfile && instructorProfile.division !== program.division) {
    throw ApiError.badRequest(`Instructor division (${instructorProfile.division}) does not match program division (${program.division})`);
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw ApiError.badRequest('Invalid start or end date');
  }
  if (start > end) {
    throw ApiError.badRequest('Start date must be before or equal to end date');
  }

  // Generate unique cohort number: COH-DIV-YEAR-XXX
  const divPrefix = program.division === 'PRE_UNIVERSITY' ? 'PRE' : 'UNI';
  const year = start.getFullYear();
  let seq = (await Cohort.countDocuments({ division: program.division })) + 1;
  let cohortNumber = `COH-${divPrefix}-${year}-${String(seq).padStart(3, '0')}`;
  while (await Cohort.exists({ cohortNumber })) {
    seq++;
    cohortNumber = `COH-${divPrefix}-${year}-${String(seq).padStart(3, '0')}`;
  }

  // Process sessions
  const formattedSessions = sessions.map((s, idx) => ({
    sessionNumber: s.sessionNumber || idx + 1,
    date: new Date(s.date || start),
    topic: (s.topic || `Session ${idx + 1}`).trim(),
    durationMinutes: Number(s.durationMinutes) || 120,
    location: (s.location || 'Training Lab / Online').trim(),
  }));

  // Create Cohort
  const cohort = await Cohort.create({
    cohortNumber,
    name: name.trim(),
    program: program._id,
    division: program.division,
    instructor: instructor._id,
    startDate: start,
    endDate: end,
    status: COHORT_STATUS.SCHEDULED,
    capacity: capacity ? Number(capacity) : program.capacity,
    sessions: formattedSessions,
    createdBy: user._id,
  });

  // Automatically link any CONFIRMED enrollments for this program that do not yet have a cohort
  await Enrollment.updateMany(
    {
      program: program._id,
      status: ENROLLMENT_STATUS.CONFIRMED,
      cohort: null,
    },
    { $set: { cohort: cohort._id } }
  );

  // Audit Log
  await recordAudit({
    user: user._id,
    action: 'COHORT_CREATED',
    resource: 'Cohort',
    resourceId: cohort._id,
    division: cohort.division,
    after: {
      cohortNumber: cohort.cohortNumber,
      name: cohort.name,
      program: program.title,
      instructor: instructor.fullName,
      sessionsCount: formattedSessions.length,
    },
    reason: `Cohort ${cohort.cohortNumber} created by ${user.fullName || user.email}`,
  });

  return await Cohort.findById(cohort._id)
    .populate('program', 'title division level price deliveryMode')
    .populate('instructor', 'fullName email');
}

/**
 * List cohorts scoped by division and/or instructor.
 */
async function listCohorts({ division, instructorId, status, search, page = 1, limit = 20, user }) {
  const query = {};

  if (user.role === ROLES.INSTRUCTOR) {
    query.instructor = user._id;
  } else if (user.role !== ROLES.SUPER_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    query.division = adminDivision;
  } else if (division && division !== 'all') {
    query.division = division;
  }

  if (instructorId && user.role !== ROLES.INSTRUCTOR) {
    query.instructor = instructorId;
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [{ name: regex }, { cohortNumber: regex }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Cohort.countDocuments(query);
  const cohorts = await Cohort.find(query)
    .populate('program', 'title division level price')
    .populate('instructor', 'fullName email')
    .sort({ startDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  // Compute enrolled student count for each cohort
  const cohortsWithCounts = await Promise.all(
    cohorts.map(async (c) => {
      const confirmedCount = await Enrollment.countDocuments({
        cohort: c._id,
        status: ENROLLMENT_STATUS.CONFIRMED,
      });
      const obj = c.toObject();
      obj.enrolledCount = confirmedCount;
      return obj;
    })
  );

  return {
    cohorts: cohortsWithCounts,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)) || 1,
    },
  };
}

/**
 * Get single cohort detail with confirmed student roster and assignments.
 */
async function getCohortById(cohortId, user) {
  const cohort = await Cohort.findById(cohortId)
    .populate('program', 'title description division level price deliveryMode')
    .populate('instructor', 'fullName email phone')
    .populate('createdBy', 'fullName email');

  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'view');

  // Fetch confirmed student roster
  const enrollments = await Enrollment.find({
    cohort: cohort._id,
    status: ENROLLMENT_STATUS.CONFIRMED,
  })
    .populate('student', 'fullName email phone studentProfile')
    .populate('application', 'applicationNumber status decision submittedAt')
    .sort({ enrolledAt: 1 });

  // Fetch assignments for this cohort
  const assignments = await Assignment.find({ cohort: cohort._id }).sort({ dueDate: 1 });

  return {
    cohort,
    roster: enrollments.map((e) => ({
      enrollmentId: e._id,
      student: e.student,
      application: e.application,
      confirmedAt: e.confirmedAt,
      enrolledAt: e.enrolledAt,
    })),
    assignments,
  };
}

/**
 * Assign a confirmed student enrollment to a cohort.
 */
async function assignEnrollmentToCohort(cohortId, enrollmentId, user) {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }
  assertCohortAccess(cohort, user, 'edit');

  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }
  if (enrollment.status !== ENROLLMENT_STATUS.CONFIRMED) {
    throw ApiError.badRequest('Only CONFIRMED enrollments can be assigned to a cohort');
  }
  if (String(enrollment.program) !== String(cohort.program)) {
    throw ApiError.badRequest('Enrollment program does not match cohort program');
  }

  enrollment.cohort = cohort._id;
  await enrollment.save();

  return enrollment;
}

/**
 * Record attendance for a cohort session (bulk: array of { studentId, status, notes }).
 */
async function recordAttendanceBulk({ cohortId, sessionId, attendanceRecords = [], user }) {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'attendance');

  const session = cohort.sessions.id(sessionId);
  if (!session) {
    throw ApiError.notFound('Session not found in this cohort');
  }

  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    throw ApiError.badRequest('Attendance records array is required');
  }

  const updatedRecords = [];

  for (const item of attendanceRecords) {
    const { studentId, status, notes = '', reason = 'Attendance recording' } = item;

    if (!Object.values(ATTENDANCE_STATUS).includes(status)) {
      throw ApiError.badRequest(`Invalid attendance status: ${status}`);
    }

    // Business Rule: Attendance can only be recorded for students with a CONFIRMED enrollment in that cohort!
    const enrollment = await Enrollment.findOne({
      cohort: cohort._id,
      student: studentId,
      status: ENROLLMENT_STATUS.CONFIRMED,
    });

    if (!enrollment) {
      throw ApiError.badRequest(`Student ${studentId} does not have a CONFIRMED enrollment in this cohort.`);
    }

    // Check if attendance already exists
    let record = await Attendance.findOne({
      cohort: cohort._id,
      sessionId: session._id,
      student: studentId,
    });

    if (record) {
      // Historical correction: push old state to history
      record.history.push({
        status: record.status,
        notes: record.notes,
        recordedBy: record.recordedBy,
        recordedAt: record.recordedAt,
        reason,
      });
      record.status = status;
      record.notes = notes.trim();
      record.recordedBy = user._id;
      record.recordedAt = new Date();
      await record.save();
    } else {
      record = await Attendance.create({
        cohort: cohort._id,
        sessionId: session._id,
        sessionNumber: session.sessionNumber,
        sessionDate: session.date,
        student: studentId,
        enrollment: enrollment._id,
        status,
        notes: notes.trim(),
        recordedBy: user._id,
        recordedAt: new Date(),
        history: [],
      });
    }

    updatedRecords.push(record);
  }

  // Audit Log
  await recordAudit({
    user: user._id,
    action: 'ATTENDANCE_RECORDED',
    resource: 'Cohort',
    resourceId: cohort._id,
    division: cohort.division,
    after: {
      cohortId: cohort._id,
      cohortNumber: cohort.cohortNumber,
      sessionId: session._id,
      sessionNumber: session.sessionNumber,
      recordsCount: updatedRecords.length,
    },
    reason: `Attendance recorded for ${cohort.cohortNumber} Session #${session.sessionNumber} by ${user.fullName || user.email}`,
  });

  return updatedRecords;
}

/**
 * Get attendance records for a cohort (optionally filtered by sessionId).
 */
async function getAttendanceForCohort(cohortId, sessionId, user) {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'view');

  const filter = { cohort: cohort._id };
  if (sessionId) {
    filter.sessionId = sessionId;
  }

  const records = await Attendance.find(filter)
    .populate('student', 'fullName email')
    .populate('recordedBy', 'fullName email')
    .sort({ sessionNumber: 1, 'student.fullName': 1 });

  return records;
}

/**
 * Create an Assignment for a cohort.
 */
async function createAssignment({ cohortId, title, description = '', dueDate, maxScore = 100, user }) {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'assignment');

  if (!title || !title.trim()) {
    throw ApiError.badRequest('Assignment title is required');
  }

  const due = new Date(dueDate);
  if (isNaN(due.getTime())) {
    throw ApiError.badRequest('Valid due date is required');
  }

  const scoreNum = Number(maxScore);
  if (isNaN(scoreNum) || scoreNum <= 0) {
    throw ApiError.badRequest('Maximum score must be greater than zero');
  }

  const assignment = await Assignment.create({
    cohort: cohort._id,
    title: title.trim(),
    description: description.trim(),
    dueDate: due,
    maxScore: scoreNum,
    createdBy: user._id,
  });

  // Audit Log
  await recordAudit({
    user: user._id,
    action: 'ASSIGNMENT_CREATED',
    resource: 'Assignment',
    resourceId: assignment._id,
    division: cohort.division,
    after: {
      assignmentId: assignment._id,
      title: assignment.title,
      maxScore: assignment.maxScore,
      dueDate: assignment.dueDate,
      cohortNumber: cohort.cohortNumber,
    },
    reason: `Assignment "${assignment.title}" created for cohort ${cohort.cohortNumber} by ${user.fullName || user.email}`,
  });

  return assignment;
}

/**
 * List assignments for a cohort.
 */
async function listAssignmentsForCohort(cohortId, user) {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'view');

  const assignments = await Assignment.find({ cohort: cohort._id }).sort({ dueDate: 1 });

  // Include submission counts
  const withCounts = await Promise.all(
    assignments.map(async (a) => {
      const gradedCount = await Assessment.countDocuments({ assignment: a._id });
      const obj = a.toObject();
      obj.gradedCount = gradedCount;
      return obj;
    })
  );

  return withCounts;
}

/**
 * Grade students on an assignment (bulk: array of { studentId, score, feedback }).
 */
async function recordGradesBulk({ assignmentId, grades = [], user }) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  const cohort = await Cohort.findById(assignment.cohort);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'grade');

  if (!Array.isArray(grades) || grades.length === 0) {
    throw ApiError.badRequest('Grades array is required');
  }

  const updatedAssessments = [];

  for (const item of grades) {
    const { studentId, score, feedback = '', reason = 'Grade entry' } = item;

    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0 || numScore > assignment.maxScore) {
      throw ApiError.badRequest(`Score must be between 0 and ${assignment.maxScore}`);
    }

    // Business Rule: Student must have a CONFIRMED enrollment in that cohort!
    const enrollment = await Enrollment.findOne({
      cohort: cohort._id,
      student: studentId,
      status: ENROLLMENT_STATUS.CONFIRMED,
    });

    if (!enrollment) {
      throw ApiError.badRequest(`Student ${studentId} does not have a CONFIRMED enrollment in this cohort.`);
    }

    let assessment = await Assessment.findOne({
      assignment: assignment._id,
      student: studentId,
    });

    if (assessment) {
      // Historical correction: push old state to history
      assessment.history.push({
        score: assessment.score,
        feedback: assessment.feedback,
        gradedBy: assessment.gradedBy,
        gradedAt: assessment.gradedAt,
        reason,
      });
      assessment.score = numScore;
      assessment.feedback = feedback.trim();
      assessment.gradedBy = user._id;
      assessment.gradedAt = new Date();
      await assessment.save();
    } else {
      assessment = await Assessment.create({
        assignment: assignment._id,
        cohort: cohort._id,
        student: studentId,
        enrollment: enrollment._id,
        score: numScore,
        feedback: feedback.trim(),
        gradedBy: user._id,
        gradedAt: new Date(),
        history: [],
      });
    }

    updatedAssessments.push(assessment);
  }

  // Audit Log
  await recordAudit({
    user: user._id,
    action: 'ASSESSMENT_RECORDED',
    resource: 'Assignment',
    resourceId: assignment._id,
    division: cohort.division,
    after: {
      assignmentId: assignment._id,
      title: assignment.title,
      gradesCount: updatedAssessments.length,
      cohortNumber: cohort.cohortNumber,
    },
    reason: `Grades recorded for assignment "${assignment.title}" in cohort ${cohort.cohortNumber} by ${user.fullName || user.email}`,
  });

  return updatedAssessments;
}

/**
 * Get assessments/grades for an assignment.
 */
async function getGradesForAssignment(assignmentId, user) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  const cohort = await Cohort.findById(assignment.cohort);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'view');

  const assessments = await Assessment.find({ assignment: assignment._id })
    .populate('student', 'fullName email')
    .populate('gradedBy', 'fullName email')
    .sort({ 'student.fullName': 1 });

  return assessments;
}

/**
 * Student-facing: Get student's enrolled cohorts with attendance history and grades (read-only).
 */
async function getStudentCohortsAndRecords(studentId) {
  const enrollments = await Enrollment.find({
    student: studentId,
    status: ENROLLMENT_STATUS.CONFIRMED,
    cohort: { $ne: null },
  })
    .populate({
      path: 'cohort',
      populate: [
        { path: 'program', select: 'title description division level deliveryMode' },
        { path: 'instructor', select: 'fullName email' },
      ],
    })
    .sort({ enrolledAt: -1 });

  const results = [];

  for (const enr of enrollments) {
    if (!enr.cohort) continue;

    const cohort = enr.cohort;

    // Student's attendance records for this cohort
    const attendanceRecords = await Attendance.find({
      cohort: cohort._id,
      student: studentId,
    }).sort({ sessionNumber: 1 });

    // Cohort's assignments
    const assignments = await Assignment.find({ cohort: cohort._id }).sort({ dueDate: 1 });

    // Student's assessments
    const assessments = await Assessment.find({
      cohort: cohort._id,
      student: studentId,
    }).populate('gradedBy', 'fullName');

    // Attendance stats
    const totalSessions = cohort.sessions?.length || 0;
    const presentCount = attendanceRecords.filter((a) => a.status === ATTENDANCE_STATUS.PRESENT).length;
    const lateCount = attendanceRecords.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;
    const absentCount = attendanceRecords.filter((a) => a.status === ATTENDANCE_STATUS.ABSENT).length;
    const excusedCount = attendanceRecords.filter((a) => a.status === ATTENDANCE_STATUS.EXCUSED).length;

    // Combine assignments with student's grades
    const assignmentsWithGrades = assignments.map((a) => {
      const grade = assessments.find((g) => String(g.assignment) === String(a._id));
      return {
        _id: a._id,
        title: a.title,
        description: a.description,
        dueDate: a.dueDate,
        maxScore: a.maxScore,
        score: grade ? grade.score : null,
        feedback: grade ? grade.feedback : null,
        gradedAt: grade ? grade.gradedAt : null,
        isGraded: !!grade,
      };
    });

    results.push({
      enrollmentId: enr._id,
      cohort: {
        _id: cohort._id,
        cohortNumber: cohort.cohortNumber,
        name: cohort.name,
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        status: cohort.status,
        program: cohort.program,
        instructor: cohort.instructor,
        sessions: cohort.sessions,
      },
      attendance: {
        totalSessions,
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        attendanceRate: totalSessions > 0 ? Math.round(((presentCount + lateCount) / totalSessions) * 100) : 0,
        records: attendanceRecords,
      },
      assignments: assignmentsWithGrades,
    });
  }

  return results;
}

/**
 * Update cohort schedule, capacity, instructor, status, or sessions.
 */
async function updateCohort(cohortId, updateData, user) {
  const cohort = await Cohort.findById(cohortId).populate('program');
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertCohortAccess(cohort, user, 'manage');

  const before = cohort.toObject();
  const oldInstructorId = cohort.instructor;

  if (updateData.name && updateData.name.trim()) {
    cohort.name = updateData.name.trim();
  }

  if (updateData.capacity !== undefined) {
    const cap = Number(updateData.capacity);
    if (!Number.isInteger(cap) || cap < 1) {
      throw ApiError.badRequest('Capacity must be a positive integer');
    }
    cohort.capacity = cap;
  }

  if (updateData.startDate) {
    const s = new Date(updateData.startDate);
    if (isNaN(s.getTime())) throw ApiError.badRequest('Invalid start date');
    cohort.startDate = s;
  }

  if (updateData.endDate) {
    const e = new Date(updateData.endDate);
    if (isNaN(e.getTime())) throw ApiError.badRequest('Invalid end date');
    cohort.endDate = e;
  }

  if (cohort.startDate > cohort.endDate) {
    throw ApiError.badRequest('Start date must be before or equal to end date');
  }

  if (updateData.status && Object.values(COHORT_STATUS).includes(updateData.status)) {
    cohort.status = updateData.status;
  }

  if (updateData.instructorId && String(updateData.instructorId) !== String(cohort.instructor)) {
    const instructor = await User.findById(updateData.instructorId);
    if (!instructor || instructor.role !== ROLES.INSTRUCTOR || !instructor.isActive) {
      throw ApiError.badRequest('Selected instructor is invalid or inactive');
    }
    const instructorProfile = await InstructorProfile.findOne({ user: instructor._id });
    if (instructorProfile && instructorProfile.division !== cohort.division) {
      throw ApiError.badRequest(`Instructor division (${instructorProfile.division}) does not match cohort division (${cohort.division})`);
    }
    cohort.instructor = instructor._id;
  }

  if (Array.isArray(updateData.sessions)) {
    cohort.sessions = updateData.sessions.map((s, idx) => ({
      sessionNumber: s.sessionNumber || idx + 1,
      date: new Date(s.date || cohort.startDate),
      topic: (s.topic || `Session ${idx + 1}`).trim(),
      durationMinutes: Number(s.durationMinutes) || 120,
      location: (s.location || 'Training Lab / Online').trim(),
    }));
  }

  cohort.updatedBy = user._id;
  await cohort.save();

  // Audit Log
  await recordAudit({
    user: user._id,
    action: 'COHORT_SCHEDULE_CHANGED',
    resource: 'Cohort',
    resourceId: cohort._id,
    division: cohort.division,
    before,
    after: cohort.toObject(),
    reason: updateData.reason || `Cohort ${cohort.cohortNumber} updated by ${user.fullName || user.email}`,
  });

  // If instructor was changed, sync both old and new instructor access
  if (updateData.instructorId && String(updateData.instructorId) !== String(oldInstructorId)) {
    try {
      const { syncInstructorAccess } = require('./instructorAccessService');
      await syncInstructorAccess(oldInstructorId, user);
      await syncInstructorAccess(cohort.instructor, user);
    } catch (e) {
      // Non-blocking log
    }
  }

  return await Cohort.findById(cohort._id)
    .populate('program', 'title division level price deliveryMode')
    .populate('instructor', 'fullName email');
}

module.exports = {
  createCohort,
  listCohorts,
  getCohortById,
  updateCohort,
  assignEnrollmentToCohort,
  recordAttendanceBulk,
  getAttendanceForCohort,
  createAssignment,
  listAssignmentsForCohort,
  recordGradesBulk,
  getGradesForAssignment,
  getStudentCohortsAndRecords,
};
