const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const Application = require('../models/Application');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const Evaluation = require('../models/Evaluation');
const Certificate = require('../models/Certificate');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { Feedback } = require('../models/Feedback');
const { generateStudentReportPdfBuffer } = require('../utils/studentReportPdfGenerator');
const { recordAudit } = require('../services/auditService');
const { ROLES } = require('../constants/roles');

// GET /api/admin/students
// Division filtering is always driven by req.scopeDivision (set by the
// resolveDivisionScope middleware), never by a raw client-supplied filter,
// so a division admin cannot broaden their own results.
// Query filters: isActive=true|false (or legacy status fallback), search, page, limit.
const listStudents = asyncHandler(async (req, res) => {
  const { search = '', isActive, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (req.scopeDivision !== 'all') {
    filter.division = req.scopeDivision;
  }

  // Parse isActive filter (fixing Issue 2)
  let activeFilter = undefined;
  if (isActive !== undefined && isActive !== '') {
    activeFilter = isActive === 'true' || isActive === true;
  } else if (status !== undefined && status !== '') {
    if (status === 'ACTIVE' || status === 'true') activeFilter = true;
    else if (status === 'INACTIVE' || status === 'false' || status === 'DEACTIVATED') activeFilter = false;
  }

  // If activeFilter or search is specified, resolve matching User IDs
  if (activeFilter !== undefined || search) {
    const userCriteria = { role: ROLES.STUDENT };
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

  const total = await StudentProfile.countDocuments(filter);
  const students = await StudentProfile.find(filter)
    .populate('user', 'fullName email isActive createdAt lastLoginAt role division')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Extend each student with authoritative isActive property
  const studentsWithStatus = students.map((s) => {
    const obj = s.toObject();
    obj.isActive = s.user?.isActive ?? true;
    return obj;
  });

  sendSuccess(res, 200, { students: studentsWithStatus }, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
  });
});

// GET /api/admin/students/:id
const getStudentById = asyncHandler(async (req, res) => {
  let student = await StudentProfile.findById(req.params.id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division'
  );

  // Fallback: in case req.params.id was a User id
  if (!student) {
    student = await StudentProfile.findOne({ user: req.params.id }).populate(
      'user',
      'fullName email isActive createdAt lastLoginAt role division'
    );
  }

  if (!student) throw ApiError.notFound('Student not found');

  if (req.scopeDivision !== 'all' && student.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot access a student outside your division');
  }

  const studentObj = student.toObject();
  studentObj.isActive = student.user?.isActive ?? true;

  sendSuccess(res, 200, { student: studentObj });
});

// PATCH /api/admin/students/:id/status
const updateStudentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive, reason } = req.body;

  if (typeof isActive !== 'boolean') {
    throw ApiError.badRequest('isActive field is required and must be a boolean');
  }

  let student = await StudentProfile.findById(id).populate('user');
  if (!student) {
    student = await StudentProfile.findOne({ user: id }).populate('user');
  }

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  // Division admin can only modify students inside their own division
  if (req.user.role !== ROLES.SUPER_ADMIN && student.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify a student outside your division');
  }

  const user = await User.findById(student.user._id || student.user);
  if (!user) {
    throw ApiError.notFound('Associated user account not found');
  }

  const previousState = user.isActive;
  user.isActive = isActive;
  await user.save();

  // Audit log entry
  await recordAudit({
    user: req.user,
    action: isActive ? 'STUDENT_ACTIVATED' : 'STUDENT_DEACTIVATED',
    resource: 'User',
    resourceId: user._id,
    division: student.division,
    before: { isActive: previousState },
    after: { isActive },
    reason:
      reason ||
      `Student status changed to ${isActive ? 'Active' : 'Inactive'} by ${req.user.role} ${req.user.fullName} (${req.user.email})`,
  });

  const updatedStudent = await StudentProfile.findById(student._id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division'
  );
  const studentObj = updatedStudent.toObject();
  studentObj.isActive = updatedStudent.user?.isActive ?? isActive;

  sendSuccess(res, 200, { student: studentObj });
});

