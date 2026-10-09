const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');
const { CERTIFICATE_STATUS } = require('../constants/statuses');

const certificateSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cohort: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    // The specific PASS Evaluation record this certificate is awarded for
    evaluation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Evaluation',
      required: true,
      unique: true, // 1 certificate per qualifying evaluation
      index: true,
    },
    division: {
      type: String,
      enum: Object.values(DIVISIONS),
      required: true,
      index: true,
    },
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CERTIFICATE_STATUS),
      default: CERTIFICATE_STATUS.ISSUED,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    revocationReason: {
      type: String,
      default: null,
      trim: true,
    },
    restoredAt: {
      type: Date,
      default: null,
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    restoreReason: {
      type: String,
      default: null,
      trim: true,
    },
    revocationHistory: [
      {
        revokedAt: { type: Date },
        revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        revocationReason: { type: String, trim: true },
        restoredAt: { type: Date },
        restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        restoreReason: { type: String, trim: true },
      },
    ],
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    verificationToken: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes
certificateSchema.index({ student: 1, cohort: 1, evaluation: 1 }, { unique: true });
certificateSchema.index({ student: 1, issuedAt: -1 });
certificateSchema.index({ division: 1, issuedAt: -1 });

module.exports = mongoose.model('Certificate', certificateSchema);
