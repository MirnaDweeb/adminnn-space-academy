const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/mirna/Downloads/esa-academy-platform/esa-platform-admin/backend/.env' });

async function run() {
  await mongoose.connect('mongodb://localhost:27017/esa_academy');
  const Feedback = require('c:/Users/mirna/Downloads/esa-academy-platform/esa-platform-admin/backend/src/models/Feedback');

  const ratings = await Feedback.aggregate([
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: -1 } }
  ]);
  console.log('Ratings distribution:', ratings);

  const categories = await Feedback.aggregate([
    { $group: { _id: '$feedbackType', count: { $sum: 1 } } }
  ]);
  console.log('Categories breakdown:', categories);

  const sentiments = await Feedback.aggregate([
    { $group: { _id: '$sentiment', count: { $sum: 1 } } }
  ]);
  console.log('Sentiments breakdown:', sentiments);

  const attention = await Feedback.find({
    $or: [
      { sentiment: 'NEGATIVE' },
      { rating: { $lte: 2 } },
      { improvements: { $exists: true, $ne: '' } }
    ]
  }).populate('program', 'title').limit(3);
  console.log('Needs attention count:', attention.length, 'sample:', attention[0]?.improvements);

  await mongoose.disconnect();
}

run().catch(console.error);
