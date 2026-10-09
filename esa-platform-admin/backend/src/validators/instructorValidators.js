const ApiError = require('../utils/ApiError');
const { ALL_DIVISIONS } = require('../constants/divisions');

function validateCreateInstructorInput(body) {
  const { email, password, division } = body;
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
  if (!division || !ALL_DIVISIONS.includes(division)) {
    errors.push(`division must be one of: ${ALL_DIVISIONS.join(', ')}`);
  }

  if (errors.length) {
    throw ApiError.badRequest('Invalid instructor data', errors);
  }
}

function validateUpdateInstructorStatusInput(body) {
  if (typeof body.isActive !== 'boolean') {
    throw ApiError.badRequest('isActive field is required and must be a boolean');
  }
}

module.exports = {
  validateCreateInstructorInput,
  validateUpdateInstructorStatusInput,
};
