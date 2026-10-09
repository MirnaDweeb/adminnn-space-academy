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
    const requested = req.query.division;
    const isAll = !requested || requested.toLowerCase() === 'all';
    if (!isAll && !ALL_DIVISIONS.includes(requested)) {
      throw ApiError.badRequest('Invalid division filter');
    }
    req.scopeDivision = isAll ? 'all' : requested;
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
    const requestedDivision = req.params[paramName];

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
