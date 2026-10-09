const mongoose = require('../backend/node_modules/mongoose');

async function inspectData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const db = mongoose.connection.db;

  const sp = await db.collection('studentprofiles').aggregate([
    { $group: { _id: '$division', count: { $sum: 1 } } }
  ]).toArray();
  console.log('StudentProfile counts:', sp);

  const u = await db.collection('users').aggregate([
    { $match: { role: 'STUDENT' } },
    { $group: { _id: '$division', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
  ]).toArray();
  console.log('User role=STUDENT counts:', u);

  process.exit(0);
}

inspectData().catch(e => {
  console.error(e);
  process.exit(1);
});
