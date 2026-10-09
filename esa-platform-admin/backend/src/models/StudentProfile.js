const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

// Extends a User(role=STUDENT) with academy-specific fields.
// Kept separate from User so the auth model stays lean and future
// student-only fields (readiness scores, guardians, etc.) don't bloat it.
const studentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    division: { type: String, enum: Object.values(DIVISIONS), required: true, index: true },
    phone: { type: String, trim: true },
    dateOfBirth: { type: Date },
    nationalId: { type: String, trim: true },
    guardianName: { type: String, trim: true },
    guardianPhone: { type: String, trim: true },
    institution: { type: String, trim: true }, // school or university name
    educationLevel: { type: String, trim: true, default: '' },
    major: { type: String, trim: true, default: '' },
    skills: { type: [String], default: [] },
    academicYear: { type: String, trim: true, default: '' },
    gpa: { type: Number, default: null },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

studentProfileSchema.index({ division: 1, createdAt: -1 });

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
