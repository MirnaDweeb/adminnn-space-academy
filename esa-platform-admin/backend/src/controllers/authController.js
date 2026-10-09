const bcrypt = require('bcrypt');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const generateToken = require('../utils/generateToken');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const InstructorProfile = require('../models/InstructorProfile');
const { validateRegisterInput, validateLoginInput } = require('../validators/authValidators');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');
const { recordAudit } = require('../services/auditService');

const SALT_ROUNDS = 12;

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  validateRegisterInput(req.body);
  const { fullName, email, password, role, division } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const finalRole = role || ROLES.STUDENT;

  const userDivision = (finalRole === ROLES.STUDENT || finalRole === ROLES.INSTRUCTOR)
    ? division || DIVISIONS.PRE_UNIVERSITY
    : null;

  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    role: finalRole,
    division: userDivision,
  });

  if (finalRole === ROLES.STUDENT) {
    await StudentProfile.create({ user: user._id, division: user.division });
  } else if (finalRole === ROLES.INSTRUCTOR) {
    await InstructorProfile.create({
      user: user._id,
      division: user.division,
      divisions: [user.division],
    });
  }

  await recordAudit({ user: user._id, action: 'USER_REGISTER', resource: 'User', resourceId: user._id, after: user.toSafeObject() });

  const token = generateToken(user);
  sendSuccess(res, 201, { user: user.toSafeObject(), token });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  validateLoginInput(req.body);
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken(user);
  sendSuccess(res, 200, { user: user.toSafeObject(), token });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, { user: req.user.toSafeObject() });
});

module.exports = { register, login, getMe };
