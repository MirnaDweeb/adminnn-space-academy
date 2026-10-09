const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

const answerRecordSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    questionText: { type: String, default: '' },
    selectedAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
    isCorrect: { type: Boolean, required: true },
    pointsAwarded: { type: Number, required: true, default: 0 },
    maxPoints: { type: Number, required: true, default: 1 },
  },
  { _id: false }
);

const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProgramAssessment',
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
      index: true,
    },
    answers: {
      type: [answerRecordSchema],
      default: [],
    },
    totalPoints: {
      type: Number,
      required: true,
      default: 0,
    },
    maxPoints: {
      type: Number,
      required: true,
      default: 0,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    completionTimeMinutes: {
      type: Number,
      default: 1,
    },
    result: {
      type: String,
      enum: ['RECOMMENDED', 'FOUNDATION_RECOMMENDED', 'MANUAL_REVIEW', 'NOT_RECOMMENDED'],
      required: true,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ student: 1, program: 1 });
assessmentAttemptSchema.index({ assessment: 1, submittedAt: -1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
