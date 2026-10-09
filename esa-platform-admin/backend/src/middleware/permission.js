const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');

/**
 * Enforces that the authenticated user possesses a specific permission.
 * - SUPER_ADMIN always passes (full platform authority).
 * - For division admins, if they have an explicit permissions array, they must possess the permission.
 * - If an existing division admin account has an empty array (legacy default), they pass to preserve existing workflows.
 * - If unauthorized, returns 403 Forbidden.
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

    // For division admins with an explicit permission list configured:
    const userPermissions = req.user.permissions;
    if (Array.isArray(userPermissions) && userPermissions.length > 0) {
      if (!userPermissions.includes(permission)) {
        throw ApiError.forbidden(`Forbidden: Missing required permission [${permission}]`);
      }
    }

    next();
  };
}

module.exports = { requirePermission };
