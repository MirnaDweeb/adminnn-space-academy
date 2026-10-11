/**
 * feedbackService.js
 *
 * Handles student feedback queries, insights, student submissions, and seeding.
 * Strict division scoping and role authorization enforced.
 */

const Feedback = require('../models/Feedback');
const Course = require('../models/Course');
const Cohort = require('../models/Cohort');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');
const { generateFeedbackInsights } = require('./feedbackInsightService');

/**
 * Asserts admin user is authorized to manage feedback in the target division.
 */
function assertFeedbackAdminAccess(division, user) {
  if (user.role === ROLES.SUPER_ADMIN) return;
  const userDiv = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
  if (division && userDiv !== division) {
    throw ApiError.forbidden(
      `Cross-division access denied: You cannot view feedback for ${division}`
    );
  }
}

/**
 * List Feedback for Admin with rich filtering.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function listFeedbackAdmin({
  user,
  division,
  program,
  cohort,
  rating,
  feedbackType,
  sentiment,
  search,
  page = 1,
  limit = 20,
}) {
  const query = {};

  // Division Scoping
  const divStr = typeof division === 'string' ? division.trim() : '';
  if (user.role === ROLES.SUPER_ADMIN) {
    if (divStr && divStr.toLowerCase() !== 'all') {
      query.division = divStr;
    }
  } else {
    const userDiv = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
    query.division = userDiv;
  }

  if (program) {
    query.program = program;
  }
  if (cohort) {
    query.cohort = cohort;
  }
  if (rating) {
    query.rating = Number(rating);
  }
  if (feedbackType) {
    query.feedbackType = feedbackType;
  }
  if (sentiment) {
    query.sentiment = sentiment;
  }

  if (search && search.trim()) {
    const term = search.trim();
    // Also find students matching search term
    const matchingStudents = await User.find({
      $or: [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id');

    query.$or = [
      { comments: { $regex: term, $options: 'i' } },
      { strengths: { $regex: term, $options: 'i' } },
      { improvements: { $regex: term, $options: 'i' } },
      { student: { $in: matchingStudents.map((s) => s._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [feedback, total, statsAgg, sentimentAgg, ratingAgg, categoryAgg, attentionRecords, verifiedNeedsAttention] = await Promise.all([
    Feedback.find(query)
      .populate('student', 'fullName email phone studentProfile')
      .populate('program', 'title division level price')
      .populate('cohort', 'cohortNumber name startDate endDate')
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Feedback.countDocuments(query),
    Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$sentiment',
          count: { $sum: 1 },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$feedbackType',
          count: { $sum: 1 },
        },
      },
    ]),
    Feedback.find({
      ...query,
      $or: [
        { improvements: { $exists: true, $ne: '' } },
        { sentiment: 'NEGATIVE' },
        { rating: { $lte: 3 } },
      ],
    })
      .populate('program', 'title')
      .populate('cohort', 'cohortNumber')
      .sort({ rating: 1, submittedAt: -1 })
      .limit(6),
    Feedback.countDocuments({
      ...query,
      $or: [{ sentiment: 'NEGATIVE' }, { rating: { $lte: 2 } }],
    }),
  ]);

  const totalResponses = statsAgg[0]?.total || 0;
  const averageRating = totalResponses > 0 ? Number((statsAgg[0].averageRating || 0).toFixed(1)) : 0;

  const sentimentBreakdown = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  sentimentAgg.forEach((s) => {
    if (s._id && sentimentBreakdown[s._id] !== undefined) {
      sentimentBreakdown[s._id] = s.count;
    }
  });

  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  ratingAgg.forEach((r) => {
    if (r._id && ratingDistribution[r._id] !== undefined) {
      ratingDistribution[r._id] = r.count;
    }
  });

  const categoryBreakdown = {
    OVERALL: 0,
    COURSE_CONTENT: 0,
    INSTRUCTOR: 0,
    FACILITIES: 0,
    PLATFORM: 0,
  };
  categoryAgg.forEach((c) => {
    if (c._id && categoryBreakdown[c._id] !== undefined) {
      categoryBreakdown[c._id] = c.count;
    }
  });

  const positiveCount = sentimentBreakdown.POSITIVE || 0;
  const positivePercentage = totalResponses > 0 ? Math.round((positiveCount / totalResponses) * 100) : 0;

  const improvementPriorities = attentionRecords.map((r) => ({
    id: r._id,
    category: r.feedbackType || 'OVERALL',
    programTitle: r.program?.title || 'Academy Program',
    cohortNumber: r.cohort?.cohortNumber || '',
    rating: r.rating,
    sentiment: r.sentiment,
    improvementText: r.improvements || r.comments,
    submittedAt: r.submittedAt,
  }));

  return {
    feedback,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
    metrics: {
      total: totalResponses,
      averageRating,
      positiveCount,
      positivePercentage,
      needsAttentionCount: verifiedNeedsAttention,
      sentimentBreakdown,
      ratingDistribution,
      categoryBreakdown,
      improvementPriorities,
    },
  };
}

/**
 * Generate Smart Feedback Insights summary for Admin.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function getFeedbackSummaryAdmin({ user, division, program, cohort }) {
  const query = {};

  const divStr = typeof division === 'string' ? division.trim() : '';
  if (user.role === ROLES.SUPER_ADMIN) {
    if (divStr && divStr.toLowerCase() !== 'all') {
      query.division = divStr;
    }
  } else {
    const userDiv = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
    query.division = userDiv;
  }

  if (program) {
    query.program = program;
  }
  if (cohort) {
    query.cohort = cohort;
  }

  const feedbackList = await Feedback.find(query)
    .populate('program', 'title division')
    .populate('cohort', 'cohortNumber')
    .sort({ submittedAt: -1 })
    .limit(100);

  const insights = await generateFeedbackInsights(feedbackList);

  return {
    summary: insights,
    scope: {
      division: query.division || 'ALL',
      program: program || null,
      cohort: cohort || null,
    },
  };
}

/**
 * Submit feedback by student for a completed or enrolled cohort.
 */
