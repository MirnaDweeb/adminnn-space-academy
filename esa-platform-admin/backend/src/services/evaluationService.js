const Evaluation = require('../models/Evaluation');
const Cohort = require('../models/Cohort');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const Assessment = require('../models/Assessment');
const Certificate = require('../models/Certificate');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { ROLES } = require('../constants/roles');
const {
  ENROLLMENT_STATUS,
  ATTENDANCE_STATUS,
} = require('../constants/statuses');
const {
  EVALUATION_OUTCOME,
  ATTENDANCE_PASSING_THRESHOLD,
  SCORE_PASSING_THRESHOLD,
} = require('../constants/evaluations');
const { notifyUser, wrapEmailHtml } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');


/**
 * Validates administrative access for evaluation computation.
 * Only SUPER_ADMIN or Division Admin for their own division can trigger evaluation.
 */
function assertEvaluationAdminAccess(cohort, user) {
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  if (user.role === ROLES.SUPER_ADMIN) {
    return true;
  }

  if (user.role === ROLES.PRE_UNIVERSITY_ADMIN || user.role === ROLES.UNIVERSITY_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (cohort.division !== adminDivision) {
      throw ApiError.forbidden(`You cannot evaluate a cohort outside your division (${cohort.division})`);
    }
    return true;
  }

  // Instructors, Students, and other roles cannot trigger evaluations
  throw ApiError.forbidden('Only division administrators or super administrators can trigger cohort evaluations');
}

/**
 * Validates view access for cohort evaluations.
 * Super Admin: all divisions.
 * Division Admin: own division.
 * Instructor: assigned cohort only.
 */
function assertEvaluationViewAccess(cohort, user) {
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  if (user.role === ROLES.SUPER_ADMIN) {
    return true;
  }

  if (user.role === ROLES.PRE_UNIVERSITY_ADMIN || user.role === ROLES.UNIVERSITY_ADMIN) {
    const adminDivision = user.division || (user.role === ROLES.PRE_UNIVERSITY_ADMIN ? 'PRE_UNIVERSITY' : 'UNIVERSITY');
    if (cohort.division !== adminDivision) {
      throw ApiError.forbidden(`You cannot view evaluations outside your division (${cohort.division})`);
    }
    return true;
  }

  if (user.role === ROLES.INSTRUCTOR) {
    const assignedInstructorId = cohort.instructor?._id || cohort.instructor;
    if (String(assignedInstructorId) !== String(user._id)) {
      throw ApiError.forbidden('You can only view evaluations for your assigned cohort');
    }
    return true;
  }

  throw ApiError.forbidden('Access denied');
}

/**
 * Deterministically compute evaluations for all CONFIRMED enrollments in a cohort.
 * Append-only: Re-running evaluation creates new records, never overwriting history.
 *
 * Evaluation & Gate Policy:
 * 1. Mandatory Attendance Gate (>= 80%):
 *    Failure of mandatory attendance gate forces outcome FAIL regardless of assignment score.
 *    (Aligns with Phase 8 readiness gate precedence where gate failure overrides points).
 * 2. Academic Score Threshold (>= 60%):
 *    If attendance gate passes, average score must meet or exceed passing threshold (60%).
 * 3. Coursework Completion:
 *    If cohort has assignments and student has zero graded assessments, outcome is INCOMPLETE.
 *
 * @param {Object} params
 * @param {string} params.cohortId
 * @param {Object} params.user
 * @returns {Promise<Object>} Created evaluation records and summary stats
 */
