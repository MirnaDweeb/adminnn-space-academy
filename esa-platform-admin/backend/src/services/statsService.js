const StudentProfile = require('../models/StudentProfile');
const Course = require('../models/Course');
const Application = require('../models/Application');
const Cohort = require('../models/Cohort');
const { PROGRAM_STATUS, APPLICATION_STATUS, COHORT_STATUS } = require('../constants/statuses');

// Real, database-derived counts for a single division. Returns zeros when
// the database is empty — never fabricated numbers.
async function getDivisionStats(division) {
  const [studentCount, activePrograms, pendingApplications, activeCohorts] = await Promise.all([
    StudentProfile.countDocuments({ division }),
    Course.countDocuments({ division, status: PROGRAM_STATUS.ACTIVE }),
    Application.countDocuments({
      division,
      status: { $in: [APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.MANUAL_REVIEW, APPLICATION_STATUS.NEEDS_INFORMATION] },
    }),
    Cohort.countDocuments({
      division,
      status: { $in: [COHORT_STATUS.SCHEDULED, COHORT_STATUS.IN_PROGRESS] },
    }),
  ]);

  return {
    studentCount,
    activePrograms,
    pendingApplications,
    activeCohorts,
  };
}

module.exports = { getDivisionStats };
