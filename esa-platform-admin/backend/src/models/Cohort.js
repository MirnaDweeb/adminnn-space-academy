const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');
const { COHORT_STATUS } = require('../constants/statuses');

const sessionSchema = new mongoose.Schema(
  {
    sessionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      default: 120,
      min: 15,
    },
    location: {
      type: String,
      trim: true,
      default: 'Main Training Lab / Online Room',
    },
  },
  { _id: true }
);

const cohortSchema = new mongoose.Schema(
  {
    cohortNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
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
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(COHORT_STATUS),
      default: COHORT_STATUS.SCHEDULED,
      index: true,
    },
    capacity: {
      type: Number,
      default: 30,
      min: 1,
    },
    sessions: {
      type: [sessionSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

cohortSchema.index({ division: 1, status: 1, createdAt: -1 });
cohortSchema.index({ instructor: 1, status: 1 });
cohortSchema.index({ program: 1, createdAt: -1 });

module.exports = mongoose.model('Cohort', cohortSchema);
