const mongoose = require('mongoose');
const { DIVISIONS } = require('../constants/divisions');

// The authoritative record of which division an admin account may act on.
// Kept as its own collection (rather than only a field on User) so that
// scope grants/revocations are independently auditable in future phases.
const adminScopeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    division: { type: String, enum: Object.values(DIVISIONS), required: true, index: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    grantedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminScope', adminScopeSchema);
