const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { getDivisionStats } = require('../services/statsService');
const { DIVISIONS } = require('../constants/divisions');

// GET /api/admin/gateway
// Powers the Super Admin Administration Gateway (/admin) with two cards.
// All numbers are derived live from the database; an empty database
// legitimately returns zeros rather than placeholder data.
const getGatewayOverview = asyncHandler(async (req, res) => {
  const [preUniversity, university] = await Promise.all([
    getDivisionStats(DIVISIONS.PRE_UNIVERSITY),
    getDivisionStats(DIVISIONS.UNIVERSITY),
  ]);

  sendSuccess(res, 200, {
    divisions: [
      { key: DIVISIONS.PRE_UNIVERSITY, name: 'Pre-University Administration', ...preUniversity },
      { key: DIVISIONS.UNIVERSITY, name: 'University Administration', ...university },
    ],
  });
});

// GET /api/admin/:division/overview
// Powers the individual division dashboard header stats.
const getDivisionOverview = asyncHandler(async (req, res) => {
  const stats = await getDivisionStats(req.scopeDivision);
  sendSuccess(res, 200, { division: req.scopeDivision, ...stats });
});

module.exports = { getGatewayOverview, getDivisionOverview };
