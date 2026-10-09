const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');

// Roles a person may self-select at public registration. Admin roles are
// never assignable through this endpoint; they must be provisioned by a
// Super Admin (future phase: an admin-only "create admin" endpoint).
const SELF_REGISTERABLE_ROLES = [ROLES.STUDENT, ROLES.INSTRUCTOR];

function validateRegisterInput(body) {
  const { fullName, email, password, role, division } = body;
  const errors = [];

  if (!fullName || fullName.trim().length < 2) errors.push('fullName is required (min 2 characters)');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('A valid email is required');
  if (!password || password.length < 8) errors.push('password must be at least 8 characters');
  if (role && !SELF_REGISTERABLE_ROLES.includes(role)) {
    errors.push(`role must be one of: ${SELF_REGISTERABLE_ROLES.join(', ')}`);
  }
  if (role === ROLES.STUDENT && division && !Object.values(DIVISIONS).includes(division)) {
    errors.push(`division must be one of: ${Object.values(DIVISIONS).join(', ')}`);
  }

  if (errors.length) {
    throw ApiError.unprocessable('Invalid registration data', errors);
  }
}

function validateLoginInput(body) {
  const { email, password } = body;
  const errors = [];
  if (!email) errors.push('email is required');
  if (!password) errors.push('password is required');
  if (errors.length) throw ApiError.badRequest('Invalid login data', errors);
}

module.exports = { validateRegisterInput, validateLoginInput, SELF_REGISTERABLE_ROLES };
