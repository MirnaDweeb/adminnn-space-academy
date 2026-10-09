const mongoose = require('../backend/node_modules/mongoose');

async function inspectApplications() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const db = mongoose.connection.db;

  const statuses = await db.collection('applications').aggregate([
    { $group: { _id: { status: '$status', decision: '$decision' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('Application status + decision:', statuses);

  const turnarounds = await db.collection('applications').aggregate([
    { $match: { submittedAt: { $ne: null }, $or: [{ reviewedAt: { $ne: null } }, { 'adminDecision.decidedAt': { $ne: null } }] } },
    { $project: {
        submittedAt: 1,
        reviewedAt: 1,
        decidedAt: '$adminDecision.decidedAt',
        diffReviewed: { $subtract: ['$reviewedAt', '$submittedAt'] },
        diffDecided: { $subtract: ['$adminDecision.decidedAt', '$submittedAt'] }
    }},
    { $limit: 5 }
  ]).toArray();
  console.log('Turnaround sample:', turnarounds);

  process.exit(0);
}

inspectApplications().catch(e => {
  console.error(e);
  process.exit(1);
});
