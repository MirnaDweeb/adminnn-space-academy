const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Application = require('../models/Application');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const Evaluation = require('../models/Evaluation');
const Certificate = require('../models/Certificate');
const Notification = require('../models/Notification');
const Cohort = require('../models/Cohort');
const AuditLog = require('../models/AuditLog');
const { ROLES } = require('../constants/roles');
const {
  APPLICATION_STATUS,
  PROGRAM_STATUS,
  ENROLLMENT_STATUS,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  CERTIFICATE_STATUS,
} = require('../constants/statuses');
const { recordAudit } = require('./auditService');
const ApiError = require('../utils/ApiError');

/**
 * Builds standard date range matching criteria.
 */
function buildDateCriteria(dateFrom, dateTo, fieldName = 'createdAt') {
  if (!dateFrom && !dateTo) return {};
  const criteria = {};
  if (dateFrom) {
    const dFrom = new Date(dateFrom);
    if (!isNaN(dFrom.getTime())) {
      criteria.$gte = dFrom;
    }
  }
  if (dateTo) {
    const dToStr = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
    const dTo = new Date(dToStr);
    if (!isNaN(dTo.getTime())) {
      criteria.$lte = dTo;
    }
  }
  return Object.keys(criteria).length > 0 ? { [fieldName]: criteria } : {};
}

/**
 * Normalizes division scope into MongoDB query conditions.
 */
function getDivisionCondition(division) {
  if (!division || division === 'all') return {};
  return { division };
}

