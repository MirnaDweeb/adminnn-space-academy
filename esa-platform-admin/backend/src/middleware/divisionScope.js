const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { ROLE_TO_DIVISION, ALL_DIVISIONS } = require('../constants/divisions');

// Resolves the division a request is allowed to operate on and attaches it
// as req.scopeDivision:
//   - SUPER_ADMIN may pass ?division=PRE_UNIVERSITY|UNIVERSITY|all (defaults to "all")
//   - PRE_UNIVERSITY_ADMIN / UNIVERSITY_ADMIN are locked to their own division,
//     regardless of any query param they send.
// Controllers must always filter by req.scopeDivision, never by a raw query
// param, so a division admin cannot widen their own scope by editing the URL.
function resolveDivisionScope(req, res, next) {
  const role = req.user.role;

  if (role === ROLES.SUPER_ADMIN) {
    let requested = req.query.division;

    // Safely unwrap nested division object if query param was serialized as an object
    if (requested && typeof requested === 'object') {
      if (typeof requested.division === 'string') {
        requested = requested.division;
      } else {
        throw ApiError.badRequest('Invalid division filter: division must be a string');
      }
    }

    if (requested !== undefined && requested !== null && typeof requested !== 'string') {
      throw ApiError.badRequest('Invalid division filter: division must be a string');
    }

    const trimmed = typeof requested === 'string' ? requested.trim() : '';
    const isAll = !trimmed || trimmed.toLowerCase() === 'all';
    if (!isAll && !ALL_DIVISIONS.includes(trimmed)) {
      throw ApiError.badRequest('Invalid division filter');
    }
    req.scopeDivision = isAll ? 'all' : trimmed;
    return next();
  }

  const ownDivision = ROLE_TO_DIVISION[role] || req.user.division;
  if (!ownDivision) {
    throw ApiError.forbidden('This account has no assigned division');
  }
  req.scopeDivision = ownDivision;
  next();
}

// Guards a specific :division route param (e.g. /admin/:division/students)
// against a division admin trying to access the other division by URL.
function enforceDivisionParam(paramName = 'division') {
  return (req, res, next) => {
    const role = req.user.role;
    const rawDivision = req.params[paramName];
    const requestedDivision = (rawDivision || '').replace(/-/g, '_').toUpperCase();

    if (!ALL_DIVISIONS.includes(requestedDivision)) {
      throw ApiError.badRequest('Invalid division specified');
    }

    if (role === ROLES.SUPER_ADMIN) {
      req.scopeDivision = requestedDivision;
      return next();
    }

    const ownDivision = ROLE_TO_DIVISION[role];
    if (!ownDivision || requestedDivision !== ownDivision) {
      throw ApiError.forbidden('You cannot access another division\'s data');
    }
    req.scopeDivision = ownDivision;
    next();
  };
}

module.exports = { resolveDivisionScope, enforceDivisionParam };