async function submitStudentFeedback({
  studentId,
  programId,
  cohortId,
  rating,
  feedbackType,
  comments,
  strengths,
  improvements,
}) {
  if (!comments || !comments.trim()) {
    throw ApiError.badRequest('Feedback comments are required');
  }
  const numRating = Number(rating);
  if (!numRating || numRating < 1 || numRating > 5) {
    throw ApiError.badRequest('Rating must be an integer between 1 and 5');
  }

  const program = await Course.findById(programId);
  if (!program) {
    throw ApiError.notFound('Program not found');
  }

  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw ApiError.notFound('Cohort not found');
  }

  // Derive sentiment
  let sentiment = 'NEUTRAL';
  if (numRating >= 4) sentiment = 'POSITIVE';
  else if (numRating <= 2) sentiment = 'NEGATIVE';

  const feedback = await Feedback.create({
    student: studentId,
    program: programId,
    cohort: cohortId,
    division: program.division,
    rating: numRating,
    feedbackType: feedbackType || 'OVERALL',
    sentiment,
    comments: comments.trim(),
    strengths: strengths ? strengths.trim() : '',
    improvements: improvements ? improvements.trim() : '',
    submittedAt: new Date(),
  });

  return feedback;
}

/**
 * Auto-seed realistic initial feedback if collection is empty.
 */
