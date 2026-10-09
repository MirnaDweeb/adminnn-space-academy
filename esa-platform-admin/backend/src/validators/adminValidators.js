const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { ROLE_TO_DIVISION } = require('../constants/divisions');

const ALLOWED_ADMIN_ROLES = [ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN];

function validateCreateAdminInput(body) {
  const { email, password, role, division } = body;
  const fullName = body.fullName || body.name;
  const errors = [];

  if (!fullName || fullName.trim().length < 2) {
    errors.push('fullName is required (min 2 characters)');
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('A valid email is required');
  }
  if (!password || password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (role === ROLES.SUPER_ADMIN) {
    throw ApiError.badRequest('SUPER_ADMIN accounts cannot be created through this endpoint');
  }

  if (!role || !ALLOWED_ADMIN_ROLES.includes(role)) {
    errors.push(`role must be one of: ${ALLOWED_ADMIN_ROLES.join(', ')}`);
  }

  if (role && ALLOWED_ADMIN_ROLES.includes(role)) {
    const expectedDivision = ROLE_TO_DIVISION[role];
    if (!division || division !== expectedDivision) {
      throw ApiError.badRequest(`Division does not match administrator role: ${role} must have division ${expectedDivision}`);
    }
  }

  if (errors.length) {
    throw ApiError.badRequest('Invalid administrator data', errors);
  }
}

function validateUpdateAdminStatusInput(body) {
  if (typeof body.isActive !== 'boolean') {
    throw ApiError.badRequest('isActive field is required and must be a boolean');
  }
}

module.exports = {
  validateCreateAdminInput,
  validateUpdateAdminStatusInput,
  ALLOWED_ADMIN_ROLES,
};
