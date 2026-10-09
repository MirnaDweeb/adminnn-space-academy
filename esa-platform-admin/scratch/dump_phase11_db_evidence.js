const mongoose = require('../backend/node_modules/mongoose');
require('../backend/src/models/Cohort');
require('../backend/src/models/Attendance');
require('../backend/src/models/Assignment');
require('../backend/src/models/Assessment');
require('../backend/src/models/AuditLog');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  const cohort = await mongoose.model('Cohort').findOne().sort({ createdAt: -1 }).lean();
  const attendance = await mongoose.model('Attendance').findOne({ 'history.0': { $exists: true } }).lean() 
    || await mongoose.model('Attendance').findOne().sort({ createdAt: -1 }).lean();
  const assignment = await mongoose.model('Assignment').findOne().sort({ createdAt: -1 }).lean();
  const assessment = await mongoose.model('Assessment').findOne({ 'history.0': { $exists: true } }).lean()
    || await mongoose.model('Assessment').findOne().sort({ createdAt: -1 }).lean();
  
  const audits = await mongoose.model('AuditLog').find({
    action: { $in: ['COHORT_CREATED', 'ATTENDANCE_RECORDED', 'ASSIGNMENT_CREATED', 'ASSESSMENT_RECORDED'] }
  }).sort({ createdAt: -1 }).limit(6).lean();

  console.log('--- COHORT DOC ---');
  console.log(JSON.stringify(cohort, null, 2));

  console.log('--- ATTENDANCE DOC (WITH HISTORY) ---');
  console.log(JSON.stringify(attendance, null, 2));

  console.log('--- ASSIGNMENT DOC ---');
  console.log(JSON.stringify(assignment, null, 2));

  console.log('--- ASSESSMENT DOC (WITH HISTORY) ---');
  console.log(JSON.stringify(assessment, null, 2));

  console.log('--- AUDIT LOGS ---');
  console.log(JSON.stringify(audits, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
