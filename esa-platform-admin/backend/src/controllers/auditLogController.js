const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');

// GET /api/admin/audit-logs (queryable, paginated audit logs)
const listAuditLogsForAdmin = asyncHandler(async (req, res) => {
  const {
    action,
    resource,
    actor,
    search = '',
    dateFrom,
    dateTo,
    division,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};

  // 1. Division Isolation Enforcement
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    if (division && division !== 'all' && division !== req.scopeDivision) {
      throw ApiError.forbidden("You cannot access another division's audit logs");
    }
    filter.division = req.scopeDivision;
  } else if (division && division !== 'all') {
    filter.division = division;
  }

  // 2. Action Filter
  if (action && action.trim()) {
    filter.action = action.trim();
  }

  // 3. Resource Filter
  if (resource && resource.trim()) {
    filter.resource = resource.trim();
  }

  // 4. Date Range Filters (with validation)
  if (dateFrom || dateTo) {
    filter.timestamp = {};

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (isNaN(fromDate.getTime())) {
        throw ApiError.badRequest('Invalid dateFrom format. Use YYYY-MM-DD or valid ISO date');
      }
      filter.timestamp.$gte = fromDate;
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      if (isNaN(toDate.getTime())) {
        throw ApiError.badRequest('Invalid dateTo format. Use YYYY-MM-DD or valid ISO date');
      }
      // If given a date string like YYYY-MM-DD, set to end of that day (23:59:59.999Z)
      if (typeof dateTo === 'string' && dateTo.length <= 10) {
        toDate.setUTCHours(23, 59, 59, 999);
      }
      filter.timestamp.$lte = toDate;
    }
  }

  // 5. Actor Filter (User search by name or email)
  if (actor && actor.trim()) {
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: actor.trim(), $options: 'i' } },
        { email: { $regex: actor.trim(), $options: 'i' } },
      ],
    }).select('_id');
    const userIds = matchingUsers.map((u) => u._id);
    filter.user = { $in: userIds };
  }

  // 6. Free text search across reason, action, resource, or actor
  if (search && search.trim()) {
    const term = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id');
    const userIds = matchingUsers.map((u) => u._id);

    filter.$or = [
      { reason: { $regex: term, $options: 'i' } },
      { action: { $regex: term, $options: 'i' } },
      { resource: { $regex: term, $options: 'i' } },
      { user: { $in: userIds } },
    ];
  }

  // 7. Pagination
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await AuditLog.countDocuments(filter);
  const auditLogs = await AuditLog.find(filter)
    .populate('user', 'fullName email role division')
    .sort({ timestamp: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  sendSuccess(
    res,
    200,
    { auditLogs },
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    }
  );
});

// GET /api/admin/audit-logs/filters (returns distinct available actions and resources for filter dropdowns)
const getAuditLogFilterOptions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    filter.division = req.scopeDivision;
  }

  const actions = await AuditLog.distinct('action', filter);
  const resources = await AuditLog.distinct('resource', filter);

  actions.sort();
  resources.sort();

  sendSuccess(res, 200, { actions, resources });
});

// GET /api/admin/audit-logs/:id (single record detail with full before/after payload)
const getAuditLogByIdForAdmin = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw ApiError.notFound('Audit log record not found');
  }

  const auditLog = await AuditLog.findById(req.params.id).populate(
    'user',
    'fullName email role division'
  );

  if (!auditLog) {
    throw ApiError.notFound('Audit log record not found');
  }

  // Division Isolation Enforcement
  if (req.user.role !== ROLES.SUPER_ADMIN && req.scopeDivision && req.scopeDivision !== 'all') {
    if (auditLog.division && auditLog.division !== req.scopeDivision) {
      throw ApiError.forbidden("You cannot access an audit log outside your division");
    }
  }

  sendSuccess(res, 200, { auditLog });
});

module.exports = {
  listAuditLogsForAdmin,
  getAuditLogByIdForAdmin,
  getAuditLogFilterOptions,
};
