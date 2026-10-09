const bcrypt = require('bcrypt');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const User = require('../models/User');
const AdminScope = require('../models/AdminScope');
const AuditLog = require('../models/AuditLog');
const { recordAudit } = require('../services/auditService');
const { ROLES } = require('../constants/roles');
const { ALL_DIVISIONS } = require('../constants/divisions');
const {
  validateCreateAdminInput,
  validateUpdateAdminStatusInput,
  ALLOWED_ADMIN_ROLES,
} = require('../validators/adminValidators');
const { ALL_PERMISSIONS, PERMISSION_GROUPS } = require('../constants/permissions');

const SALT_ROUNDS = 12;

// POST /api/admin/administrators (SUPER_ADMIN only)
const createAdministrator = asyncHandler(async (req, res) => {
  validateCreateAdminInput(req.body);
  const { email, password, role, division, permissions } = req.body;
  const fullName = (req.body.fullName || req.body.name).trim();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const assignedPermissions = Array.isArray(permissions) && permissions.length > 0
    ? permissions.filter((p) => ALL_PERMISSIONS.includes(p))
    : ALL_PERMISSIONS;

  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    role,
    division,
    permissions: assignedPermissions,
    createdBy: req.user._id,
    isActive: true,
  });

  await AdminScope.create({
    user: user._id,
    division,
    grantedBy: req.user._id,
    grantedAt: new Date(),
  });

  await recordAudit({
    user: req.user,
    action: 'ADMIN_CREATED',
    resource: 'User',
    resourceId: user._id,
    division: user.division,
    after: user.toSafeObject(),
    reason: `Provisioned by Super Admin ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 201, { administrator: user.toSafeObject() });
});

// GET /api/admin/administrators (SUPER_ADMIN only)
const listAdministrators = asyncHandler(async (req, res) => {
  const { division, role, isActive, search = '', page = 1, limit = 20 } = req.query;

  const filter = {
    role: { $in: [ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN] },
  };

  if (role && ALLOWED_ADMIN_ROLES.includes(role)) {
    filter.role = role;
  }

  if (division && ALL_DIVISIONS.includes(division)) {
    filter.division = division;
  }

  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  if (search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [{ fullName: searchRegex }, { email: searchRegex }];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const administrators = users.map((u) => u.toSafeObject());

  sendSuccess(
    res,
    200,
    { administrators },
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    }
  );
});

// GET /api/admin/administrators/:id (SUPER_ADMIN only)
const getAdministratorById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('createdBy', 'fullName email');

  if (!user || ![ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN].includes(user.role)) {
    throw ApiError.notFound('Administrator not found');
  }

  const auditLogs = await AuditLog.find({ resource: 'User', resourceId: user._id })
    .sort({ timestamp: -1 })
    .limit(20);

  sendSuccess(res, 200, {
    administrator: user.toSafeObject(),
    auditLogs,
  });
});

// PATCH /api/admin/administrators/:id/status (SUPER_ADMIN only)
const updateAdministratorStatus = asyncHandler(async (req, res) => {
  validateUpdateAdminStatusInput(req.body);
  const { isActive } = req.body;

  const user = await User.findById(req.params.id);
  if (!user || ![ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN].includes(user.role)) {
    throw ApiError.notFound('Administrator not found');
  }

  if (user._id.equals(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own active status');
  }

  if (user.isActive === isActive) {
    return sendSuccess(res, 200, { administrator: user.toSafeObject() });
  }

  const before = { isActive: user.isActive };
  user.isActive = isActive;
  await user.save();

  const action = user.isActive ? 'ADMIN_ACTIVATED' : 'ADMIN_DEACTIVATED';
  await recordAudit({
    user: req.user,
    action,
    resource: 'User',
    resourceId: user._id,
    division: user.division,
    before,
    after: { isActive: user.isActive },
    reason: `Status changed to ${user.isActive ? 'Active' : 'Inactive'} by Super Admin ${req.user.fullName} (${req.user.email})`,
  });

  sendSuccess(res, 200, { administrator: user.toSafeObject() });
});

// PUT /api/admin/administrators/:id (SUPER_ADMIN only)
const updateAdministrator = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user || ![ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN].includes(user.role)) {
    throw ApiError.notFound('Administrator not found');
  }

  // Prevent self-elevation / self-modification of own account
  if (user._id.equals(req.user._id)) {
    throw ApiError.badRequest('You cannot modify your own administrative permissions or scope');
  }

  const { fullName, role, division, permissions, isActive } = req.body;
  const before = user.toSafeObject();

  if (fullName && fullName.trim()) user.fullName = fullName.trim();
  if (role && ALLOWED_ADMIN_ROLES.includes(role)) user.role = role;
  if (division && ALL_DIVISIONS.includes(division)) {
    user.division = division;
    await AdminScope.findOneAndUpdate(
      { user: user._id },
      { division, grantedBy: req.user._id, grantedAt: new Date() },
      { upsert: true }
    );
  }
  if (Array.isArray(permissions)) {
    user.permissions = permissions.filter((p) => ALL_PERMISSIONS.includes(p));
  }
  if (isActive !== undefined) {
    user.isActive = Boolean(isActive);
  }

  await user.save();

  await recordAudit({
    user: req.user,
    action: 'ADMIN_PERMISSIONS_CHANGED',
    resource: 'User',
    resourceId: user._id,
    division: user.division,
    before,
    after: user.toSafeObject(),
    reason: `Administrator details and permissions updated by Super Admin ${req.user.fullName}`,
  });

  sendSuccess(res, 200, { administrator: user.toSafeObject() });
});

// GET /api/admin/administrators/permissions (SUPER_ADMIN only)
const getAvailablePermissions = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, {
    permissions: ALL_PERMISSIONS,
    groups: PERMISSION_GROUPS,
  });
});

module.exports = {
  createAdministrator,
  listAdministrators,
  getAdministratorById,
  updateAdministratorStatus,
  updateAdministrator,
  getAvailablePermissions,
};

