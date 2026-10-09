const mongoose = require('../backend/node_modules/mongoose');

async function inspectData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const db = mongoose.connection.db;

  const users = await db.collection('users').find({}, { projection: { email: 1, role: 1, division: 1, isActive: 1 } }).toArray();
  console.log('--- ADMINS & USERS ---');
  console.table(users.map(u => ({ email: u.email, role: u.role, division: u.division, isActive: u.isActive })));

  const appCountByDiv = await db.collection('applications').aggregate([
    { $group: { _id: '$division', count: { $sum: 1 } } }
  ]).toArray();
  console.log('--- APPLICATIONS BY DIVISION ---', appCountByDiv);

  const enrCountByDiv = await db.collection('enrollments').aggregate([
    { $group: { _id: { division: '$division', status: '$status' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('--- ENROLLMENTS BY DIVISION & STATUS ---', enrCountByDiv);

  const invByDiv = await db.collection('invoices').aggregate([
    { $group: { _id: { division: '$division', status: '$status' }, count: { $sum: 1 }, total: { $sum: '$amount' } } }
  ]).toArray();
  console.log('--- INVOICES BY DIVISION & STATUS ---', invByDiv);

  const evalCount = await db.collection('evaluations').aggregate([
    { $group: { _id: { division: '$division', outcome: '$outcome' }, count: { $sum: 1 }, avgScore: { $avg: '$averageScore' }, avgAtt: { $avg: '$attendanceRate' } } }
  ]).toArray();
  console.log('--- EVALUATIONS BY DIVISION & OUTCOME ---', evalCount);

  const certCount = await db.collection('certificates').aggregate([
    { $group: { _id: { division: '$division', status: '$status' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('--- CERTIFICATES BY DIVISION & STATUS ---', certCount);

  const notifCount = await db.collection('notifications').aggregate([
    { $group: { _id: { division: '$division', read: '$read', type: '$type' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('--- NOTIFICATIONS ---', notifCount);

  process.exit(0);
}

inspectData().catch(e => {
  console.error(e);
  process.exit(1);
});
