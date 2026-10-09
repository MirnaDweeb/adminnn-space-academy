const mongoose = require('../backend/node_modules/mongoose');

async function verifyDatabase() {
  console.log('====================================================');
  console.log('PHASE 9 — DIRECT MONGODB DATABASE VERIFICATION');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

  // 1. Enrollment Collection Overview
  const totalEnrollments = await Enrollment.countDocuments();
  console.log(`[DB STATS] Total Enrollment documents in MongoDB: ${totalEnrollments}`);

  const countsByStatus = await Enrollment.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  console.log('Enrollments Breakdown by Status:');
  countsByStatus.forEach((c) => {
    console.log(`  - ${c._id}: ${c.count}`);
  });

  // 2. Sample Documents from each lifecycle status
  console.log('\n--- SAMPLE ENROLLMENTS ACROSS STATUSES ---');
  for (const status of ['PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED', 'CANCELLED']) {
    const sample = await Enrollment.findOne({ status }).sort({ createdAt: -1 });
    if (sample) {
      console.log(`\nSample ${status}:`);
      console.log(`  _id: ${sample._id}`);
      console.log(`  application: ${sample.application}`);
      console.log(`  student: ${sample.student}`);
      console.log(`  program: ${sample.program}`);
      console.log(`  division: ${sample.division}`);
      console.log(`  status: ${sample.status}`);
      console.log(`  enrolledAt: ${sample.enrolledAt}`);
      if (sample.confirmedAt) console.log(`  confirmedAt: ${sample.confirmedAt}`);
      if (sample.cancelledAt) console.log(`  cancelledAt: ${sample.cancelledAt}`);
      if (sample.cancelReason) console.log(`  cancelReason: "${sample.cancelReason}"`);
      console.log(`  createdAt: ${sample.createdAt}`);
    } else {
      console.log(`\nSample ${status}: None found in DB yet.`);
    }
  }

  // 3. Verify Capacity Invariant across all courses in DB
  console.log('\n--- CAPACITY INVARIANT VERIFICATION ACROSS ALL PROGRAMS ---');
  const courses = await Course.find({ status: { $in: ['ACTIVE', 'DRAFT'] } });
  let invariantViolated = false;

  for (const crs of courses) {
    const pendCount = await Enrollment.countDocuments({ program: crs._id, status: 'PENDING_PAYMENT' });
    const confCount = await Enrollment.countDocuments({ program: crs._id, status: 'CONFIRMED' });
    const waitCount = await Enrollment.countDocuments({ program: crs._id, status: 'WAITLISTED' });
    const cancCount = await Enrollment.countDocuments({ program: crs._id, status: 'CANCELLED' });
    const occupied = pendCount + confCount;

    const preserves = occupied <= crs.capacity;
    if (!preserves) invariantViolated = true;

    if (occupied > 0 || waitCount > 0) {
      console.log(`Program: "${crs.title}" (${crs.division})`);
      console.log(`  Capacity: ${crs.capacity} | Occupied: ${occupied} (${pendCount} pending + ${confCount} conf) | Waitlisted: ${waitCount} | Cancelled: ${cancCount}`);
      console.log(`  Invariant (${occupied} <= ${crs.capacity}): ${preserves ? 'VALID' : 'VIOLATED!'}`);
    }
  }
  console.log(`Invariant Check: ${invariantViolated ? 'FAILED' : 'ALL PROGRAMS SATISFY INVARIANT'}`);

  // 4. Duplicate Protection Index Verification
  console.log('\n--- PARTIAL UNIQUE INDEX VERIFICATION ---');
  const indexes = await Enrollment.collection.indexes();
  const partialUnique = indexes.find((idx) => idx.unique && idx.key && idx.key.application);
  console.log('Partial Unique Index found on application:');
  console.log(JSON.stringify(partialUnique, null, 2));

  // 5. Audit Log Verification for Phase 9 Actions
  console.log('\n--- PHASE 9 AUDIT LOG VERIFICATION ---');
  const phase9Actions = [
    'ENROLLMENT_CREATED',
    'ENROLLMENT_WAITLISTED',
    'ENROLLMENT_CANCELLED',
    'ENROLLMENT_PROMOTED_FROM_WAITLIST',
  ];

  for (const act of phase9Actions) {
    const count = await AuditLog.countDocuments({ action: act });
    const sample = await AuditLog.findOne({ action: act }).sort({ timestamp: -1 });
    console.log(`Action: ${act} (Count: ${count})`);
    if (sample) {
      console.log(`  Sample Actor: ${sample.user}`);
      console.log(`  Resource: ${sample.resource} (${sample.resourceId})`);
      console.log(`  Division: ${sample.division}`);
      console.log(`  Reason: "${sample.reason}"`);
      console.log(`  Timestamp: ${sample.timestamp}`);
      console.log(`  After state: ${JSON.stringify(sample.after)}`);
    }
  }

  await mongoose.disconnect();
}

verifyDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