async function evaluateCohort({ cohortId, user }) {
  const cohort = await Cohort.findById(cohortId).populate('program');
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertEvaluationAdminAccess(cohort, user);

  // Business Rule: Evaluation only applies to CONFIRMED enrollments in the cohort.
  // Students without confirmed enrollment are excluded, NOT defaulted to FAIL.
  const enrollments = await Enrollment.find({
    cohort: cohort._id,
    status: ENROLLMENT_STATUS.CONFIRMED,
  }).populate('student', 'fullName email phone studentProfile');

  const sessions = cohort.sessions || [];
  const totalSessions = sessions.length;
  const assignments = await Assignment.find({ cohort: cohort._id });

  const createdEvaluations = [];
  let passCount = 0;
  let failCount = 0;
  let incompleteCount = 0;

  for (const enrollment of enrollments) {
    const student = enrollment.student;
    const studentId = student._id || student;

    // 1. Attendance aggregation
    const attendanceRecords = await Attendance.find({
      cohort: cohort._id,
      student: studentId,
    });

    const attendedCount = attendanceRecords.filter(
      (r) => r.status === ATTENDANCE_STATUS.PRESENT || r.status === ATTENDANCE_STATUS.LATE
    ).length;

    const attendanceRate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;
    const attendanceThresholdMet = attendanceRate >= ATTENDANCE_PASSING_THRESHOLD;

    // 2. Assessment aggregation
    const assessments = await Assessment.find({
      cohort: cohort._id,
      student: studentId,
    });

    let averageScore = 0;
    let gradedAssignmentsCount = 0;

    if (assignments.length === 0) {
      // If no assignments created for cohort, academic score is 100% default
      averageScore = 100;
    } else {
      let totalPercentage = 0;
      for (const assignment of assignments) {
        const assessment = assessments.find(
          (a) => String(a.assignment) === String(assignment._id)
        );
        if (assessment && typeof assessment.score === 'number') {
          const assignmentMax = assignment.maxScore || 100;
          const pct = Math.min(100, Math.max(0, (assessment.score / assignmentMax) * 100));
          totalPercentage += pct;
          gradedAssignmentsCount++;
        }
      }
      averageScore = Math.round(totalPercentage / assignments.length);
    }

    // 3. Outcome determination
    let outcome;
    let outcomeReason;

    // Rule A: Mandatory Attendance Gate failure overrides score (precedent from Phase 8)
    if (!attendanceThresholdMet) {
      outcome = EVALUATION_OUTCOME.FAIL;
      outcomeReason = `Attendance rate (${attendanceRate}%) is below mandatory threshold (${ATTENDANCE_PASSING_THRESHOLD}%) — attendance gate failure overrides academic score`;
      failCount++;
    } else if (assignments.length > 0 && gradedAssignmentsCount === 0) {
      // Rule B: Attendance met, but zero assignments graded / submitted
      outcome = EVALUATION_OUTCOME.INCOMPLETE;
      outcomeReason = `Coursework incomplete: No graded assessments recorded for ${assignments.length} cohort assignments`;
      incompleteCount++;
    } else if (averageScore >= SCORE_PASSING_THRESHOLD) {
      // Rule C: Attendance met and score >= 60%
      outcome = EVALUATION_OUTCOME.PASS;
      outcomeReason = `Requirements met: Attendance rate (${attendanceRate}%) and average score (${averageScore}%) meet or exceed passing thresholds`;
      passCount++;
    } else {
      // Rule D: Attendance met but score < 60%
      outcome = EVALUATION_OUTCOME.FAIL;
      outcomeReason = `Average score (${averageScore}%) is below passing threshold (${SCORE_PASSING_THRESHOLD}%)`;
      failCount++;
    }

    // 4. Create append-only Evaluation document (never overwriting previous runs)
    const evaluationDoc = await Evaluation.create({
      cohort: cohort._id,
      student: studentId,
      enrollment: enrollment._id,
      program: cohort.program?._id || cohort.program,
      division: cohort.division,
      attendanceRate,
      averageScore,
      attendanceThresholdMet,
      outcome,
      outcomeReason,
      evaluatedBy: user._id,
      evaluatedAt: new Date(),
    });

    const populated = await Evaluation.findById(evaluationDoc._id)
      .populate('student', 'fullName email phone studentProfile')
      .populate('evaluatedBy', 'fullName email role');

    createdEvaluations.push(populated);

    // Phase 14: Notify student of their evaluation results (failure-safe, non-blocking)
    try {
      const studentName = populated.student?.fullName || 'Student';
      const studentEmail = populated.student?.email;
      const outcomeBadgeColor = outcome === EVALUATION_OUTCOME.PASS ? '#4ade80' : outcome === EVALUATION_OUTCOME.FAIL ? '#f87171' : '#fbbf24';

      await notifyUser({
        recipientId: studentId,
        type: NOTIFICATION_TYPE.EVALUATION_PUBLISHED,
        title: `Evaluation Results Published - ${cohort.cohortNumber}`,
        message: `Your final evaluation for ${cohort.cohortNumber} is: ${outcome}. Attendance Rate: ${attendanceRate}%, Average Score: ${averageScore}%. ${outcomeReason ? 'Details: ' + outcomeReason : ''}`,
        relatedResource: {
          resourceType: 'Evaluation',
          resourceId: evaluationDoc._id,
        },
        division: cohort.division,
        email: {
          to: studentEmail,
          studentName,
          subject: `Evaluation Outcome: ${outcome} - ${cohort.cohortNumber}`,
          text: `Dear ${studentName},\n\nYour final evaluation for cohort ${cohort.cohortNumber} has been computed.\n\nOutcome: ${outcome}\nAttendance Rate: ${attendanceRate}%\nAverage Score: ${averageScore}%\n\n${outcomeReason}\n\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: `Evaluation Outcome: ${outcome}`,
            contentHtml: `
              <p>Dear <strong>${studentName}</strong>,</p>
              <p>Your academic evaluation for cohort <strong>${cohort.cohortNumber}</strong> has been computed and published:</p>
              <div class="card" style="border-left-color: ${outcomeBadgeColor};">
                <p style="margin: 0; font-size: 16px;"><strong>Outcome:</strong> <span style="color: ${outcomeBadgeColor}; font-weight: bold;">${outcome}</span></p>
                <p style="margin: 6px 0;"><strong>Attendance Rate:</strong> ${attendanceRate}%</p>
                <p style="margin: 6px 0;"><strong>Average Score:</strong> ${averageScore}%</p>
                ${outcomeReason ? `<p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px;">${outcomeReason}</p>` : ''}
              </div>
              <p>You can view your complete academic record in your student portal.</p>
            `,
            actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/student/cohorts`,
            actionText: 'View My Classes & Outcomes',
          }),
        },
      });
    } catch (evalNotifErr) {
      console.error('[EvaluationPublished:NotifyError]', evalNotifErr.message);
    }
  }


  // Write Batch Summary Audit Log
  await recordAudit({
    user: user._id,
    action: 'EVALUATION_COMPUTED',
    resource: 'Cohort',
    resourceId: cohort._id,
    division: cohort.division,
    after: {
      cohortId: cohort._id,
      cohortNumber: cohort.cohortNumber,
      totalEvaluated: createdEvaluations.length,
      passCount,
      failCount,
      incompleteCount,
      attendanceThreshold: ATTENDANCE_PASSING_THRESHOLD,
      passingScoreThreshold: SCORE_PASSING_THRESHOLD,
      evaluations: createdEvaluations.map((e) => ({
        evaluationId: e._id,
        studentId: e.student?._id || e.student,
        studentName: e.student?.fullName,
        attendanceRate: e.attendanceRate,
        averageScore: e.averageScore,
        outcome: e.outcome,
      })),
    },
    reason: `Evaluations computed for cohort ${cohort.cohortNumber}: ${createdEvaluations.length} students evaluated (${passCount} PASS, ${failCount} FAIL, ${incompleteCount} INCOMPLETE)`,
  });

  return {
    cohortId: cohort._id,
    cohortNumber: cohort.cohortNumber,
    evaluations: createdEvaluations,
    summary: {
      total: createdEvaluations.length,
      passCount,
      failCount,
      incompleteCount,
      attendanceThreshold: ATTENDANCE_PASSING_THRESHOLD,
      scoreThreshold: SCORE_PASSING_THRESHOLD,
    },
  };
}