async function seedFeedbackIfEmpty() {
  const count = await Feedback.countDocuments();
  if (count > 0) return;

  const cohorts = await Cohort.find().populate('program').populate('instructor');
  const students = await User.find({ role: ROLES.STUDENT }).limit(20);

  if (cohorts.length === 0 || students.length === 0) return;

  const feedbackSamples = [
    {
      rating: 5,
      feedbackType: 'COURSE_CONTENT',
      sentiment: 'POSITIVE',
      comments: 'The satellite subsystems hands-on lab was exceptional. Building telemetry models helped solidify theoretical concepts.',
      strengths: 'Outstanding practical CubeSat simulation tools and clear explanations from academy mentors.',
      improvements: 'Would love to see advanced orbital mechanics extended into a second week.',
    },
    {
      rating: 5,
      feedbackType: 'INSTRUCTOR',
      sentiment: 'POSITIVE',
      comments: 'Instructors were extremely knowledgeable and supportive during the payload integration challenge.',
      strengths: 'Mentorship was directly applicable to real space mission engineering.',
      improvements: 'More lab kits per workstation would improve group efficiency.',
    },
    {
      rating: 4,
      feedbackType: 'OVERALL',
      sentiment: 'POSITIVE',
      comments: 'Very rich curriculum. The pace was intensive but very rewarding for aerospace engineering students.',
      strengths: 'Comprehensive curriculum spanning ground stations, propulsion, and avionics.',
      improvements: 'Release session lecture slides at least 24 hours prior to lectures.',
    },
    {
      rating: 4,
      feedbackType: 'FACILITIES',
      sentiment: 'POSITIVE',
      comments: 'Cleanrooms and hardware testing benches at the Egyptian Space Agency were world class.',
      strengths: 'Access to real aerospace instrumentation and testing chambers.',
      improvements: 'Better campus cafeteria hours during weekend cohorts.',
    },
    {
      rating: 3,
      feedbackType: 'PLATFORM',
      sentiment: 'NEUTRAL',
      comments: 'Course content was great, but the portal schedule timings changed once without early email notice.',
      strengths: 'High quality technical materials.',
      improvements: 'Earlier schedule notifications when lab rooms change.',
    },
    {
      rating: 5,
      feedbackType: 'COURSE_CONTENT',
      sentiment: 'POSITIVE',
      comments: 'Brilliant introduction to satellite attitude determination and control systems.',
      strengths: 'Real-time telemetry analysis and ADCS simulation scripts in Python.',
      improvements: 'Provide recommended reading textbooks prior to cohort kickoff.',
    },
    {
      rating: 4,
      feedbackType: 'INSTRUCTOR',
      sentiment: 'POSITIVE',
      comments: 'Engaging lectures and thorough code reviews on our flight software assignment.',
      strengths: 'Patient and thorough answers to complex flight dynamics questions.',
      improvements: 'Extend the Q&A session by 15 minutes at the end of each module.',
    },
    {
      rating: 2,
      feedbackType: 'OVERALL',
      sentiment: 'NEGATIVE',
      comments: 'The schedule was too compressed over the final weekend, making it hard to prepare for both the project and evaluation.',
      strengths: 'Good subject matter.',
      improvements: 'Spread out the final project presentations over two separate days.',
    },
  ];

  let sampleIdx = 0;
  for (const cohort of cohorts) {
    if (!cohort.program) continue;
    const cohortStudents = students.slice(0, 4);
    for (const student of cohortStudents) {
      const sample = feedbackSamples[sampleIdx % feedbackSamples.length];
      sampleIdx++;

      await Feedback.create({
        student: student._id,
        program: cohort.program._id,
        cohort: cohort._id,
        division: cohort.division || cohort.program.division,
        rating: sample.rating,
        feedbackType: sample.feedbackType,
        sentiment: sample.sentiment,
        comments: sample.comments,
        strengths: sample.strengths,
        improvements: sample.improvements,
        submittedAt: new Date(Date.now() - Math.floor(Math.random() * 15 * 86400000)),
      });
    }
  }
}

module.exports = {
  listFeedbackAdmin,
  getFeedbackSummaryAdmin,
  submitStudentFeedback,
  seedFeedbackIfEmpty,
};
