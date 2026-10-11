const StudentProfile = require('../models/StudentProfile');
const Course = require('../models/Course');
const Application = require('../models/Application');
const Cohort = require('../models/Cohort');
const Certificate = require('../models/Certificate');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const {
  PROGRAM_STATUS,
  APPLICATION_STATUS,
  COHORT_STATUS,
  CERTIFICATE_STATUS,
} = require('../constants/statuses');

/**
 * Human-readable action label formatter for audit logs
 */
function formatAuditAction(action) {
  const map = {
    APPLICATION_SUBMIT: 'New application submitted',
    APPLICATION_DECISION_MADE: 'Admission decision updated',
    APPLICATION_NOTE_ADDED: 'Reviewer note added to application',
    READINESS_EVALUATED: 'Admission readiness evaluated',
    PROGRAM_CREATED: 'New program created',
    PROGRAM_CREATE: 'New program created',
    PROGRAM_UPDATED: 'Program details updated',
    PROGRAM_UPDATE: 'Program details updated',
    PROGRAM_STATUS_CHANGED: 'Program status changed',
    PROGRAM_ARCHIVED: 'Program archived',
    PROGRAM_DELETED: 'Program removed',
    COHORT_CREATED: 'Training cohort created',
    COHORT_SCHEDULE_CHANGED: 'Cohort schedule modified',
    SESSION_STARTED: 'Academic session started',
    SESSION_COMPLETED: 'Academic session completed',
    ATTENDANCE_RECORDED: 'Session attendance recorded',
    ASSIGNMENT_CREATED: 'New assignment created',
    ASSESSMENT_CREATED: 'Assessment test configured',
    ASSESSMENT_RECORDED: 'Assessment score graded',
    CERTIFICATE_ISSUED: 'Graduation certificate issued',
    CERTIFICATE_REVOKED: 'Certificate revoked',
    CERTIFICATE_RESTORED: 'Certificate restored',
    CERTIFICATE_UPDATED: 'Certificate metadata updated',
    STUDENT_CREATED: 'Student account registered',
    STUDENT_UPDATED: 'Student profile updated',
    STUDENT_ACTIVATED: 'Student account activated',
    STUDENT_DEACTIVATED: 'Student account deactivated',
    STUDENT_MESSAGED: 'Direct message sent to student',
    INSTRUCTOR_CREATED: 'Faculty instructor provisioned',
    INSTRUCTOR_UPDATED: 'Instructor profile updated',
    INSTRUCTOR_ACTIVATED: 'Instructor activated',
    INSTRUCTOR_DEACTIVATED: 'Instructor deactivated',
    FEEDBACK_REMINDER_SENT: 'Feedback reminder sent',
    NOTIFICATION_EMAIL_RETRIED: 'Email delivery retried',
    INVOICE_CREATED: 'Tuition invoice generated',
    INVOICE_UPDATED: 'Invoice details modified',
    INVOICE_EXPIRED: 'Expired invoice processed',
    PAYMENT_RECORDED: 'Tuition payment recorded',
    PAYMENT_INITIATED: 'Payment transaction initiated',
    PAYMENT_ADJUSTED: 'Payment adjustment processed',
    ADMIN_CREATED: 'Administrator provisioned',
    ADMIN_ACTIVATED: 'Administrator activated',
    ADMIN_DEACTIVATED: 'Administrator deactivated',
    ADMIN_PERMISSIONS_CHANGED: 'Administrator permissions updated',
    REPORT_EXPORTED: 'Operational report exported',
  };

  return map[action] || action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Resolves a safe navigation destination for an audit log entity within the division
 */
function resolveEntityLink(resource, resourceId, division) {
  const divPath = `/admin/${division}`;
  switch (resource) {
    case 'Course':
    case 'Program':
      return `${divPath}/programs`;
    case 'Cohort':
      return `${divPath}/cohorts`;
    case 'Application':
      return `${divPath}/applications`;
    case 'Student':
    case 'StudentProfile':
      return resourceId ? `${divPath}/students/${resourceId}` : `${divPath}/students`;
    case 'Instructor':
    case 'InstructorProfile':
      return `${divPath}/instructors`;
    case 'Certificate':
      return `${divPath}/certificates`;
    case 'Invoice':
    case 'Payment':
      return `${divPath}/invoices`;
    case 'Feedback':
      return `${divPath}/feedback`;
    case 'Notification':
      return `${divPath}/notifications`;
    default:
      return `${divPath}/audit-logs`;
  }
}

/**
 * Lightweight real database counts for gateway cards
 */
async function getDivisionStats(division) {
  const [studentCount, activePrograms, pendingApplications, activeCohorts] = await Promise.all([
    StudentProfile.countDocuments({ division }),
    Course.countDocuments({ division, status: PROGRAM_STATUS.ACTIVE }),
    Application.countDocuments({
      division,
      status: {
        $in: [
          APPLICATION_STATUS.SUBMITTED,
          APPLICATION_STATUS.MANUAL_REVIEW,
          APPLICATION_STATUS.NEEDS_INFORMATION,
        ],
      },
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

/**
 * Comprehensive, database-derived operational overview for a division dashboard.
 * Scoped strictly to the authenticated division. Returns honest zero/empty states.
 */
async function getDivisionDashboard(division) {
  const [
    studentCount,
    activePrograms,
    pendingApplications,
    activeCohorts,
    issuedCertificatesCount,
    cohorts,
    recentLogs,
    appAgg,
    recentAppsRaw,
  ] = await Promise.all([
    StudentProfile.countDocuments({ division }),
    Course.countDocuments({ division, status: PROGRAM_STATUS.ACTIVE }),
    Application.countDocuments({
      division,
      status: {
        $in: [
          APPLICATION_STATUS.SUBMITTED,
          APPLICATION_STATUS.MANUAL_REVIEW,
          APPLICATION_STATUS.NEEDS_INFORMATION,
        ],
      },
    }),
    Cohort.countDocuments({
      division,
      status: { $in: [COHORT_STATUS.SCHEDULED, COHORT_STATUS.IN_PROGRESS] },
    }),
    Certificate.countDocuments({
      division,
      status: CERTIFICATE_STATUS.ISSUED,
    }),
    Cohort.find({ division })
      .populate('program', 'title code level deliveryMode')
      .populate('instructor', 'fullName email')
      .lean(),
    AuditLog.find({ division })
      .sort({ timestamp: -1 })
      .limit(6)
      .populate('user', 'fullName email role division')
      .lean(),
    Application.aggregate([
      { $match: { division } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Application.find({ division })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('program', 'title code')
      .populate('student', 'fullName email')
      .lean(),
  ]);

  // Extract upcoming and completed sessions across all cohorts in division
  let upcomingSessionsCount = 0;
  let completedSessionsCount = 0;
  const allUpcoming = [];

  for (const c of cohorts) {
    if (!c.sessions || c.sessions.length === 0) continue;
    for (const s of c.sessions) {
      const status = s.status || 'SCHEDULED';
      if (status === 'SCHEDULED' || status === 'IN_PROGRESS') {
        upcomingSessionsCount++;
        allUpcoming.push({
          sessionId: s._id,
          cohortId: c._id,
          cohortNumber: c.cohortNumber,
          cohortName: c.name,
          programTitle: c.program?.title || 'Academic Program',
          programCode: c.program?.code || '',
          instructorName: c.instructor?.fullName || 'Assigned Faculty',
          instructorEmail: c.instructor?.email || '',
          sessionNumber: s.sessionNumber,
          topic: s.topic || `Session ${s.sessionNumber}`,
          date: s.date,
          startTime: s.startTime || '10:00',
          endTime: s.endTime || '12:00',
          durationMinutes: s.durationMinutes || 120,
          deliveryMode: s.deliveryMode || c.program?.deliveryMode || 'OFFLINE',
          location: s.location || 'Training Lab / Online',
          status,
          meetingUrl: s.meetingUrl || '',
        });
      } else if (status === 'COMPLETED') {
        completedSessionsCount++;
      }
    }
  }

  // Sort upcoming sessions chronologically: active running first, then earliest date
  allUpcoming.sort((a, b) => {
    if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
    return new Date(a.date) - new Date(b.date);
  });

  const upcomingSessions = allUpcoming.slice(0, 5);

  // Format real recent administrative activities
  const recentActivity = recentLogs.map((log) => ({
    _id: log._id,
    action: log.action,
    actionLabel: formatAuditAction(log.action),
    resource: log.resource,
    resourceId: log.resourceId,
    link: resolveEntityLink(log.resource, log.resourceId, division),
    actor: {
      fullName: log.user?.fullName || 'System Administrator',
      email: log.user?.email || '',
      role: log.user?.role || 'ADMIN',
    },
    timestamp: log.timestamp,
    reason: log.reason || '',
  }));

  // Application status distribution
  const applicationBreakdown = {};
  let totalApplicationsCount = 0;
  for (const item of appAgg) {
    applicationBreakdown[item._id] = item.count;
    totalApplicationsCount += item.count;
  }

  // Recent applications list
  const recentApplications = recentAppsRaw.map((app) => ({
    _id: app._id,
    applicationNumber: app.applicationNumber,
    studentName: app.student?.fullName || app.studentName || 'Applicant',
    studentEmail: app.student?.email || '',
    programTitle: app.program?.title || 'Training Program',
    status: app.status,
    createdAt: app.createdAt || app.submittedAt,
  }));

  return {
    division,
    studentCount,
    activePrograms,
    pendingApplications,
    activeCohorts,
    upcomingSessionsCount,
    completedSessionsCount,
    issuedCertificatesCount,
    totalApplicationsCount,
    upcomingSessions,
    recentActivity,
    applicationBreakdown,
    recentApplications,
  };
}

module.exports = {
  getDivisionStats,
  getDivisionDashboard,
};
