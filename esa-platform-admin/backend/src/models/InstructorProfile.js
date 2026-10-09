const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

const instructorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    division: { type: String, enum: Object.values(DIVISIONS), required: true, index: true },
    divisions: [{ type: String, enum: Object.values(DIVISIONS) }],
    specialization: { type: String, trim: true },
    title: { type: String, trim: true },
    bio: { type: String, trim: true },
    phone: { type: String, trim: true },
    accessExpiresAt: { type: Date },
  },
  { timestamps: true }
);

instructorProfileSchema.index({ division: 1, createdAt: -1 });

module.exports = mongoose.model('InstructorProfile', instructorProfileSchema);
