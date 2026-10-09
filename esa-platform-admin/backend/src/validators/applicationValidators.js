const ApiError = require('../utils/ApiError');
const { APPLICATION_STATUS } = require('../constants/statuses');

const VALID_DECISIONS = ['ACCEPT', 'REJECT', 'WAITLIST', 'REQUEST_INFO'];

const DECISION_TO_STATUS = {
  ACCEPT: APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
  REJECT: APPLICATION_STATUS.CANCELLED,
  WAITLIST: APPLICATION_STATUS.WAITLISTED,
  REQUEST_INFO: APPLICATION_STATUS.NEEDS_INFORMATION,
};

const TERMINAL_OR_DECIDED_STATUSES = [
  APPLICATION_STATUS.CONFIRMED,
  APPLICATION_STATUS.CANCELLED,
  APPLICATION_STATUS.COMPLETED,
  APPLICATION_STATUS.NO_SHOW,
  APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
];

function validateApplicationDecision(currentStatus, decision) {
  if (!decision || !VALID_DECISIONS.includes(decision)) {
    throw ApiError.badRequest(
      `Invalid decision value. Must be one of: ${VALID_DECISIONS.join(', ')}`
    );
  }

  if (TERMINAL_OR_DECIDED_STATUSES.includes(currentStatus)) {
    throw ApiError.badRequest(
      `Cannot make a decision on an application in status ${currentStatus}`
    );
  }

  return DECISION_TO_STATUS[decision];
}

function validateReadinessEvaluation(currentStatus, { override = false } = {}) {
  const isTerminalOrDecided =
    TERMINAL_OR_DECIDED_STATUSES.includes(currentStatus) ||
    currentStatus === APPLICATION_STATUS.WAITLISTED;

  if (isTerminalOrDecided && !override) {
    throw ApiError.badRequest(
      `Cannot evaluate readiness: application has already reached a finalized admission decision (${currentStatus})`
    );
  }

  return true;
}

module.exports = {
  VALID_DECISIONS,
  DECISION_TO_STATUS,
  TERMINAL_OR_DECIDED_STATUSES,
  validateApplicationDecision,
  validateReadinessEvaluation,
};

