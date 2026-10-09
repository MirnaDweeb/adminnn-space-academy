const mongoose = require('mongoose');

// Append-only. No update/delete routes are ever exposed for this model —
// see services/auditService.js, which is the only writer.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "PROGRAM_CREATE"
    resource: { type: String, required: true }, // e.g. "Course"
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    division: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ division: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ resource: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
