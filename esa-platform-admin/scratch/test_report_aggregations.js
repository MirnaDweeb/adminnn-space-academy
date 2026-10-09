const mongoose = require('../backend/node_modules/mongoose');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Application = require('../backend/src/models/Application');
const Enrollment = require('../backend/src/models/Enrollment');
const Invoice = require('../backend/src/models/Invoice');
const PaymentTransaction = require('../backend/src/models/PaymentTransaction');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const Notification = require('../backend/src/models/Notification');
const Cohort = require('../backend/src/models/Cohort');
const AuditLog = require('../backend/src/models/AuditLog');

async function testAllAggregations() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  console.log('--- TESTING REPORT AGGREGATIONS ---');

  // 1. Overview for 'all'
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
    paidInvoices,
    issuedCerts
  ] = await Promise.all([
    User.countDocuments({ role: 'STUDENT' }),
    User.countDocuments({ role: 'STUDENT', isActive: true }),
    Course.countDocuments({}),
    Course.countDocuments({ status: 'ACTIVE' }),
    Application.countDocuments({}),
    Application.countDocuments({ $or: [{ decision: 'ACCEPT' }, { status: { $in: ['CONFIRMED', 'ELIGIBLE_PAYMENT_PENDING'] } }] }),
    Application.countDocuments({ decision: 'REJECT' }),
    Application.countDocuments({ $or: [{ status: 'WAITLISTED' }, { decision: 'WAITLIST' }] }),
    Enrollment.countDocuments({}),
    Enrollment.countDocuments({ status: 'CONFIRMED' }),
    Enrollment.countDocuments({ status: 'PENDING_PAYMENT' }),
    Invoice.aggregate([{ $match: { status: 'PAID' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Certificate.countDocuments({ status: 'ISSUED' })
  ]);

  const totalRevenue = paidInvoices[0]?.total || 0;

  console.log('Overview (ALL):', {
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
    totalRevenue,
    issuedCerts
  });

  // 2. Capacity calculation per program
  const capacityCheck = await Enrollment.aggregate([
    {
      $group: {
        _id: '$program',
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, 1, 0] } },
        pendingPayment: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_PAYMENT'] }, 1, 0] } },
        waitlisted: { $sum: { $cond: [{ $eq: ['$status', 'WAITLISTED'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        confirmed: 1,
        pendingPayment: 1,
        waitlisted: 1,
        cancelled: 1,
        total: 1,
        occupied: { $add: ['$confirmed', '$pendingPayment'] }
      }
    },
    { $limit: 3 }
  ]);
  console.log('Capacity check sample:', capacityCheck);

  // 3. Finance method breakdown
  const methodCheck = await PaymentTransaction.aggregate([
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        successfulCount: { $sum: { $cond: [{ $in: ['$status', ['RECORDED', 'PAID']] }, 1, 0] } },
        successfulAmount: { $sum: { $cond: [{ $in: ['$status', ['RECORDED', 'PAID']] }, '$amount', 0] } }
      }
    }
  ]);
  console.log('Finance method breakdown:', methodCheck);

  // 4. Evaluations outcome distribution
  const evalCheck = await Evaluation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passCount: { $sum: { $cond: [{ $eq: ['$outcome', 'PASS'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$outcome', 'FAIL'] }, 1, 0] } },
        incompleteCount: { $sum: { $cond: [{ $eq: ['$outcome', 'INCOMPLETE'] }, 1, 0] } },
        avgScore: { $avg: '$averageScore' },
        avgAttendance: { $avg: '$attendanceRate' }
      }
    }
  ]);
  console.log('Evaluations summary:', evalCheck);

  process.exit(0);
}

testAllAggregations().catch(e => {
  console.error(e);
  process.exit(1);
});
