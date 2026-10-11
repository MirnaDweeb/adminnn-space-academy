const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');

/**
 * Enforces that the authenticated user possesses a specific permission.
 * - SUPER_ADMIN always passes (full platform authority).
 * - For all other roles, user must have an array of permissions containing the required permission.
 * - Missing, null, or empty permissions FAIL CLOSED (returns 403 Forbidden).
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }

    // SUPER_ADMIN has full authority across the entire platform
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    // Fail-closed enforcement: user must have an explicit permissions array containing the permission
    const userPermissions = req.user.permissions;
    if (!Array.isArray(userPermissions) || !userPermissions.includes(permission)) {
      throw ApiError.forbidden(`Forbidden: Missing required permission [${permission}]`);
    }

    next();
  };
}

module.exports = { requirePermission };
