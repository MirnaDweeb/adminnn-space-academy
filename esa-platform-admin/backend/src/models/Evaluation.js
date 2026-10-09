const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');
const { EVALUATION_OUTCOME } = require('../constants/evaluations');

const evaluationSchema = new mongoose.Schema(
  {
    cohort: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      index: true,
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
    attendanceRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    averageScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    attendanceThresholdMet: {
      type: Boolean,
      required: true,
    },
    outcome: {
      type: String,
      enum: Object.values(EVALUATION_OUTCOME),
      required: true,
      index: true,
    },
    outcomeReason: {
      type: String,
      trim: true,
      default: '',
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes: cohort + student (append-only history order), division, and student
evaluationSchema.index({ cohort: 1, student: 1, evaluatedAt: -1 });
evaluationSchema.index({ division: 1, evaluatedAt: -1 });
evaluationSchema.index({ student: 1, evaluatedAt: -1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);
