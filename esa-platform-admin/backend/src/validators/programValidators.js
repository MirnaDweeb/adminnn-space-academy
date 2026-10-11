const ApiError = require('../utils/ApiError');
const { DIVISIONS } = require('../constants/divisions');
const { PROGRAM_LEVEL, DELIVERY_MODE, PROGRAM_STATUS } = require('../constants/statuses');

const ALLOWED_STATUS_TRANSITIONS = {
  [PROGRAM_STATUS.DRAFT]: [PROGRAM_STATUS.ACTIVE, PROGRAM_STATUS.PUBLISHED, PROGRAM_STATUS.ARCHIVED],
  [PROGRAM_STATUS.ACTIVE]: [PROGRAM_STATUS.PUBLISHED, PROGRAM_STATUS.ARCHIVED],
  [PROGRAM_STATUS.PUBLISHED]: [PROGRAM_STATUS.ACTIVE, PROGRAM_STATUS.ARCHIVED],
  [PROGRAM_STATUS.ARCHIVED]: [],
};

function validateProgramInput(body, { partial = false } = {}) {
  const { title, division, level, deliveryMode, status, price, capacity } = body;
  const errors = [];

  if (!partial || title !== undefined) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      errors.push('title is required and cannot be empty');
    }
  }

  if (!partial || division !== undefined) {
    if (!division || !Object.values(DIVISIONS).includes(division)) {
      errors.push(`division must be one of: ${Object.values(DIVISIONS).join(', ')}`);
    }
  }

  if (!partial || capacity !== undefined) {
    const numCap = Number(capacity);
    if (capacity === undefined || capacity === null || capacity === '' || !Number.isInteger(numCap) || numCap <= 0) {
      errors.push('capacity must be a positive integer greater than 0');
    }
  }

  if (price !== undefined && price !== null && price !== '') {
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      errors.push('price must be a non-negative number');
    }
  }

  if (level !== undefined && !Object.values(PROGRAM_LEVEL).includes(level)) {
    errors.push(`level must be one of: ${Object.values(PROGRAM_LEVEL).join(', ')}`);
  }

  if (deliveryMode !== undefined && !Object.values(DELIVERY_MODE).includes(deliveryMode)) {
    errors.push(`deliveryMode must be one of: ${Object.values(DELIVERY_MODE).join(', ')}`);
  }

  if (status !== undefined && !Object.values(PROGRAM_STATUS).includes(status)) {
    errors.push(`status must be one of: ${Object.values(PROGRAM_STATUS).join(', ')}`);
  }

  if (errors.length) {
    throw ApiError.badRequest(errors[0], errors);
  }
}

function validateProgramStatusTransition(currentStatus, targetStatus) {
  if (!targetStatus || !Object.values(PROGRAM_STATUS).includes(targetStatus)) {
    throw ApiError.badRequest(`Invalid status. Must be one of: ${Object.values(PROGRAM_STATUS).join(', ')}`);
  }
  if (currentStatus === targetStatus) {
    throw ApiError.badRequest(`Program is already in ${currentStatus} status`);
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw ApiError.badRequest(`Invalid status transition from ${currentStatus} to ${targetStatus}`);
  }
}

module.exports = {
  validateProgramInput,
  validateProgramStatusTransition,
  ALLOWED_STATUS_TRANSITIONS,
};
