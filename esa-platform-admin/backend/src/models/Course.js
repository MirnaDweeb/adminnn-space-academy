const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');
const { PROGRAM_STATUS, PROGRAM_LEVEL, DELIVERY_MODE } = require('../constants/statuses');

// "Course" is the training-program entity (named Course in code per the
// foundation spec; exposed to the frontend as "Program").
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    division: { type: String, enum: Object.values(DIVISIONS), required: true, index: true },
    level: { type: String, enum: Object.values(PROGRAM_LEVEL), default: PROGRAM_LEVEL.BEGINNER },
    targetAudience: { type: String, trim: true, default: '' },
    price: { type: Number, default: 0, min: 0 },
    capacity: { type: Number, required: true, min: 1 },
    occupiedSeats: { type: Number, default: 0, min: 0 },
    deliveryMode: { type: String, enum: Object.values(DELIVERY_MODE), default: DELIVERY_MODE.ONSITE },
    status: { type: String, enum: Object.values(PROGRAM_STATUS), default: PROGRAM_STATUS.DRAFT, index: true },
    prerequisites: { type: [String], default: [] },
    requiredEducation: { type: String, trim: true, default: '' },
    targetMajors: { type: [String], default: [] },
    category: { type: String, trim: true, default: '' },
    transportationOption: { type: String, trim: true, default: 'NONE' },
    registrationStartDate: { type: Date },
    registrationEndDate: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    reopeningDate: { type: Date },
    assignedInstructors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

courseSchema.index({ division: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);
