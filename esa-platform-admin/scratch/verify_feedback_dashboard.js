const path = require('path');
const mongoose = require(path.resolve(__dirname, '../backend/node_modules/mongoose'));
require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../backend/.env') });
const { listFeedbackAdmin } = require('../backend/src/services/feedbackService');
const { ROLES } = require('../backend/src/constants/roles');
const { DIVISIONS } = require('../backend/src/constants/divisions');

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/esa_academy');
  console.log('--- VERIFYING STUDENT FEEDBACK ANALYTICS DASHBOARD BACKEND & DATA ---');

  // 1. Super Admin - Global (ALL)
  console.log('\n[TEST 1] Global Scope (SUPER_ADMIN, ALL)...');
  const globalRes = await listFeedbackAdmin({
    user: { role: ROLES.SUPER_ADMIN },
    division: 'ALL',
    page: 1,
    limit: 50,
  });

  const { metrics, pagination } = globalRes;
  console.log(`Total Submissions: ${metrics.total}`);
  console.log(`Average Rating: ${metrics.averageRating} / 5.0`);
  console.log(`Positive Feedback: ${metrics.positiveCount} (${metrics.positivePercentage}%)`);
  console.log(`Needs Attention: ${metrics.needsAttentionCount}`);

  // Reconcile Ratings
  const sumRatings = Object.values(metrics.ratingDistribution).reduce((a, b) => a + b, 0);
  console.log(`Ratings Breakdown:`, metrics.ratingDistribution, `Sum: ${sumRatings}`);
  if (sumRatings !== metrics.total) {
    throw new Error(`Rating distribution sum ${sumRatings} does not match total ${metrics.total}`);
  }
  console.log('✓ Rating distribution perfectly reconciles with total');

  // Reconcile Categories
  const sumCategories = Object.values(metrics.categoryBreakdown).reduce((a, b) => a + b, 0);
  console.log(`Categories Breakdown:`, metrics.categoryBreakdown, `Sum: ${sumCategories}`);
  if (sumCategories !== metrics.total) {
    throw new Error(`Category breakdown sum ${sumCategories} does not match total ${metrics.total}`);
  }
  console.log('✓ Category breakdown perfectly reconciles with total');

  // Reconcile Sentiments
  const sumSentiments = Object.values(metrics.sentimentBreakdown).reduce((a, b) => a + b, 0);
  console.log(`Sentiment Breakdown:`, metrics.sentimentBreakdown, `Sum: ${sumSentiments}`);
  if (sumSentiments !== metrics.total) {
    throw new Error(`Sentiment breakdown sum ${sumSentiments} does not match total ${metrics.total}`);
  }
  console.log('✓ Sentiment breakdown perfectly reconciles with total');

  // Verify Improvement Priorities
  console.log(`\nImprovement Priorities Count: ${metrics.improvementPriorities.length}`);
  if (metrics.improvementPriorities.length > 0) {
    const top = metrics.improvementPriorities[0];
    console.log(`Top Priority [${top.category}] ${top.rating}★ (${top.sentiment}): "${top.improvementText}"`);
    console.log(`Program: ${top.programTitle} (${top.cohortNumber})`);
  }

  // 2. Filtered by rating: 5
  console.log('\n[TEST 2] Filter by Rating = 5...');
  const rating5Res = await listFeedbackAdmin({
    user: { role: ROLES.SUPER_ADMIN },
    division: 'ALL',
    rating: 5,
  });
  console.log(`Filtered Total (Rating=5): ${rating5Res.metrics.total}`);
  if (rating5Res.metrics.ratingDistribution[5] !== rating5Res.metrics.total) {
    throw new Error('Rating filter mismatch');
  }
  console.log('✓ Filtered rating count matches total');

  // 3. Pre-University Admin Division Scoping
  console.log('\n[TEST 3] Pre-University Admin Division Scoping...');
  const preUniRes = await listFeedbackAdmin({
    user: { role: ROLES.PRE_UNIVERSITY_ADMIN, division: DIVISIONS.PRE_UNIVERSITY },
    division: DIVISIONS.PRE_UNIVERSITY,
  });
  console.log(`Pre-University Scoped Total: ${preUniRes.metrics.total}`);
  console.log(`Pre-University Avg Rating: ${preUniRes.metrics.averageRating}`);
  console.log(`Pre-University Positive: ${preUniRes.metrics.positiveCount} (${preUniRes.metrics.positivePercentage}%)`);
  console.log(`Pre-University Needs Attention: ${preUniRes.metrics.needsAttentionCount}`);

  // 4. Empty Results (Non-existent search term)
  console.log('\n[TEST 4] Empty Results Handling...');
  const emptyRes = await listFeedbackAdmin({
    user: { role: ROLES.SUPER_ADMIN },
    division: 'ALL',
    search: 'NON_EXISTENT_QUERY_XYZ_12345',
  });
  console.log(`Empty Search Total: ${emptyRes.metrics.total}, Avg: ${emptyRes.metrics.averageRating}`);
  if (emptyRes.metrics.total !== 0 || emptyRes.metrics.averageRating !== 0) {
    throw new Error('Empty search should return 0 total and 0 average rating');
  }
  console.log('✓ Empty results handled truthfully with 0s');

  console.log('\n========================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('========================================');

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
