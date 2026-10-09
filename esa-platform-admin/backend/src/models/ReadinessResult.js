const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

const criterionEvaluationSchema = new mongoose.Schema(
  {
    criterion: { type: String, required: true, trim: true },
    met: { type: Boolean, required: true },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const readinessResultSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
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
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    criteriaEvaluated: {
      type: [criterionEvaluationSchema],
      default: [],
      required: true,
    },
    outcome: {
      type: String,
      enum: ['ELIGIBLE', 'FOUNDATION_RECOMMENDED', 'MANUAL_REVIEW'],
      required: true,
      index: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    recommendedProgram: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    recommendationReason: {
      type: String,
      trim: true,
      default: '',
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    evaluatorRole: {
      type: String,
      default: 'SUPER_ADMIN',
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

readinessResultSchema.index({ application: 1, evaluatedAt: -1 });
readinessResultSchema.index({ student: 1, evaluatedAt: -1 });
readinessResultSchema.index({ division: 1, evaluatedAt: -1 });

module.exports = mongoose.model('ReadinessResult', readinessResultSchema);
