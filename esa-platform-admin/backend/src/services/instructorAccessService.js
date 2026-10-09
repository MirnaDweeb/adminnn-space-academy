const Cohort = require('../models/Cohort');
const User = require('../models/User');
const InstructorProfile = require('../models/InstructorProfile');
const { recordAudit } = require('./auditService');
const { ROLES } = require('../constants/roles');
const { COHORT_STATUS } = require('../constants/statuses');

/**
 * Evaluates whether an instructor has active course/cohort access based on
 * assigned cohorts or explicit course access window.
 *
 * Rules:
 * - If assigned to cohorts:
 *   - If at least one assigned cohort is active / upcoming (endDate >= now and not cancelled/completed), access is ACTIVE.
 *   - If all assigned cohorts have concluded (latest endDate < now), access is EXPIRED.
 * - If no cohorts, checks profile.accessExpiresAt.
 * - If new instructor with no cohorts or window, remains active pending assignment.
 */
async function evaluateInstructorAccess(instructorUserId) {
  const user = await User.findById(instructorUserId);
  if (!user || user.role !== ROLES.INSTRUCTOR) {
    return { hasActiveAccess: false, reason: 'User is not an instructor' };
  }

  const cohorts = await Cohort.find({
    instructor: instructorUserId,
    status: { $ne: COHORT_STATUS.CANCELLED },
  }).sort({ endDate: -1 });

  const profile = await InstructorProfile.findOne({ user: instructorUserId });
  const now = new Date();

  if (cohorts.length > 0) {
    const latestEndDate = cohorts[0].endDate;
    const hasActiveCohort = cohorts.some(
      (c) => new Date(c.endDate) >= now && c.status !== COHORT_STATUS.COMPLETED
    );

    if (hasActiveCohort) {
      return {
        hasActiveAccess: true,
        latestEndDate,
        cohortsCount: cohorts.length,
        status: 'ACTIVE',
      };
    } else {
      return {
        hasActiveAccess: false,
        latestEndDate,
        cohortsCount: cohorts.length,
        status: 'EXPIRED',
        reason: `All assigned cohorts have concluded (latest ended on ${latestEndDate.toISOString().split('T')[0]})`,
      };
    }
  }

  // Fallback to explicit course access window on profile
  if (profile && profile.accessExpiresAt) {
    const expires = new Date(profile.accessExpiresAt);
    if (expires >= now) {
      return { hasActiveAccess: true, latestEndDate: expires, status: 'ACTIVE' };
    } else {
      return {
        hasActiveAccess: false,
        latestEndDate: expires,
        status: 'EXPIRED',
        reason: `Course access window expired on ${expires.toISOString().split('T')[0]}`,
      };
    }
  }

  return {
    hasActiveAccess: true,
    latestEndDate: null,
    status: 'ACTIVE',
    reason: 'Instructor active awaiting cohort scheduling',
  };
}

/**
 * Synchronizes instructor account status.
 * Automatically marks account inactive if course access period has ended.
 */
async function syncInstructorAccess(instructorUserId, actor = null) {
  const evalResult = await evaluateInstructorAccess(instructorUserId);
  const user = await User.findById(instructorUserId);
  if (!user || user.role !== ROLES.INSTRUCTOR) return evalResult;

  if (!evalResult.hasActiveAccess && user.isActive) {
    user.isActive = false;
    await user.save();

    await recordAudit({
      user: actor || user,
      action: 'INSTRUCTOR_DEACTIVATED',
      resource: 'User',
      resourceId: user._id,
      division: user.division,
      before: { isActive: true },
      after: { isActive: false, status: 'EXPIRED', reason: evalResult.reason },
      reason: `Automated course-limited access expiration: ${evalResult.reason}`,
    });
  }

  return {
    ...evalResult,
    isActive: user.isActive,
    user: user.toSafeObject(),
  };
}

/**
 * Sweeps all instructors and expires inactive course accounts.
 */
async function syncAllInstructorsAccess(actor) {
  const instructors = await User.find({ role: ROLES.INSTRUCTOR });
  const results = [];

  for (const instructor of instructors) {
    const res = await syncInstructorAccess(instructor._id, actor);
    results.push({
      id: instructor._id,
      email: instructor.email,
      fullName: instructor.fullName,
      ...res,
    });
  }

  return results;
}

module.exports = {
  evaluateInstructorAccess,
  syncInstructorAccess,
  syncAllInstructorsAccess,
};
