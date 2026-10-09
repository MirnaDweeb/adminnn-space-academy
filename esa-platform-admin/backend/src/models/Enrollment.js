const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');
const { ENROLLMENT_STATUS } = require('../constants/statuses');

// Enrollment represents the operational outcome of an accepted application.
// Manages reserved seats, confirmed spots, waitlist queues, and cancellations.
const enrollmentSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
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
      index: true,
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ENROLLMENT_STATUS),
      default: ENROLLMENT_STATUS.PENDING_PAYMENT,
      index: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: '',
    },
    cohort: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Program + status index for capacity calculation and waitlist FIFO queue
enrollmentSchema.index({ program: 1, status: 1, createdAt: 1 });
enrollmentSchema.index({ division: 1, status: 1, createdAt: -1 });
enrollmentSchema.index({ student: 1, createdAt: -1 });
enrollmentSchema.index({ cohort: 1, status: 1 });

// Duplicate protection: at most ONE active enrollment per application
enrollmentSchema.index(
  { application: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          ENROLLMENT_STATUS.PENDING_PAYMENT,
          ENROLLMENT_STATUS.CONFIRMED,
          ENROLLMENT_STATUS.WAITLISTED,
          ENROLLMENT_STATUS.ACTIVE,
        ],
      },
    },
  }
);

module.exports = mongoose.model('Enrollment', enrollmentSchema);
