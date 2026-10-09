const AuditLog = require('../models/AuditLog');

// Single write path for audit records. Controllers call this instead of
// writing to AuditLog directly, so future phases (e.g. streaming audit
// events to an external log) only need to change this one function.
async function recordAudit({ user, action, resource, resourceId = null, division = null, before = null, after = null, reason = '' }) {
  try {
    await AuditLog.create({
      user: user._id || user,
      action,
      resource,
      resourceId,
      division,
      before,
      after,
      reason,
      timestamp: new Date(),
    });
  } catch (err) {
    // Auditing must never break the primary request flow.
    console.error('[audit] failed to record audit log:', err.message);
  }
}

module.exports = { recordAudit };