// ============================================================================
// A. OVERVIEW REPORT
// ============================================================================
async function getOverviewReport({ division = 'all', dateFrom, dateTo }) {
  const divMatch = getDivisionCondition(division);
  const dateMatch = buildDateCriteria(dateFrom, dateTo, 'createdAt');

  // Student query: users with role STUDENT
  const studentUserMatch = { role: ROLES.STUDENT };
  if (division && division !== 'all') {
    studentUserMatch.division = division;
  }
  const studentDateMatch = buildDateCriteria(dateFrom, dateTo, 'createdAt');
  const studentCombinedMatch = { ...studentUserMatch, ...studentDateMatch };

  // 1. Overview counts
  const [
    totalStudents,
    activeStudents,
    totalPrograms,
    activePrograms,
    totalApplications,
    acceptedApps,
    rejectedApps,
    waitlistedApps,
    totalEnrollments,
    confirmedEnrollments,
    pendingPayments,
    totalRevenueAgg,
    certificatesIssued,
  ] = await Promise.all([
    User.countDocuments(studentCombinedMatch),
    User.countDocuments({ ...studentCombinedMatch, isActive: true }),
    Course.countDocuments({ ...divMatch }),
    Course.countDocuments({ ...divMatch, status: PROGRAM_STATUS.ACTIVE }),
    Application.countDocuments({ ...divMatch, ...dateMatch }),
    Application.countDocuments({
      ...divMatch,
      ...dateMatch,
      $or: [
        { decision: 'ACCEPT' },
        { status: { $in: [APPLICATION_STATUS.CONFIRMED, APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING, APPLICATION_STATUS.IN_PROGRESS, APPLICATION_STATUS.COMPLETED] } },
      ],
    }),
    Application.countDocuments({
      ...divMatch,
      ...dateMatch,
      decision: 'REJECT',
    }),
    Application.countDocuments({
      ...divMatch,
      ...dateMatch,
      $or: [{ status: APPLICATION_STATUS.WAITLISTED }, { decision: 'WAITLIST' }],
    }),
    Enrollment.countDocuments({ ...divMatch, ...dateMatch }),
    Enrollment.countDocuments({ ...divMatch, ...dateMatch, status: ENROLLMENT_STATUS.CONFIRMED }),
    Enrollment.countDocuments({ ...divMatch, ...dateMatch, status: ENROLLMENT_STATUS.PENDING_PAYMENT }),
    Invoice.aggregate([
      {
        $match: {
          ...divMatch,
          status: INVOICE_STATUS.PAID,
          ...(dateFrom || dateTo ? buildDateCriteria(dateFrom, dateTo, 'paidAt') : {}),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Certificate.countDocuments({
      ...divMatch,
      status: CERTIFICATE_STATUS.ISSUED,
      ...(dateFrom || dateTo ? buildDateCriteria(dateFrom, dateTo, 'issuedAt') : {}),
    }),
  ]);

  const totalRevenue = totalRevenueAgg[0]?.total || 0;

  // 2. Trends: Monthly breakdown of applications, enrollments, and revenue
  const [appTrends, enrTrends, revTrends] = await Promise.all([
    Application.aggregate([
      { $match: { ...divMatch, ...dateMatch } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Enrollment.aggregate([
      { $match: { ...divMatch, ...dateMatch } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      {
        $match: {
          ...divMatch,
          status: INVOICE_STATUS.PAID,
          ...(dateFrom || dateTo ? buildDateCriteria(dateFrom, dateTo, 'paidAt') : {}),
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: { $ifNull: ['$paidAt', '$createdAt'] },
            },
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Combine monthly trends into unified periods
  const trendPeriods = Array.from(
    new Set([...appTrends.map((t) => t._id), ...enrTrends.map((t) => t._id), ...revTrends.map((t) => t._id)])
  ).sort();

  const trends = trendPeriods.map((period) => ({
    period,
    applications: appTrends.find((t) => t._id === period)?.count || 0,
    enrollments: enrTrends.find((t) => t._id === period)?.count || 0,
    revenue: revTrends.find((t) => t._id === period)?.total || 0,
  }));

  // 3. Division breakdown (useful when division === 'all')
  let divisionBreakdown = [];
  if (division === 'all') {
    const [divApps, divEnrs, divRev, divCerts, divProgs] = await Promise.all([
      Application.aggregate([
        { $match: { ...dateMatch } },
        { $group: { _id: '$division', count: { $sum: 1 } } },
      ]),
      Enrollment.aggregate([
        { $match: { ...dateMatch } },
        {
          $group: {
            _id: '$division',
            total: { $sum: 1 },
            confirmed: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.CONFIRMED] }, 1, 0] } },
          },
        },
      ]),
      Invoice.aggregate([
        {
          $match: {
            status: INVOICE_STATUS.PAID,
            ...(dateFrom || dateTo ? buildDateCriteria(dateFrom, dateTo, 'paidAt') : {}),
          },
        },
        { $group: { _id: '$division', revenue: { $sum: '$amount' } } },
      ]),
      Certificate.aggregate([
        {
          $match: {
            status: CERTIFICATE_STATUS.ISSUED,
            ...(dateFrom || dateTo ? buildDateCriteria(dateFrom, dateTo, 'issuedAt') : {}),
          },
        },
        { $group: { _id: '$division', count: { $sum: 1 } } },
      ]),
      Course.aggregate([
        { $group: { _id: '$division', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', PROGRAM_STATUS.ACTIVE] }, 1, 0] } } } },
      ]),
    ]);

    const divisions = ['PRE_UNIVERSITY', 'UNIVERSITY'];
    divisionBreakdown = divisions.map((d) => ({
      division: d,
      applications: divApps.find((x) => x._id === d)?.count || 0,
      enrollments: divEnrs.find((x) => x._id === d)?.total || 0,
      confirmedEnrollments: divEnrs.find((x) => x._id === d)?.confirmed || 0,
      revenue: divRev.find((x) => x._id === d)?.revenue || 0,
      certificates: divCerts.find((x) => x._id === d)?.count || 0,
      programs: divProgs.find((x) => x._id === d)?.total || 0,
      activePrograms: divProgs.find((x) => x._id === d)?.active || 0,
    }));
  }

  return {
    summary: {
      totalStudents,
      activeStudents,
      totalPrograms,
      activePrograms,
      totalApplications,
      acceptedApplications: acceptedApps,
      rejectedApplications: rejectedApps,
      waitlistedApplications: waitlistedApps,
      totalEnrollments,
      confirmedEnrollments,
      pendingPayments,
      totalRevenue,
      certificatesIssued,
    },
    trends,
    divisionBreakdown,
    appliedFilters: { division, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// B. APPLICATIONS & ADMISSIONS REPORT
// ============================================================================
async function getApplicationsReport({ division = 'all', program, status, decision, dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'createdAt') };

  if (program && program !== 'all') {
    if (mongoose.Types.ObjectId.isValid(program)) {
      match.program = new mongoose.Types.ObjectId(program);
    }
  }
  if (status && status !== 'all') {
    match.status = status;
  }
  if (decision && decision !== 'all') {
    match.decision = decision;
  }

  // 1. By status distribution
  const byStatusAgg = await Application.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // 2. By decision distribution
  const byDecisionAgg = await Application.aggregate([
    { $match: match },
    { $group: { _id: { $ifNull: ['$decision', 'PENDING'] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // 3. Overall summary calculations
  const total = byStatusAgg.reduce((acc, curr) => acc + curr.count, 0);

  const accepted = await Application.countDocuments({
    ...match,
    $or: [
      { decision: 'ACCEPT' },
      { status: { $in: [APPLICATION_STATUS.CONFIRMED, APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING, APPLICATION_STATUS.IN_PROGRESS, APPLICATION_STATUS.COMPLETED] } },
    ],
  });

  const rejected = await Application.countDocuments({
    ...match,
    decision: 'REJECT',
  });

  const waitlisted = await Application.countDocuments({
    ...match,
    $or: [{ status: APPLICATION_STATUS.WAITLISTED }, { decision: 'WAITLIST' }],
  });

  const underReview = await Application.countDocuments({
    ...match,
    status: { $in: [APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.MANUAL_REVIEW, APPLICATION_STATUS.NEEDS_INFORMATION] },
  });

  const acceptanceRate = total > 0 ? Math.round((accepted / total) * 1000) / 10 : 0;
  const rejectionRate = total > 0 ? Math.round((rejected / total) * 1000) / 10 : 0;

  // 4. Decision Turnaround in hours where timestamps exist
  const turnaroundAgg = await Application.aggregate([
    {
      $match: {
        ...match,
        submittedAt: { $ne: null },
        $or: [{ reviewedAt: { $ne: null } }, { 'adminDecision.decidedAt': { $ne: null } }],
      },
    },
    {
      $project: {
        durationMs: {
          $subtract: [{ $ifNull: ['$adminDecision.decidedAt', '$reviewedAt'] }, '$submittedAt'],
        },
      },
    },
    { $match: { durationMs: { $gte: 0 } } },
    {
      $group: {
        _id: null,
        avgDurationMs: { $avg: '$durationMs' },
        minDurationMs: { $min: '$durationMs' },
        maxDurationMs: { $max: '$durationMs' },
        count: { $sum: 1 },
      },
    },
  ]);

  const avgDecisionTurnaroundHours = turnaroundAgg[0]?.avgDurationMs
    ? Math.round((turnaroundAgg[0].avgDurationMs / (1000 * 60 * 60)) * 10) / 10
    : null;

  // 5. Applications over time
  const timelineAgg = await Application.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // 6. Applications by program
  const byProgramAgg = await Application.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$program',
        total: { $sum: 1 },
        accepted: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$decision', 'ACCEPT'] },
                  { $in: ['$status', [APPLICATION_STATUS.CONFIRMED, APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING]] },
                ],
              },
              1,
              0,
            ],
          },
        },
        rejected: { $sum: { $cond: [{ $eq: ['$decision', 'REJECT'] }, 1, 0] } },
        waitlisted: {
          $sum: {
            $cond: [
              { $or: [{ $eq: ['$status', APPLICATION_STATUS.WAITLISTED] }, { $eq: ['$decision', 'WAITLIST'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'programInfo',
      },
    },
    { $unwind: { path: '$programInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        programId: '$_id',
        title: { $ifNull: ['$programInfo.title', 'Unknown Program'] },
        division: { $ifNull: ['$programInfo.division', 'PRE_UNIVERSITY'] },
        level: { $ifNull: ['$programInfo.level', 'N/A'] },
        total: 1,
        accepted: 1,
        rejected: 1,
        waitlisted: 1,
        acceptanceRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$accepted', '$total'] }, 100] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 7. Applications by division
  const byDivisionAgg = await Application.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$division',
        total: { $sum: 1 },
        accepted: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$decision', 'ACCEPT'] },
                  { $in: ['$status', [APPLICATION_STATUS.CONFIRMED, APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING]] },
                ],
              },
              1,
              0,
            ],
          },
        },
        rejected: { $sum: { $cond: [{ $eq: ['$decision', 'REJECT'] }, 1, 0] } },
        waitlisted: {
          $sum: {
            $cond: [
              { $or: [{ $eq: ['$status', APPLICATION_STATUS.WAITLISTED] }, { $eq: ['$decision', 'WAITLIST'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        division: '$_id',
        total: 1,
        accepted: 1,
        rejected: 1,
        waitlisted: 1,
        acceptanceRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$accepted', '$total'] }, 100] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return {
    summary: {
      total,
      accepted,
      rejected,
      waitlisted,
      underReview,
      acceptanceRate,
      rejectionRate,
      avgDecisionTurnaroundHours,
      decisionsWithTimestampsCount: turnaroundAgg[0]?.count || 0,
    },
    byStatus: byStatusAgg.map((s) => ({ status: s._id, count: s.count, percentage: total > 0 ? Math.round((s.count / total) * 1000) / 10 : 0 })),
    byDecision: byDecisionAgg.map((d) => ({ decision: d._id, count: d.count, percentage: total > 0 ? Math.round((d.count / total) * 1000) / 10 : 0 })),
    timeline: timelineAgg.map((t) => ({ date: t._id, count: t.count })),
    byProgram: byProgramAgg.map((p) => ({
      ...p,
      acceptanceRate: Math.round(p.acceptanceRate * 10) / 10,
    })),
    byDivision: byDivisionAgg.map((d) => ({
      ...d,
      acceptanceRate: Math.round(d.acceptanceRate * 10) / 10,
    })),
    appliedFilters: { division, program: program || null, status: status || null, decision: decision || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// C. ENROLLMENT & CAPACITY REPORT
// ============================================================================
async function getEnrollmentCapacityReport({ division = 'all', program, cohort, status, dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'createdAt') };

  if (program && program !== 'all') {
    if (mongoose.Types.ObjectId.isValid(program)) {
      match.program = new mongoose.Types.ObjectId(program);
    }
  }
  if (cohort && cohort !== 'all') {
    if (mongoose.Types.ObjectId.isValid(cohort)) {
      match.cohort = new mongoose.Types.ObjectId(cohort);
    }
  }
  if (status && status !== 'all') {
    match.status = status;
  }

  // 1. Enrollment status distribution
  const byStatusAgg = await Enrollment.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const totalEnrollments = byStatusAgg.reduce((acc, curr) => acc + curr.count, 0);

  const confirmedCount = byStatusAgg.find((s) => s._id === ENROLLMENT_STATUS.CONFIRMED)?.count || 0;
  const pendingPaymentCount = byStatusAgg.find((s) => s._id === ENROLLMENT_STATUS.PENDING_PAYMENT)?.count || 0;
  const waitlistedCount = byStatusAgg.find((s) => s._id === ENROLLMENT_STATUS.WAITLISTED)?.count || 0;
  const cancelledCount = byStatusAgg.find((s) => s._id === ENROLLMENT_STATUS.CANCELLED)?.count || 0;

  // Invariant Phase 9 Rule: Occupied Capacity = CONFIRMED + PENDING_PAYMENT
  const occupiedCapacity = confirmedCount + pendingPaymentCount;

  // 2. Waitlist promotions count from AuditLog
  const auditMatch = {
    action: 'ENROLLMENT_PROMOTED_FROM_WAITLIST',
    ...getDivisionCondition(division),
    ...buildDateCriteria(dateFrom, dateTo, 'timestamp'),
  };
  const waitlistPromotionsCount = await AuditLog.countDocuments(auditMatch);

  // 3. Program breakdown with capacity rules
  const programFilter = { ...getDivisionCondition(division) };
  if (program && program !== 'all' && mongoose.Types.ObjectId.isValid(program)) {
    programFilter._id = new mongoose.Types.ObjectId(program);
  }

  const programs = await Course.find(programFilter).select('title division capacity level occupiedSeats').lean();

  // Aggregate enrollments per program
  const enrollmentByProgramAgg = await Enrollment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$program',
        totalEnrollments: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.CONFIRMED] }, 1, 0] } },
        pendingPayment: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.PENDING_PAYMENT] }, 1, 0] } },
        waitlisted: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.WAITLISTED] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.CANCELLED] }, 1, 0] } },
      },
    },
  ]);

  const enrollmentMap = new Map();
  enrollmentByProgramAgg.forEach((e) => enrollmentMap.set(String(e._id), e));

  let totalSystemCapacity = 0;
  let totalSystemAvailableSeats = 0;

  const byProgram = programs.map((p) => {
    const enr = enrollmentMap.get(String(p._id)) || {
      totalEnrollments: 0,
      confirmed: 0,
      pendingPayment: 0,
      waitlisted: 0,
      cancelled: 0,
    };
    // Occupied = CONFIRMED + PENDING_PAYMENT
    const occupied = enr.confirmed + enr.pendingPayment;
    const capacity = p.capacity || 0;
    const available = Math.max(capacity - occupied, 0);
    const utilization = capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0;

    totalSystemCapacity += capacity;
    totalSystemAvailableSeats += available;

    return {
      programId: p._id,
      title: p.title,
      division: p.division,
      level: p.level,
      capacity,
      occupied,
      confirmed: enr.confirmed,
      pendingPayment: enr.pendingPayment,
      waitlisted: enr.waitlisted,
      cancelled: enr.cancelled,
      available,
      utilizationRate: utilization,
    };
  });

  // Sort programs by occupied descending
  byProgram.sort((a, b) => b.occupied - a.occupied);

  // 4. Cohort breakdown (if cohorts exist)
  const cohortFilter = { ...getDivisionCondition(division) };
  if (cohort && cohort !== 'all' && mongoose.Types.ObjectId.isValid(cohort)) {
    cohortFilter._id = new mongoose.Types.ObjectId(cohort);
  }
  if (program && program !== 'all' && mongoose.Types.ObjectId.isValid(program)) {
    cohortFilter.program = new mongoose.Types.ObjectId(program);
  }

  const cohorts = await Cohort.find(cohortFilter)
    .populate('program', 'title')
    .select('cohortNumber name program division capacity status startDate endDate')
    .lean();

  const cohortEnrollmentAgg = await Enrollment.aggregate([
    { $match: { ...match, cohort: { $ne: null } } },
    {
      $group: {
        _id: '$cohort',
        total: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.CONFIRMED] }, 1, 0] } },
      },
    },
  ]);

  const cohortEnrMap = new Map();
  cohortEnrollmentAgg.forEach((c) => cohortEnrMap.set(String(c._id), c));

  const byCohort = cohorts.map((c) => {
    const enr = cohortEnrMap.get(String(c._id)) || { total: 0, confirmed: 0 };
    const capacity = c.capacity || 0;
    const utilization = capacity > 0 ? Math.round((enr.confirmed / capacity) * 1000) / 10 : 0;
    return {
      cohortId: c._id,
      cohortNumber: c.cohortNumber,
      name: c.name,
      programTitle: c.program?.title || 'Unknown',
      division: c.division,
      capacity,
      enrolledCount: enr.total,
      confirmedCount: enr.confirmed,
      availableSeats: Math.max(capacity - enr.confirmed, 0),
      utilizationRate: utilization,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
    };
  });

  // 5. Enrollment trends over time
  const timelineAgg = await Enrollment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.CONFIRMED] }, 1, 0] } },
        pendingPayment: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.PENDING_PAYMENT] }, 1, 0] } },
        waitlisted: { $sum: { $cond: [{ $eq: ['$status', ENROLLMENT_STATUS.WAITLISTED] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const overallUtilizationRate =
    totalSystemCapacity > 0 ? Math.round((occupiedCapacity / totalSystemCapacity) * 1000) / 10 : 0;

  return {
    summary: {
      totalEnrollments,
      confirmed: confirmedCount,
      pendingPayment: pendingPaymentCount,
      occupiedCapacity,
      waitlisted: waitlistedCount,
      cancelled: cancelledCount,
      waitlistPromotions: waitlistPromotionsCount,
      totalCapacity: totalSystemCapacity,
      availableSeats: totalSystemAvailableSeats,
      overallUtilizationRate,
    },
    byStatus: byStatusAgg.map((s) => ({
      status: s._id,
      count: s.count,
      percentage: totalEnrollments > 0 ? Math.round((s.count / totalEnrollments) * 1000) / 10 : 0,
    })),
    byProgram,
    byCohort,
    timeline: timelineAgg.map((t) => ({
      date: t._id,
      total: t.total,
      confirmed: t.confirmed,
      pendingPayment: t.pendingPayment,
      waitlisted: t.waitlisted,
    })),
    appliedFilters: { division, program: program || null, cohort: cohort || null, status: status || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// D. FINANCE REPORT
// ============================================================================
async function getFinanceReport({ division = 'all', program, dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'createdAt') };

  if (program && program !== 'all') {
    if (mongoose.Types.ObjectId.isValid(program)) {
      match.program = new mongoose.Types.ObjectId(program);
    }
  }

  // 1. Invoice summary statistics
  const invoiceStatsAgg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  const totalInvoiced = invoiceStatsAgg.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalInvoicesCount = invoiceStatsAgg.reduce((acc, curr) => acc + curr.count, 0);

  const paidItem = invoiceStatsAgg.find((i) => i._id === INVOICE_STATUS.PAID);
  const totalPaid = paidItem?.totalAmount || 0;
  const paidCount = paidItem?.count || 0;

  const pendingItem = invoiceStatsAgg.find((i) => i._id === INVOICE_STATUS.PENDING);
  const pendingAmount = pendingItem?.totalAmount || 0;
  const pendingCount = pendingItem?.count || 0;

  const expiredItem = invoiceStatsAgg.find((i) => i._id === INVOICE_STATUS.EXPIRED);
  const expiredAmount = expiredItem?.totalAmount || 0;
  const expiredCount = expiredItem?.count || 0;

  const cancelledItem = invoiceStatsAgg.find((i) => i._id === INVOICE_STATUS.CANCELLED);
  const cancelledAmount = cancelledItem?.totalAmount || 0;
  const cancelledCount = cancelledItem?.count || 0;

  const collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 1000) / 10 : 0;

  // 2. Payment transactions
  const txnDateMatch = buildDateCriteria(dateFrom, dateTo, 'recordedAt');
  const txnMatch = { ...txnDateMatch };

  // If division is specified or program is specified, filter transactions via linked invoices
  if (division !== 'all' || (program && program !== 'all')) {
    const linkedInvoiceIds = await Invoice.find(match).select('_id').lean();
    txnMatch.invoice = { $in: linkedInvoiceIds.map((i) => i._id) };
  }

  const [paymentMethodsAgg, totalTxnCount] = await Promise.all([
    PaymentTransaction.aggregate([
      { $match: txnMatch },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulCount: {
            $sum: { $cond: [{ $in: ['$status', [PAYMENT_STATUS.RECORDED, PAYMENT_STATUS.PAID]] }, 1, 0] },
          },
          successfulAmount: {
            $sum: {
              $cond: [{ $in: ['$status', [PAYMENT_STATUS.RECORDED, PAYMENT_STATUS.PAID]] }, '$amount', 0],
            },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    PaymentTransaction.countDocuments(txnMatch),
  ]);

  // 3. Revenue by program
  const revenueByProgramAgg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$program',
        invoicedAmount: { $sum: '$amount' },
        invoiceCount: { $sum: 1 },
        paidAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PAID] }, '$amount', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PAID] }, 1, 0] } },
        pendingAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PENDING] }, '$amount', 0] } },
        expiredAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.EXPIRED] }, '$amount', 0] } },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'programInfo',
      },
    },
    { $unwind: { path: '$programInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        programId: '$_id',
        title: { $ifNull: ['$programInfo.title', 'Unknown Program'] },
        division: { $ifNull: ['$programInfo.division', 'PRE_UNIVERSITY'] },
        price: { $ifNull: ['$programInfo.price', 0] },
        invoicedAmount: 1,
        invoiceCount: 1,
        paidAmount: 1,
        paidCount: 1,
        pendingAmount: 1,
        expiredAmount: 1,
      },
    },
    { $sort: { paidAmount: -1 } },
  ]);

  // 4. Revenue by division (if division === 'all')
  const revenueByDivisionAgg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$division',
        invoicedAmount: { $sum: '$amount' },
        invoiceCount: { $sum: 1 },
        paidAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PAID] }, '$amount', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PAID] }, 1, 0] } },
        pendingAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PENDING] }, '$amount', 0] } },
        expiredAmount: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.EXPIRED] }, '$amount', 0] } },
      },
    },
    { $sort: { paidAmount: -1 } },
  ]);

  // 5. Payment Trends: Monthly paid amount vs invoiced amount
  const trendsAgg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        invoiced: { $sum: '$amount' },
        paid: { $sum: { $cond: [{ $eq: ['$status', INVOICE_STATUS.PAID] }, '$amount', 0] } },
        invoicesCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    summary: {
      totalInvoiced,
      totalPaid,
      pendingAmount,
      pendingCount,
      expiredAmount,
      expiredCount,
      cancelledAmount,
      cancelledCount,
      totalInvoicesCount,
      paidInvoicesCount: paidCount,
      paymentTransactionCount: totalTxnCount,
      collectionRate,
    },
    byStatus: invoiceStatsAgg.map((s) => ({
      status: s._id,
      count: s.count,
      totalAmount: s.totalAmount,
    })),
    byPaymentMethod: paymentMethodsAgg.map((m) => ({
      method: m._id,
      count: m.count,
      totalAmount: m.totalAmount,
      successfulCount: m.successfulCount,
      successfulAmount: m.successfulAmount,
    })),
    byProgram: revenueByProgramAgg,
    byDivision: revenueByDivisionAgg.map((d) => ({
      division: d._id,
      invoicedAmount: d.invoicedAmount,
      invoiceCount: d.invoiceCount,
      paidAmount: d.paidAmount,
      paidCount: d.paidCount,
      pendingAmount: d.pendingAmount,
      expiredAmount: d.expiredAmount,
    })),
    timeline: trendsAgg.map((t) => ({
      date: t._id,
      invoiced: t.invoiced,
      paid: t.paid,
      invoicesCount: t.invoicesCount,
    })),
    appliedFilters: { division, program: program || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// E. TRAINING & EVALUATION REPORT
// ============================================================================
async function getEvaluationsReport({ division = 'all', program, cohort, dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'evaluatedAt') };

  if (program && program !== 'all') {
    if (mongoose.Types.ObjectId.isValid(program)) {
      match.program = new mongoose.Types.ObjectId(program);
    }
  }
  if (cohort && cohort !== 'all') {
    if (mongoose.Types.ObjectId.isValid(cohort)) {
      match.cohort = new mongoose.Types.ObjectId(cohort);
    }
  }

  // 1. Overall Summary
  const summaryAgg = await Evaluation.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passCount: { $sum: { $cond: [{ $eq: ['$outcome', 'PASS'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$outcome', 'FAIL'] }, 1, 0] } },
        incompleteCount: { $sum: { $cond: [{ $eq: ['$outcome', 'INCOMPLETE'] }, 1, 0] } },
        avgScore: { $avg: '$averageScore' },
        avgAttendance: { $avg: '$attendanceRate' },
        attendanceMetCount: { $sum: { $cond: ['$attendanceThresholdMet', 1, 0] } },
      },
    },
  ]);

  const summaryData = summaryAgg[0] || {
    total: 0,
    passCount: 0,
    failCount: 0,
    incompleteCount: 0,
    avgScore: 0,
    avgAttendance: 0,
    attendanceMetCount: 0,
  };

  const total = summaryData.total;
  const passRate = total > 0 ? Math.round((summaryData.passCount / total) * 1000) / 10 : 0;
  const failRate = total > 0 ? Math.round((summaryData.failCount / total) * 1000) / 10 : 0;
  const incompleteRate = total > 0 ? Math.round((summaryData.incompleteCount / total) * 1000) / 10 : 0;

  // 2. Score distribution buckets
  const scoreBucketsAgg = await Evaluation.aggregate([
    { $match: match },
    {
      $bucket: {
        groupBy: '$averageScore',
        boundaries: [0, 60, 70, 80, 90, 101],
        default: 'Other',
        output: {
          count: { $sum: 1 },
        },
      },
    },
  ]);

  const bucketLabels = {
    0: 'Below 60% (Failing)',
    60: '60% - 69% (Satisfactory)',
    70: '70% - 79% (Good)',
    80: '80% - 89% (Very Good)',
    90: '90% - 100% (Excellent)',
  };

  const scoreDistribution = scoreBucketsAgg.map((b) => ({
    range: bucketLabels[b._id] || `${b._id}%+`,
    count: b.count,
    percentage: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0,
  }));

  // 3. Evaluations by Program
  const byProgramAgg = await Evaluation.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$program',
        total: { $sum: 1 },
        passCount: { $sum: { $cond: [{ $eq: ['$outcome', 'PASS'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$outcome', 'FAIL'] }, 1, 0] } },
        incompleteCount: { $sum: { $cond: [{ $eq: ['$outcome', 'INCOMPLETE'] }, 1, 0] } },
        avgScore: { $avg: '$averageScore' },
        avgAttendance: { $avg: '$attendanceRate' },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'programInfo',
      },
    },
    { $unwind: { path: '$programInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        programId: '$_id',
        title: { $ifNull: ['$programInfo.title', 'Unknown Program'] },
        division: { $ifNull: ['$programInfo.division', 'PRE_UNIVERSITY'] },
        total: 1,
        passCount: 1,
        failCount: 1,
        incompleteCount: 1,
        avgScore: { $round: ['$avgScore', 1] },
        avgAttendance: { $round: ['$avgAttendance', 1] },
        passRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $round: [{ $multiply: [{ $divide: ['$passCount', '$total'] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 4. Evaluations by Cohort
  const byCohortAgg = await Evaluation.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$cohort',
        total: { $sum: 1 },
        passCount: { $sum: { $cond: [{ $eq: ['$outcome', 'PASS'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$outcome', 'FAIL'] }, 1, 0] } },
        incompleteCount: { $sum: { $cond: [{ $eq: ['$outcome', 'INCOMPLETE'] }, 1, 0] } },
        avgScore: { $avg: '$averageScore' },
        avgAttendance: { $avg: '$attendanceRate' },
      },
    },
    {
      $lookup: {
        from: 'cohorts',
        localField: '_id',
        foreignField: '_id',
        as: 'cohortInfo',
      },
    },
    { $unwind: { path: '$cohortInfo', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'courses',
        localField: 'cohortInfo.program',
        foreignField: '_id',
        as: 'programInfo',
      },
    },
    { $unwind: { path: '$programInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        cohortId: '$_id',
        cohortNumber: { $ifNull: ['$cohortInfo.cohortNumber', 'N/A'] },
        name: { $ifNull: ['$cohortInfo.name', 'Unnamed Cohort'] },
        programTitle: { $ifNull: ['$programInfo.title', 'Unknown'] },
        division: { $ifNull: ['$cohortInfo.division', 'PRE_UNIVERSITY'] },
        total: 1,
        passCount: 1,
        failCount: 1,
        incompleteCount: 1,
        avgScore: { $round: ['$avgScore', 1] },
        avgAttendance: { $round: ['$avgAttendance', 1] },
        passRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $round: [{ $multiply: [{ $divide: ['$passCount', '$total'] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 5. Total cohorts evaluated count
  const evaluatedCohortsCount = byCohortAgg.length;

  return {
    summary: {
      totalEvaluations: total,
      passCount: summaryData.passCount,
      failCount: summaryData.failCount,
      incompleteCount: summaryData.incompleteCount,
      passRate,
      failRate,
      incompleteRate,
      avgScore: Math.round(summaryData.avgScore * 10) / 10,
      avgAttendanceRate: Math.round(summaryData.avgAttendance * 10) / 10,
      evaluatedCohortsCount,
    },
    outcomeDistribution: [
      { outcome: 'PASS', count: summaryData.passCount, percentage: passRate },
      { outcome: 'FAIL', count: summaryData.failCount, percentage: failRate },
      { outcome: 'INCOMPLETE', count: summaryData.incompleteCount, percentage: incompleteRate },
    ],
    scoreDistribution,
    byProgram: byProgramAgg,
    byCohort: byCohortAgg,
    appliedFilters: { division, program: program || null, cohort: cohort || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// F. CERTIFICATES REPORT
// ============================================================================
async function getCertificatesReport({ division = 'all', program, dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'issuedAt') };

  if (program && program !== 'all') {
    if (mongoose.Types.ObjectId.isValid(program)) {
      match.program = new mongoose.Types.ObjectId(program);
    }
  }

  // 1. Status breakdown
  const byStatusAgg = await Certificate.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const totalCertificates = byStatusAgg.reduce((acc, curr) => acc + curr.count, 0);
  const issuedCount = byStatusAgg.find((s) => s._id === CERTIFICATE_STATUS.ISSUED)?.count || 0;
  const revokedCount = byStatusAgg.find((s) => s._id === CERTIFICATE_STATUS.REVOKED)?.count || 0;
  const activeRate = totalCertificates > 0 ? Math.round((issuedCount / totalCertificates) * 1000) / 10 : 0;

  // 2. Certificates by Program
  const byProgramAgg = await Certificate.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$program',
        total: { $sum: 1 },
        issued: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.ISSUED] }, 1, 0] } },
        revoked: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.REVOKED] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'programInfo',
      },
    },
    { $unwind: { path: '$programInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        programId: '$_id',
        title: { $ifNull: ['$programInfo.title', 'Unknown Program'] },
        division: { $ifNull: ['$programInfo.division', 'PRE_UNIVERSITY'] },
        total: 1,
        issued: 1,
        revoked: 1,
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 3. Certificates by Division
  const byDivisionAgg = await Certificate.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$division',
        total: { $sum: 1 },
        issued: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.ISSUED] }, 1, 0] } },
        revoked: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.REVOKED] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 4. Timeline
  const timelineAgg = await Certificate.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt' } },
        issued: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.ISSUED] }, 1, 0] } },
        revoked: { $sum: { $cond: [{ $eq: ['$status', CERTIFICATE_STATUS.REVOKED] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    summary: {
      totalCertificates,
      issuedCount,
      revokedCount,
      activeRate,
    },
    byProgram: byProgramAgg,
    byDivision: byDivisionAgg.map((d) => ({
      division: d._id,
      total: d.total,
      issued: d.issued,
      revoked: d.revoked,
    })),
    timeline: timelineAgg.map((t) => ({
      date: t._id,
      issued: t.issued,
      revoked: t.revoked,
      total: t.total,
    })),
    appliedFilters: { division, program: program || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// G. NOTIFICATIONS REPORT
// ============================================================================
async function getNotificationsReport({ division = 'all', dateFrom, dateTo }) {
  const match = { ...getDivisionCondition(division), ...buildDateCriteria(dateFrom, dateTo, 'createdAt') };

  // 1. Overall counts
  const [
    totalNotifications,
    readCount,
    unreadCount,
    emailSentCount,
    emailFailureCount,
    byTypeAgg,
    byDivisionAgg,
    timelineAgg,
  ] = await Promise.all([
    Notification.countDocuments(match),
    Notification.countDocuments({ ...match, read: true }),
    Notification.countDocuments({ ...match, read: false }),
    Notification.countDocuments({ ...match, emailSent: true }),
    Notification.countDocuments({
      ...match,
      $or: [
        { emailError: { $ne: null } },
        { emailSent: false, emailError: { $exists: true, $ne: null } },
      ],
    }),
    Notification.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          readCount: { $sum: { $cond: ['$read', 1, 0] } },
          unreadCount: { $sum: { $cond: ['$read', 0, 1] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Notification.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$division', 'UNASSIGNED'] },
          count: { $sum: 1 },
          readCount: { $sum: { $cond: ['$read', 1, 0] } },
          unreadCount: { $sum: { $cond: ['$read', 0, 1] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Notification.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          readCount: { $sum: { $cond: ['$read', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const readRate = totalNotifications > 0 ? Math.round((readCount / totalNotifications) * 1000) / 10 : 0;

  return {
    summary: {
      totalNotifications,
      readCount,
      unreadCount,
      readRate,
      emailSentCount,
      emailFailureCount,
    },
    byType: byTypeAgg.map((t) => ({
      type: t._id,
      count: t.count,
      readCount: t.readCount,
      unreadCount: t.unreadCount,
      readRate: t.count > 0 ? Math.round((t.readCount / t.count) * 1000) / 10 : 0,
    })),
    byDivision: byDivisionAgg.map((d) => ({
      division: d._id,
      count: d.count,
      readCount: d.readCount,
      unreadCount: d.unreadCount,
    })),
    timeline: timelineAgg.map((t) => ({
      date: t._id,
      count: t.count,
      readCount: t.readCount,
    })),
    appliedFilters: { division, dateFrom: dateFrom || null, dateTo: dateTo || null },
  };
}

// ============================================================================
// H. CSV EXPORT UTILITY
// ============================================================================
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCsv(headers, rows) {
  const headerLine = headers.map((h) => escapeCsvValue(h.label)).join(',');
  const rowLines = rows.map((r) =>
    headers.map((h) => escapeCsvValue(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(',')
  );
  return [headerLine, ...rowLines].join('\r\n');
}

async function exportReportCsv({ reportType, division = 'all', program, cohort, dateFrom, dateTo, status, user }) {
  let csvContent = '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let filename = `esa_report_${reportType}_${division}_${timestamp}.csv`;

  switch (reportType) {
    case 'applications': {
      const data = await getApplicationsReport({ division, program, status, dateFrom, dateTo });
      const headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Level', key: 'level' },
        { label: 'Total Applications', key: 'total' },
        { label: 'Accepted', key: 'accepted' },
        { label: 'Rejected', key: 'rejected' },
        { label: 'Waitlisted', key: 'waitlisted' },
        { label: 'Acceptance Rate (%)', key: 'acceptanceRate' },
      ];
      csvContent = arrayToCsv(headers, data.byProgram);
      break;
    }
    case 'enrollments': {
      const data = await getEnrollmentCapacityReport({ division, program, cohort, status, dateFrom, dateTo });
      const headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Level', key: 'level' },
        { label: 'Capacity', key: 'capacity' },
        { label: 'Occupied Capacity', key: 'occupied' },
        { label: 'Confirmed', key: 'confirmed' },
        { label: 'Pending Payment', key: 'pendingPayment' },
        { label: 'Waitlisted', key: 'waitlisted' },
        { label: 'Cancelled', key: 'cancelled' },
        { label: 'Available Seats', key: 'available' },
        { label: 'Utilization Rate (%)', key: 'utilizationRate' },
      ];
      csvContent = arrayToCsv(headers, data.byProgram);
      break;
    }
    case 'finance': {
      const data = await getFinanceReport({ division, program, dateFrom, dateTo });
      const headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Price (EGP)', key: 'price' },
        { label: 'Invoiced Amount (EGP)', key: 'invoicedAmount' },
        { label: 'Paid Amount (EGP)', key: 'paidAmount' },
        { label: 'Pending Amount (EGP)', key: 'pendingAmount' },
        { label: 'Expired Amount (EGP)', key: 'expiredAmount' },
        { label: 'Paid Invoices Count', key: 'paidCount' },
        { label: 'Total Invoices Count', key: 'invoiceCount' },
      ];
      csvContent = arrayToCsv(headers, data.byProgram);
      break;
    }
    case 'evaluations': {
      const data = await getEvaluationsReport({ division, program, cohort, dateFrom, dateTo });
      const headers = [
        { label: 'Cohort Number', key: 'cohortNumber' },
        { label: 'Cohort Name', key: 'name' },
        { label: 'Program', key: 'programTitle' },
        { label: 'Division', key: 'division' },
        { label: 'Evaluations Count', key: 'total' },
        { label: 'Pass Count', key: 'passCount' },
        { label: 'Fail Count', key: 'failCount' },
        { label: 'Incomplete Count', key: 'incompleteCount' },
        { label: 'Pass Rate (%)', key: 'passRate' },
        { label: 'Avg Score (%)', key: 'avgScore' },
        { label: 'Avg Attendance (%)', key: 'avgAttendance' },
      ];
      csvContent = arrayToCsv(headers, data.byCohort);
      break;
    }
    case 'certificates': {
      const data = await getCertificatesReport({ division, program, dateFrom, dateTo });
      const headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Active Certificates (Issued)', key: 'issued' },
        { label: 'Revoked Certificates', key: 'revoked' },
        { label: 'Total Issued Ever', key: 'total' },
      ];
      csvContent = arrayToCsv(headers, data.byProgram);
      break;
    }
    case 'notifications': {
      const data = await getNotificationsReport({ division, dateFrom, dateTo });
      const headers = [
        { label: 'Notification Type', key: 'type' },
        { label: 'Total Generated', key: 'count' },
        { label: 'Read Count', key: 'readCount' },
        { label: 'Unread Count', key: 'unreadCount' },
        { label: 'Read Rate (%)', key: 'readRate' },
      ];
      csvContent = arrayToCsv(headers, data.byType);
      break;
    }
    case 'overview':
    default: {
      const data = await getOverviewReport({ division, dateFrom, dateTo });
      const headers = [
        { label: 'Metric', key: 'metric' },
        { label: 'Value', key: 'value' },
      ];
      const rows = [
        { metric: 'Total Students', value: data.summary.totalStudents },
        { metric: 'Active Students', value: data.summary.activeStudents },
        { metric: 'Total Programs', value: data.summary.totalPrograms },
        { metric: 'Active Programs', value: data.summary.activePrograms },
        { metric: 'Total Applications', value: data.summary.totalApplications },
        { metric: 'Accepted Applications', value: data.summary.acceptedApplications },
        { metric: 'Rejected Applications', value: data.summary.rejectedApplications },
        { metric: 'Waitlisted Applications', value: data.summary.waitlistedApplications },
        { metric: 'Total Enrollments', value: data.summary.totalEnrollments },
        { metric: 'Confirmed Enrollments', value: data.summary.confirmedEnrollments },
        { metric: 'Pending Payment Enrollments', value: data.summary.pendingPayments },
        { metric: 'Total Revenue (EGP)', value: data.summary.totalRevenue },
        { metric: 'Certificates Issued', value: data.summary.certificatesIssued },
      ];
      csvContent = arrayToCsv(headers, rows);
      break;
    }
  }

  // Record audit log event for export
  if (user) {
    await recordAudit({
      user,
      action: 'REPORT_EXPORT',
      resource: 'Report',
      division: division === 'all' ? null : division,
      after: {
        reportType,
        filters: { division, program, cohort, dateFrom, dateTo, status },
      },
      reason: `Exported ${reportType} report as CSV`,
    });
  }

  return { filename, csvContent };
}

const { generateAnalyticsReportPdfBuffer } = require('../utils/reportPdfGenerator');

async function exportReportPdf({
  reportType,
  division = 'all',
  program,
  cohort,
  dateFrom,
  dateTo,
  status,
  user,
}) {
  const cleanType = (reportType || 'overview').toLowerCase();
  const timestamp = Date.now();
  const filename = `ESA_Report_${cleanType.toUpperCase()}_${division}_${timestamp}.pdf`;

  let reportTitle = 'Academy Overview Report';
  let kpiCards = [];
  let headers = [];
  let rows = [];

  switch (cleanType) {
    case 'applications': {
      reportTitle = 'Applications & Admissions Funnel Report';
      const data = await getApplicationsReport({ division, program, status, dateFrom, dateTo });
      kpiCards = [
        { label: 'Total Applications', value: data.funnel.total },
        { label: 'Accepted / Eligible', value: data.funnel.accepted },
        { label: 'Waitlisted', value: data.funnel.waitlisted },
        { label: 'Conversion Rate', value: `${data.funnel.conversionRate}%` },
      ];
      headers = [
        { label: 'Program', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Total Apps', key: 'total' },
        { label: 'Accepted', key: 'accepted' },
        { label: 'Rejected', key: 'rejected' },
        { label: 'Waitlisted', key: 'waitlisted' },
      ];
      rows = data.byProgram || [];
      break;
    }
    case 'enrollments': {
      reportTitle = 'Enrollment & Cohort Capacity Report';
      const data = await getEnrollmentCapacityReport({ division, program, cohort, status, dateFrom, dateTo });
      kpiCards = [
        { label: 'Total Enrolled', value: data.summary.totalEnrolled },
        { label: 'Confirmed', value: data.summary.confirmed },
        { label: 'Capacity Utilization', value: `${data.summary.overallUtilizationRate}%` },
        { label: 'Total Waitlist', value: data.summary.totalWaitlisted },
      ];
      headers = [
        { label: 'Cohort Number', key: 'cohortNumber' },
        { label: 'Program', key: 'programTitle' },
        { label: 'Enrolled / Capacity', key: 'enrolled' },
        { label: 'Utilization', key: 'utilizationRate' },
        { label: 'Waitlisted', key: 'waitlisted' },
        { label: 'Status', key: 'status' },
      ];
      rows = (data.byCohort || []).map((c) => ({
        ...c,
        enrolled: `${c.enrolled} / ${c.capacity}`,
        utilizationRate: `${c.utilizationRate}%`,
      }));
      break;
    }
    case 'finance': {
      reportTitle = 'Academy Finance & Revenue Ledger';
      const data = await getFinanceReport({ division, program, dateFrom, dateTo });
      kpiCards = [
        { label: 'Total Invoiced', value: `${data.summary.totalInvoicedAmount} EGP` },
        { label: 'Collected Revenue', value: `${data.summary.totalPaidAmount} EGP` },
        { label: 'Outstanding Balance', value: `${data.summary.outstandingAmount} EGP` },
        { label: 'Collection Rate', value: `${data.summary.collectionRate}%` },
      ];
      headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Invoices', key: 'invoiceCount' },
        { label: 'Invoiced Amount', key: 'invoicedAmount' },
        { label: 'Collected Revenue', key: 'paidAmount' },
        { label: 'Outstanding', key: 'outstanding' },
      ];
      rows = (data.byProgram || []).map((p) => ({
        ...p,
        invoicedAmount: `${p.invoicedAmount} EGP`,
        paidAmount: `${p.paidAmount} EGP`,
        outstanding: `${p.outstanding} EGP`,
      }));
      break;
    }
    case 'evaluations': {
      reportTitle = 'Learning Outcomes & Evaluations Report';
      const data = await getEvaluationsReport({ division, program, cohort, dateFrom, dateTo });
      kpiCards = [
        { label: 'Evaluated Students', value: data.summary.totalEvaluated },
        { label: 'Pass Rate', value: `${data.summary.overallPassRate}%` },
        { label: 'Average Attendance', value: `${data.summary.overallAvgAttendance}%` },
        { label: 'Average Score', value: `${data.summary.overallAvgScore}%` },
      ];
      headers = [
        { label: 'Cohort Number', key: 'cohortNumber' },
        { label: 'Program', key: 'programTitle' },
        { label: 'Evaluated', key: 'evaluatedCount' },
        { label: 'Pass Rate', key: 'passRate' },
        { label: 'Avg Attendance', key: 'avgAttendance' },
        { label: 'Avg Score', key: 'avgScore' },
      ];
      rows = (data.byCohort || []).map((c) => ({
        ...c,
        passRate: `${c.passRate}%`,
        avgAttendance: `${c.avgAttendance}%`,
        avgScore: `${c.avgScore}%`,
      }));
      break;
    }
    case 'certificates': {
      reportTitle = 'Institutional Certificates & Credentials Report';
      const data = await getCertificatesReport({ division, program, dateFrom, dateTo });
      kpiCards = [
        { label: 'Active Certificates', value: data.summary.activeCertificates },
        { label: 'Revoked Credentials', value: data.summary.revokedCertificates },
        { label: 'Total Issued Ever', value: data.summary.totalIssuedEver },
        { label: 'Valid Integrity Rate', value: `${data.summary.integrityRate}%` },
      ];
      headers = [
        { label: 'Program Title', key: 'title' },
        { label: 'Division', key: 'division' },
        { label: 'Active Issued', key: 'issued' },
        { label: 'Revoked', key: 'revoked' },
        { label: 'Total Issued', key: 'total' },
      ];
      rows = data.byProgram || [];
      break;
    }
    case 'notifications': {
      reportTitle = 'System Notifications & Communication Report';
      const data = await getNotificationsReport({ division, dateFrom, dateTo });
      kpiCards = [
        { label: 'Total Notifications', value: data.summary.totalNotifications },
        { label: 'Read Notifications', value: data.summary.readNotifications },
        { label: 'Unread', value: data.summary.unreadNotifications },
        { label: 'Engagement Rate', value: `${data.summary.overallReadRate}%` },
      ];
      headers = [
        { label: 'Notification Event Type', key: 'type' },
        { label: 'Total Sent', key: 'count' },
        { label: 'Read Count', key: 'readCount' },
        { label: 'Unread Count', key: 'unreadCount' },
        { label: 'Read Rate', key: 'readRate' },
      ];
      rows = (data.byType || []).map((t) => ({
        ...t,
        readRate: `${t.readRate}%`,
      }));
      break;
    }
    case 'overview':
    default: {
      reportTitle = 'Academy Comprehensive Overview Report';
      const data = await getOverviewReport({ division, dateFrom, dateTo });
      kpiCards = [
        { label: 'Total Students', value: data.summary.totalStudents },
        { label: 'Active Programs', value: data.summary.activePrograms },
        { label: 'Total Applications', value: data.summary.totalApplications },
        { label: 'Total Revenue', value: `${data.summary.totalRevenue} EGP` },
      ];
      headers = [
        { label: 'Core Academy Metric', key: 'metric' },
        { label: 'Operational Value', key: 'value' },
      ];
      rows = [
        { metric: 'Total Students Registered', value: data.summary.totalStudents },
        { metric: 'Active Students', value: data.summary.activeStudents },
        { metric: 'Total Academy Programs', value: data.summary.totalPrograms },
        { metric: 'Active Training Programs', value: data.summary.activePrograms },
        { metric: 'Total Applications Received', value: data.summary.totalApplications },
        { metric: 'Accepted Applications', value: data.summary.acceptedApplications },
        { metric: 'Rejected Applications', value: data.summary.rejectedApplications },
        { metric: 'Waitlisted Applications', value: data.summary.waitlistedApplications },
        { metric: 'Total Cohort Enrollments', value: data.summary.totalEnrollments },
        { metric: 'Confirmed Students', value: data.summary.confirmedEnrollments },
        { metric: 'Pending Payment Enrollments', value: data.summary.pendingPayments },
        { metric: 'Total Revenue Collected', value: `${data.summary.totalRevenue} EGP` },
        { metric: 'Official Certificates Awarded', value: data.summary.certificatesIssued },
      ];
      break;
    }
  }

  const pdfBuffer = await generateAnalyticsReportPdfBuffer({
    reportTitle,
    reportType: cleanType,
    division,
    filters: { program, cohort, dateFrom, dateTo, status },
    kpiCards,
    headers,
    rows,
  });

  if (user) {
    await recordAudit({
      user,
      action: 'REPORT_EXPORTED',
      resource: 'Report',
      division: division === 'all' ? null : division,
      after: {
        format: 'PDF',
        reportType: cleanType,
        filters: { division, program, cohort, dateFrom, dateTo, status },
      },
      reason: `Exported ${cleanType} report as institutional PDF`,
    });
  }

  return { filename, pdfBuffer };
}

module.exports = {
  getOverviewReport,
  getApplicationsReport,
  getEnrollmentCapacityReport,
  getFinanceReport,
  getEvaluationsReport,
  getCertificatesReport,
  getNotificationsReport,
  exportReportCsv,
  exportReportPdf,
};
