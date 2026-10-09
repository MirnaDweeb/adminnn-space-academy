const ApiError = require('../utils/ApiError');

// Role-based authorization. Usage: authorize(ROLES.SUPER_ADMIN, ROLES.PRE_UNIVERSITY_ADMIN)
// Must run after `protect`. This is enforced server-side regardless of what
// the frontend renders or hides.
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden('Your role does not have access to this resource');
    }
    next();
  };
}

module.exports = { authorize };