// PUT /api/admin/students/:id
const updateStudentAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  // Disallow forbidden security/administrative manipulations
  const forbiddenKeys = ['password', 'passwordHash', 'role', 'permissions', 'jwt', 'isAdmin', 'isSuperAdmin'];
  for (const key of forbiddenKeys) {
    if (body[key] !== undefined) {
      throw ApiError.badRequest(`Security violation: Cannot modify "${key}" through student profile editing.`);
    }
  }

  let student = await StudentProfile.findById(id).populate('user');
  if (!student) {
    student = await StudentProfile.findOne({ user: id }).populate('user');
  }

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  // Division access control
  if (req.user.role !== ROLES.SUPER_ADMIN && student.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot modify a student outside your division');
  }

  const user = await User.findById(student.user._id || student.user);
  if (!user) {
    throw ApiError.notFound('Associated user account not found');
  }

  const beforeUser = { fullName: user.fullName, email: user.email };
  const beforeProfile = {
    phone: student.phone,
    institution: student.institution,
    educationLevel: student.educationLevel,
    major: student.major,
    academicYear: student.academicYear,
    gpa: student.gpa,
    skills: student.skills,
    notes: student.notes,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    dateOfBirth: student.dateOfBirth,
    nationalId: student.nationalId,
  };

  // Update User fields if provided
  if (body.fullName && body.fullName.trim()) {
    user.fullName = body.fullName.trim();
  }
  if (body.email && body.email.trim() && body.email.trim().toLowerCase() !== user.email) {
    const newEmail = body.email.trim().toLowerCase();
    const existing = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
    if (existing) {
      throw ApiError.conflict(`Email "${newEmail}" is already in use by another user account.`);
    }
    user.email = newEmail;
  }
  await user.save();

  // Update StudentProfile fields if provided
  if (body.phone !== undefined) student.phone = String(body.phone).trim();
  if (body.institution !== undefined) student.institution = String(body.institution).trim();
  if (body.educationLevel !== undefined) student.educationLevel = String(body.educationLevel).trim();
  if (body.major !== undefined) student.major = String(body.major).trim();
  if (body.academicYear !== undefined) student.academicYear = String(body.academicYear).trim();
  if (body.gpa !== undefined) student.gpa = body.gpa === '' || body.gpa === null ? null : Number(body.gpa);
  if (body.skills !== undefined) {
    student.skills = Array.isArray(body.skills)
      ? body.skills
      : String(body.skills)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  }
  if (body.notes !== undefined) student.notes = String(body.notes).trim();
  if (body.guardianName !== undefined) student.guardianName = String(body.guardianName).trim();
  if (body.guardianPhone !== undefined) student.guardianPhone = String(body.guardianPhone).trim();
  if (body.dateOfBirth !== undefined) student.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
  if (body.nationalId !== undefined) student.nationalId = String(body.nationalId).trim();

  await student.save();

  const afterUser = { fullName: user.fullName, email: user.email };
  const afterProfile = {
    phone: student.phone,
    institution: student.institution,
    educationLevel: student.educationLevel,
    major: student.major,
    academicYear: student.academicYear,
    gpa: student.gpa,
    skills: student.skills,
    notes: student.notes,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    dateOfBirth: student.dateOfBirth,
    nationalId: student.nationalId,
  };

  await recordAudit({
    user: req.user,
    action: 'STUDENT_UPDATED',
    resource: 'StudentProfile',
    resourceId: student._id,
    division: student.division,
    before: { user: beforeUser, profile: beforeProfile },
    after: { user: afterUser, profile: afterProfile },
    reason: body.reason || `Student profile updated by ${req.user.fullName} (${req.user.role})`,
  });

  const updatedStudent = await StudentProfile.findById(student._id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division'
  );
  const studentObj = updatedStudent.toObject();
  studentObj.isActive = updatedStudent.user?.isActive ?? true;

  sendSuccess(res, 200, { student: studentObj, message: 'Student profile updated successfully' });
});

