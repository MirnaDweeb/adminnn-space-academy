const bcrypt = require('bcrypt');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const User = require('../models/User');
const InstructorProfile = require('../models/InstructorProfile');
const AuditLog = require('../models/AuditLog');
const { recordAudit } = require('../services/auditService');
const { ROLES } = require('../constants/roles');
const {
  validateCreateInstructorInput,
  validateUpdateInstructorStatusInput,
} = require('../validators/instructorValidators');

const SALT_ROUNDS = 12;

function formatInstructor(profile, user) {
  const profObj = profile.toObject ? profile.toObject() : profile;
  const userObj = user?.toSafeObject ? user.toSafeObject() : (user?.toObject ? user.toObject() : user);

  return {
    ...profObj,
    id: profObj._id,
    user: userObj,
    isActive: userObj?.isActive ?? true,
  };
}

// POST /api/admin/instructors
const createInstructor = asyncHandler(async (req, res) => {
  validateCreateInstructorInput(req.body);

  const { email, password, division, title, specialization, bio, phone } = req.body;
  const fullName = req.body.fullName || req.body.name;

  // Division admin can only provision within their own division
  if (req.user.role !== ROLES.SUPER_ADMIN && division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot provision an instructor outside your division');
  }

  // Check duplicate email
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw ApiError.conflict('An account with this email address already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: ROLES.INSTRUCTOR,
    division,
    isActive: true,
    createdBy: req.user._id,
  });

  const profile = await InstructorProfile.create({
    user: user._id,
    division,
    divisions: [division],
    title: title?.trim() || 'Instructor',
    specialization: specialization?.trim() || '',
    bio: bio?.trim() || '',
    phone: phone?.trim() || '',
  });

  await recordAudit({
    user: req.user,
    action: 'INSTRUCTOR_CREATED',
    resource: 'User',
    resourceId: user._id,
    division,
    after: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      division: user.division,
      isActive: user.isActive,
      profileId: profile._id,
      title: profile.title,
      specialization: profile.specialization,
      createdAt: user.createdAt,
      createdBy: req.user._id,
    },
    reason: `Instructor provisioned by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  const formatted = formatInstructor(profile, user);
  sendSuccess(res, 201, { instructor: formatted });
});

// GET /api/admin/instructors
const listInstructors = asyncHandler(async (req, res) => {
  const { search = '', isActive, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (req.scopeDivision !== 'all') {
    filter.division = req.scopeDivision;
  }

  let activeFilter = undefined;
  if (isActive !== undefined && isActive !== '') {
    activeFilter = isActive === 'true' || isActive === true;
  } else if (status !== undefined && status !== '') {
    if (status === 'ACTIVE' || status === 'true') activeFilter = true;
    else if (status === 'INACTIVE' || status === 'false' || status === 'DEACTIVATED') activeFilter = false;
  }

  if (activeFilter !== undefined || search) {
    const userCriteria = { role: ROLES.INSTRUCTOR };
    if (activeFilter !== undefined) {
      userCriteria.isActive = activeFilter;
    }
    if (search) {
      userCriteria.$or = [
        { fullName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }

    const matchingUsers = await User.find(userCriteria).select('_id');
    filter.user = { $in: matchingUsers.map((u) => u._id) };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const total = await InstructorProfile.countDocuments(filter);
  const profiles = await InstructorProfile.find(filter)
    .populate('user', 'fullName email isActive createdAt lastLoginAt role division createdBy')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const instructors = profiles.map((p) => formatInstructor(p, p.user));

  sendSuccess(res, 200, { instructors }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
  });
});

// GET /api/admin/instructors/:id
const getInstructorById = asyncHandler(async (req, res) => {
  let profile = await InstructorProfile.findById(req.params.id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division createdBy'
  );

  if (!profile) {
    profile = await InstructorProfile.findOne({ user: req.params.id }).populate(
      'user',
      'fullName email isActive createdAt lastLoginAt role division createdBy'
    );
  }

  if (!profile) {
    throw ApiError.notFound('Instructor not found');
  }

  if (req.scopeDivision !== 'all' && profile.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot access an instructor outside your division');
  }

  const userId = profile.user?._id || profile.user;
  const auditLogs = await AuditLog.find({
    $or: [
      { resourceId: userId },
      { resourceId: profile._id },
    ],
  })
    .populate('user', 'fullName email role')
    .sort({ timestamp: -1 })
    .limit(50);

  const formatted = formatInstructor(profile, profile.user);

  sendSuccess(res, 200, {
    instructor: formatted,
    auditLogs: auditLogs.map((l) => ({
      id: l._id,
      action: l.action,
      actor: l.user ? { fullName: l.user.fullName, email: l.user.email, role: l.user.role } : null,
      division: l.division,
      before: l.before,
      after: l.after,
      reason: l.reason,
      timestamp: l.timestamp,
    })),
  });
});

// PATCH /api/admin/instructors/:id/status
const updateInstructorStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateUpdateInstructorStatusInput(req.body);
  const { isActive, reason } = req.body;

  let profile = await InstructorProfile.findById(id).populate('user');
  if (!profile) {
    profile = await InstructorProfile.findOne({ user: id }).populate('user');
  }

  if (!profile) {
    throw ApiError.notFound('Instructor not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && profile.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify an instructor outside your division');
  }

  const user = await User.findById(profile.user._id || profile.user);
  if (!user) {
    throw ApiError.notFound('Associated user account not found');
  }

  const previousState = user.isActive;
  user.isActive = isActive;
  await user.save();

  await recordAudit({
    user: req.user,
    action: isActive ? 'INSTRUCTOR_ACTIVATED' : 'INSTRUCTOR_DEACTIVATED',
    resource: 'User',
    resourceId: user._id,
    division: profile.division,
    before: { isActive: previousState },
    after: { isActive },
    reason:
      reason ||
      `Instructor status changed to ${isActive ? 'Active' : 'Inactive'} by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  const updatedProfile = await InstructorProfile.findById(profile._id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division createdBy'
  );

  const formatted = formatInstructor(updatedProfile, updatedProfile.user);
  sendSuccess(res, 200, { instructor: formatted });
});