/**
 * Retrieve evaluations for a cohort (scoped by division / instructor).
 * Returns latest evaluation per confirmed student, along with full append-only history.
 *
 * @param {Object} params
 * @param {string} params.cohortId
 * @param {Object} params.user
 * @param {string} [params.studentId]
 * @returns {Promise<Object>}
 */
async function getCohortEvaluations({ cohortId, user, studentId = null }) {
  const cohort = await Cohort.findById(cohortId)
    .populate('program', 'title division level price deliveryMode')
    .populate('instructor', 'fullName email');

  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  assertEvaluationViewAccess(cohort, user);

  const query = { cohort: cohort._id };
  if (studentId) {
    query.student = studentId;
  }

  // All historical evaluation documents, newest first
  const allHistory = await Evaluation.find(query)
    .populate('student', 'fullName email phone')
    .populate('evaluatedBy', 'fullName email role')
    .sort({ evaluatedAt: -1, createdAt: -1 });

  // Fetch existing certificates for this cohort to link with evaluations
  const certificates = await Certificate.find({ cohort: cohort._id });
  const certMap = new Map();
  for (const cert of certificates) {
    certMap.set(String(cert.evaluation), {
      _id: cert._id,
      serialNumber: cert.serialNumber,
      status: cert.status,
      issuedAt: cert.issuedAt,
      verificationToken: cert.verificationToken,
    });
  }

  // Compute latest evaluation per student
  const latestMap = new Map();
  for (const doc of allHistory) {
    const item = doc.toObject ? doc.toObject() : { ...doc };
    item.certificate = certMap.get(String(item._id)) || null;

    const sId = String(item.student?._id || item.student);
    if (!latestMap.has(sId)) {
      latestMap.set(sId, item);
    }
  }

  const latestEvaluations = Array.from(latestMap.values());

  return {
    cohort: {
      _id: cohort._id,
      cohortNumber: cohort.cohortNumber,
      name: cohort.name,
      division: cohort.division,
      status: cohort.status,
      program: cohort.program,
      instructor: cohort.instructor,
    },
    evaluations: latestEvaluations,
    history: allHistory,
    totalStudentsEvaluated: latestEvaluations.length,
    totalRecords: allHistory.length,
  };
}

/**
 * Retrieve student's own evaluation history (read-only).
 *
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
async function getStudentEvaluations(studentId) {
  const evaluations = await Evaluation.find({ student: studentId })
    .populate({
      path: 'cohort',
      select: 'cohortNumber name startDate endDate status division program instructor sessions',
      populate: [
        { path: 'program', select: 'title division level deliveryMode price' },
        { path: 'instructor', select: 'fullName email' },
      ],
    })
    .populate('evaluatedBy', 'fullName role')
    .sort({ evaluatedAt: -1, createdAt: -1 });

  return evaluations;
}

module.exports = {
  assertEvaluationAdminAccess,
  assertEvaluationViewAccess,
  evaluateCohort,
  getCohortEvaluations,
  getStudentEvaluations,
};