// GET /api/admin/students/:id/overview
const getStudentOverviewAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let student = await StudentProfile.findById(id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division'
  );
  if (!student) {
    student = await StudentProfile.findOne({ user: id }).populate(
      'user',
      'fullName email isActive createdAt lastLoginAt role division'
    );
  }

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && student.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot access student dossier outside your division');
  }

  const userId = student.user?._id || student.user;

  // Concurrently fetch all student historical records across collections
  const [
    applications,
    enrollments,
    invoices,
    evaluations,
    certificates,
    attendanceSessions,
    feedbackRecords,
    notifications,
  ] = await Promise.all([
    Application.find({ student: userId })
      .populate('program', 'title division level price deliveryMode')
      .sort({ createdAt: -1 }),
    Enrollment.find({ student: userId })
      .populate('program', 'title division level price')
      .populate('cohort', 'cohortNumber name startDate endDate status')
      .sort({ createdAt: -1 }),
    Invoice.find({ student: userId })
      .populate('program', 'title division price')
      .sort({ createdAt: -1 }),
    Evaluation.find({ student: userId })
      .populate('program', 'title division level')
      .populate('cohort', 'cohortNumber name')
      .populate('evaluatedBy', 'fullName email role')
      .sort({ evaluatedAt: -1 }),
    Certificate.find({ student: userId })
      .populate('program', 'title division level')
      .populate('cohort', 'cohortNumber name')
      .populate('issuedBy', 'fullName email role')
      .populate('revokedBy', 'fullName email role')
      .populate('restoredBy', 'fullName email role')
      .sort({ issuedAt: -1 }),
    Attendance.find({ 'records.student': userId })
      .populate('cohort', 'cohortNumber name startDate endDate')
      .sort({ sessionDate: -1 })
      .limit(30),
    Feedback.find({ student: userId })
      .populate('program', 'title division')
      .populate('cohort', 'cohortNumber name')
      .sort({ submittedAt: -1 }),
    Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(20),
  ]);

  // Fetch transactions linked to student's invoices
  const invoiceIds = invoices.map((inv) => inv._id);
  const transactions = await PaymentTransaction.find({ invoice: { $in: invoiceIds } })
    .sort({ recordedAt: -1 })
    .populate('recordedBy', 'fullName email');

  // Format attendance records specifically for this student
  const studentAttendance = attendanceSessions.map((sess) => {
    const rec = sess.records?.find((r) => String(r.student) === String(userId));
    return {
      _id: sess._id,
      cohort: sess.cohort,
      sessionDate: sess.sessionDate,
      topic: sess.topic,
      sessionNumber: sess.sessionNumber,
      status: rec ? rec.status : 'ABSENT',
      notes: rec?.notes || '',
    };
  });

  const studentObj = student.toObject();
  studentObj.isActive = student.user?.isActive ?? true;

  sendSuccess(res, 200, {
    student: studentObj,
    applications,
    enrollments,
    invoices,
    transactions,
    evaluations,
    certificates,
    attendance: studentAttendance,
    feedback: feedbackRecords,
    notifications,
  });
});

// GET /api/admin/students/:id/report-pdf
const getStudentReportPdfAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let student = await StudentProfile.findById(id).populate(
    'user',
    'fullName email isActive createdAt lastLoginAt role division'
  );
  if (!student) {
    student = await StudentProfile.findOne({ user: id }).populate(
      'user',
      'fullName email isActive createdAt lastLoginAt role division'
    );
  }

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  if (req.user.role !== ROLES.SUPER_ADMIN && student.division !== req.scopeDivision) {
    throw ApiError.forbidden('You cannot export student report outside your division');
  }

  const userId = student.user?._id || student.user;

  const [applications, enrollments, invoices, evaluations, certificates, feedbackRecords] =
    await Promise.all([
      Application.find({ student: userId }).populate('program', 'title division level price').sort({ createdAt: -1 }),
      Enrollment.find({ student: userId })
        .populate('program', 'title division level')
        .populate('cohort', 'cohortNumber name startDate endDate status')
        .sort({ createdAt: -1 }),
      Invoice.find({ student: userId }).populate('program', 'title division price').sort({ createdAt: -1 }),
      Evaluation.find({ student: userId })
        .populate('program', 'title division')
        .populate('cohort', 'cohortNumber name')
        .sort({ evaluatedAt: -1 }),
      Certificate.find({ student: userId })
        .populate('program', 'title division')
        .populate('cohort', 'cohortNumber')
        .sort({ issuedAt: -1 }),
      Feedback.find({ student: userId }).populate('program', 'title').sort({ submittedAt: -1 }),
    ]);

  const pdfBuffer = await generateStudentReportPdfBuffer({
    student,
    applications,
    enrollments,
    invoices,
    evaluations,
    certificates,
    feedback: feedbackRecords,
  });

  await recordAudit({
    user: req.user,
    action: 'REPORT_EXPORTED',
    resource: 'StudentProfile',
    resourceId: student._id,
    division: student.division,
    reason: `Official Student Dossier PDF exported for ${student.user?.fullName} by ${req.user.fullName}`,
  });

  const cleanName = (student.user?.fullName || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `ESA_Student_Dossier_${cleanName}_${Date.now()}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(pdfBuffer);
});

module.exports = {
  listStudents,
  getStudentById,
  updateStudentStatus,
  updateStudentAdmin,
  getStudentOverviewAdmin,
  getStudentReportPdfAdmin,
};
