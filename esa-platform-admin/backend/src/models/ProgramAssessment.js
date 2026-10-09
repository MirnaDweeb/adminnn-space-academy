const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    questionType: {
      type: String,
      enum: ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'TRUE_FALSE', 'RATING'],
      default: 'SINGLE_CHOICE',
      required: true,
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    weight: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: true }
);

const programAssessmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: 'Please answer all questions before submitting.',
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    questions: {
      type: [questionSchema],
      default: [],
      required: true,
    },
    thresholds: {
      recommended: { type: Number, default: 80, min: 0, max: 100 },
      foundation: { type: Number, default: 60, min: 0, max: 100 },
      manualReview: { type: Number, default: 40, min: 0, max: 100 },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    timeLimitMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 180,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

programAssessmentSchema.index({ program: 1, isActive: 1 });
programAssessmentSchema.index({ division: 1, createdAt: -1 });

module.exports = mongoose.model('ProgramAssessment', programAssessmentSchema);
