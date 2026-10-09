const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../constants/statuses');

const attendanceHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
      default: 'Attendance correction',
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    cohort: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sessionNumber: {
      type: Number,
      required: true,
    },
    sessionDate: {
      type: Date,
      required: true,
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
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
    history: {
      type: [attendanceHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// One attendance record per student per session in a cohort
attendanceSchema.index({ cohort: 1, sessionId: 1, student: 1 }, { unique: true });
attendanceSchema.index({ cohort: 1, student: 1 });
attendanceSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
