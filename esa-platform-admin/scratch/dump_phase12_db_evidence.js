const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Evaluation = require('../backend/src/models/Evaluation');
const AuditLog = require('../backend/src/models/AuditLog');
const mongoose = require('../backend/src/models/User').base || require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  const passDoc = await Evaluation.findOne({ outcome: 'PASS' })
    .populate('cohort', 'cohortNumber name')
    .populate('student', 'fullName email')
    .populate('evaluatedBy', 'fullName email role')
    .lean();

  const failGateDoc = await Evaluation.findOne({ outcome: 'FAIL', attendanceThresholdMet: false })
    .populate('cohort', 'cohortNumber name')
    .populate('student', 'fullName email')
    .populate('evaluatedBy', 'fullName email role')
    .lean();

  const failScoreDoc = await Evaluation.findOne({ outcome: 'FAIL', attendanceThresholdMet: true })
    .populate('cohort', 'cohortNumber name')
    .populate('student', 'fullName email')
    .populate('evaluatedBy', 'fullName email role')
    .lean();

  const incompleteDoc = await Evaluation.findOne({ outcome: 'INCOMPLETE' })
    .populate('cohort', 'cohortNumber name')
    .populate('student', 'fullName email')
    .populate('evaluatedBy', 'fullName email role')
    .lean();

  // Find a student with 2 evaluations to show append-only history
  const multiRuns = await Evaluation.find({ student: passDoc?.student?._id })
    .sort({ evaluatedAt: -1 })
    .lean();

  const auditLog = await AuditLog.findOne({ action: 'EVALUATION_COMPUTED' })
    .sort({ timestamp: -1 })
    .lean();

  console.log('=== REAL DB EVIDENCE: PASS EVALUATION ===');
  console.log(JSON.stringify(passDoc, null, 2));

  console.log('\n=== REAL DB EVIDENCE: FAIL (ATTENDANCE GATE OVERRIDE) EVALUATION ===');
  console.log(JSON.stringify(failGateDoc, null, 2));

  console.log('\n=== REAL DB EVIDENCE: FAIL (SCORE BELOW THRESHOLD) EVALUATION ===');
  console.log(JSON.stringify(failScoreDoc, null, 2));

  console.log('\n=== REAL DB EVIDENCE: INCOMPLETE (UNGRADED/MISSING DELIVERABLES) EVALUATION ===');
  console.log(JSON.stringify(incompleteDoc, null, 2));

  console.log('\n=== REAL DB EVIDENCE: APPEND-ONLY RE-EVALUATION RUNS FOR SAME STUDENT ===');
  console.log(JSON.stringify(multiRuns, null, 2));

  console.log('\n=== REAL DB EVIDENCE: AUDIT LOG (EVALUATION_COMPUTED) ===');
  console.log(JSON.stringify(auditLog, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
