const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');

// Roles a person may self-select at public registration.
// Strictly limited to STUDENT. Instructor and administrative roles must be
// provisioned by an administrator.
const SELF_REGISTERABLE_ROLES = [ROLES.STUDENT];

function validateRegisterInput(body) {
  const { fullName, email, password, role, division } = body;
  const errors = [];

  if (!fullName || fullName.trim().length < 2) errors.push('fullName is required (min 2 characters)');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('A valid email is required');
  if (!password || password.length < 8) errors.push('password must be at least 8 characters');
  if (role && role !== ROLES.STUDENT) {
    errors.push('Public self-registration is strictly permitted for students only. Instructors and administrators must be provisioned by an administrator.');
  }
  if (division && !Object.values(DIVISIONS).includes(division)) {
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