const {
  syncInstructorAccess,
  syncAllInstructorsAccess,
  evaluateInstructorAccess,
} = require('../services/instructorAccessService');

// POST /api/admin/instructors/:id/sync-access
const syncInstructorAccessController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let user = await User.findById(id);
  if (!user) {
    const prof = await InstructorProfile.findById(id);
    if (prof) user = await User.findById(prof.user);
  }
  if (!user) throw ApiError.notFound('Instructor not found');

  if (req.user.role !== ROLES.SUPER_ADMIN && user.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot sync an instructor outside your division');
  }

  const result = await syncInstructorAccess(user._id, req.user);
  sendSuccess(res, 200, { result });
});

// POST /api/admin/instructors/sync-access
const syncAllInstructorsAccessController = asyncHandler(async (req, res) => {
  const results = await syncAllInstructorsAccess(req.user);
  sendSuccess(res, 200, { results, count: results.length });
});

// PUT /api/admin/instructors/:id
const updateInstructorAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fullName, name, title, specialization, phone, bio, division } = req.body;

  let profile = await InstructorProfile.findById(id).populate('user');
  if (!profile) {
    profile = await InstructorProfile.findOne({ user: id }).populate('user');
  }

  if (!profile) {
    throw ApiError.notFound('Instructor not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && profile.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify an instructor outside your division');
  }

  const user = await User.findById(profile.user._id || profile.user);
  if (!user) {
    throw ApiError.notFound('Associated user account not found');
  }

  const updatedName = (fullName || name || user.fullName).trim();
  user.fullName = updatedName;
  if (req.user.role === ROLES.SUPER_ADMIN && division) {
    user.division = division;
    profile.division = division;
  }
  await user.save();

  if (title !== undefined) profile.title = title.trim();
  if (specialization !== undefined) profile.specialization = specialization.trim();
  if (phone !== undefined) profile.phone = phone.trim();
  if (bio !== undefined) profile.bio = bio.trim();

  await profile.save();

  await recordAudit({
    user: req.user,
    action: 'INSTRUCTOR_UPDATED',
    resource: 'User',
    resourceId: user._id,
    division: profile.division,
    after: {
      fullName: user.fullName,
      title: profile.title,
      specialization: profile.specialization,
      phone: profile.phone,
    },
    reason: `Instructor profile updated by ${req.user.role} ${req.user.fullName}`,
  });

  const updatedProfile = await InstructorProfile.findById(profile._id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division createdBy'
  );

  const formatted = formatInstructor(updatedProfile, updatedProfile.user);
  sendSuccess(res, 200, { instructor: formatted });
});

module.exports = {
  createInstructor,
  listInstructors,
  getInstructorById,
  updateInstructorStatus,
  updateInstructorAdmin,
  syncInstructorAccessController,
  syncAllInstructorsAccessController,
};
