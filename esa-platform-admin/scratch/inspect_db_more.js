const mongoose = require('../backend/node_modules/mongoose');

async function inspectData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const db = mongoose.connection.db;

  const txns = await db.collection('paymenttransactions').aggregate([
    { $group: { _id: { method: '$method', status: '$status' }, count: { $sum: 1 }, total: { $sum: '$amount' } } }
  ]).toArray();
  console.log('--- PAYMENT TRANSACTIONS ---', txns);

  const courses = await db.collection('courses').aggregate([
    { $group: { _id: { division: '$division', status: '$status' }, count: { $sum: 1 }, totalCap: { $sum: '$capacity' } } }
  ]).toArray();
  console.log('--- COURSES ---', courses);

  const cohorts = await db.collection('cohorts').aggregate([
    { $group: { _id: { division: '$division', status: '$status' }, count: { $sum: 1 }, totalCap: { $sum: '$capacity' } } }
  ]).toArray();
  console.log('--- COHORTS ---', cohorts);

  process.exit(0);
}

inspectData().catch(e => {
  console.error(e);
  process.exit(1);
});
