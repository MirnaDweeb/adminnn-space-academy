const mongoose = require('../backend/node_modules/mongoose');

async function verifyDatabase() {
  console.log('====================================================');
  console.log('PHASE 8 — DIRECT MONGODB DATABASE VERIFICATION');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const ReadinessResult = mongoose.model('ReadinessResult', new mongoose.Schema({}, { strict: false }));
  const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

  // 1. ReadinessResult document checks
  const totalResults = await ReadinessResult.countDocuments();
  console.log(`[DB COUNT] Total ReadinessResult documents in MongoDB: ${totalResults}`);

  const sampleResults = await ReadinessResult.find().sort({ createdAt: -1 }).limit(3);
  console.log('\n--- SAMPLE LATEST READINESS RESULTS ---');
  sampleResults.forEach((r, idx) => {
    console.log(`Result #${idx + 1}:`);
    console.log(`  _id: ${r._id}`);
    console.log(`  application: ${r.application}`);
    console.log(`  student: ${r.student}`);
    console.log(`  program: ${r.program}`);
    console.log(`  division: ${r.division}`);
    console.log(`  outcome: ${r.outcome}`);
    console.log(`  score: ${r.score}%`);
    console.log(`  evaluatedBy: ${r.evaluatedBy}`);
    console.log(`  evaluatedAt: ${r.evaluatedAt}`);
    console.log(`  createdAt: ${r.createdAt}`);
    console.log(`  criteriaEvaluated count: ${r.criteriaEvaluated?.length}`);
    r.criteriaEvaluated?.forEach((c) => {
      console.log(`    * [${c.met ? 'MET' : 'NOT MET'}] ${c.criterion}: ${c.notes}`);
    });
    console.log(`  recommendationReason: ${r.recommendationReason}`);
    console.log('');
  });

  // 2. Application documents verification
  console.log('--- APPLICATION ELIGIBILITY & STATUS IN DB ---');
  const sampleApps = await Application.find({ eligibilityStatus: { $ne: 'NOT_EVALUATED' } }).limit(4);
  console.log(`Found ${sampleApps.length} evaluated applications in DB:`);
  sampleApps.forEach((a) => {
    console.log(`  App ID: ${a._id}`);
    console.log(`    division: ${a.division}`);
    console.log(`    status: ${a.status}`);
    console.log(`    eligibilityStatus: ${a.eligibilityStatus}`);
    console.log(`    decision: ${a.decision || 'PENDING'}`);
    console.log(`    updatedAt: ${a.updatedAt}`);
  });

  // 3. AuditLog documents verification
  console.log('\n--- AUDIT LOG (READINESS_EVALUATED) IN DB ---');
  const auditLogs = await AuditLog.find({ action: 'READINESS_EVALUATED' }).sort({ timestamp: -1 }).limit(3);
  console.log(`Total READINESS_EVALUATED audit logs: ${await AuditLog.countDocuments({ action: 'READINESS_EVALUATED' })}`);
  auditLogs.forEach((l, idx) => {
    console.log(`Log #${idx + 1}:`);
    console.log(`  _id: ${l._id}`);
    console.log(`  action: ${l.action}`);
    console.log(`  user (actor): ${l.user}`);
    console.log(`  resource: ${l.resource} (ID: ${l.resourceId})`);
    console.log(`  division: ${l.division}`);
    console.log(`  reason: "${l.reason}"`);
    console.log(`  before: ${JSON.stringify(l.before)}`);
    console.log(`  after (outcome/score): ${JSON.stringify({ outcome: l.after?.outcome, score: l.after?.score, status: l.after?.status })}`);
    console.log(`  timestamp: ${l.timestamp}`);
    console.log('');
  });

  await mongoose.disconnect();
}

verifyDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
