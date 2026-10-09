const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

const FEEDBACK_TYPE = Object.freeze({
  OVERALL: 'OVERALL',
  COURSE_CONTENT: 'COURSE_CONTENT',
  INSTRUCTOR: 'INSTRUCTOR',
  FACILITIES: 'FACILITIES',
  PLATFORM: 'PLATFORM',
});

const FEEDBACK_SENTIMENT = Object.freeze({
  POSITIVE: 'POSITIVE',
  NEUTRAL: 'NEUTRAL',
  NEGATIVE: 'NEGATIVE',
});

const feedbackSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    cohort: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true,
      index: true,
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      index: true,
    },
    feedbackType: {
      type: String,
      enum: Object.values(FEEDBACK_TYPE),
      default: FEEDBACK_TYPE.OVERALL,
      index: true,
    },
    sentiment: {
      type: String,
      enum: Object.values(FEEDBACK_SENTIMENT),
      default: FEEDBACK_SENTIMENT.POSITIVE,
      index: true,
    },
    comments: {
      type: String,
      required: true,
      trim: true,
    },
    strengths: {
      type: String,
      trim: true,
      default: '',
    },
    improvements: {
      type: String,
      trim: true,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ division: 1, rating: -1, submittedAt: -1 });
const Feedback = mongoose.model('Feedback', feedbackSchema);
Feedback.FEEDBACK_TYPE = FEEDBACK_TYPE;
Feedback.FEEDBACK_SENTIMENT = FEEDBACK_SENTIMENT;
Feedback.Feedback = Feedback;

module.exports = Feedback;

