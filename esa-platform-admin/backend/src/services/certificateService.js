const crypto = require('crypto');
const Certificate = require('../models/Certificate');
const Evaluation = require('../models/Evaluation');
const Cohort = require('../models/Cohort');
const Course = require('../models/Course');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { generateCertificatePdfBuffer } = require('../utils/pdfGenerator');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');
const { CERTIFICATE_STATUS, EVALUATION_OUTCOME } = require('../constants/statuses');
const { notifyUser, wrapEmailHtml } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');



/**
 * Generate human-readable, unique serial number.
 * Example: CERT-PRE-2026-000001
 *
 * @param {string} division
 * @returns {Promise<string>}
 */
async function generateUniqueSerialNumber(division) {
  const divCode = division === DIVISIONS.PRE_UNIVERSITY ? 'PRE' : 'UNI';
  const year = new Date().getFullYear();
  const count = await Certificate.countDocuments({ division });
  let seq = count + 1;

  while (true) {
    const candidate = `CERT-${divCode}-${year}-${String(seq).padStart(6, '0')}`;
    const exists = await Certificate.findOne({ serialNumber: candidate });
    if (!exists) {
      return candidate;
    }
    seq++;
  }
}

/**
 * Asserts admin user is authorized to manage certificates in the target division.
 */
function assertCertificateAdminAccess(division, user) {
  if (user.role === ROLES.SUPER_ADMIN) return;
  const userDiv = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
  if (userDiv !== division) {
    throw ApiError.forbidden(
      `Cross-division access denied: You cannot manage certificates for ${division}`
    );
  }
}

/**
 * Issue a Certificate for a qualifying PASS Evaluation.
 *
 * @param {Object} params
 * @param {string} params.evaluationId
 * @param {Object} params.user
 * @returns {Promise<Object>}
 */
async function issueCertificate({ evaluationId, user }) {
  const evaluation = await Evaluation.findById(evaluationId)
    .populate('cohort')
    .populate('student', 'fullName email phone studentProfile')
    .populate('program', 'title division level price deliveryMode');

  if (!evaluation) {
    throw ApiError.notFound('Evaluation record not found');
  }

  // 1. Division isolation check
  assertCertificateAdminAccess(evaluation.division, user);

  // 2. Business Rule: Only PASS evaluations qualify for certificate issuance.
  if (evaluation.outcome !== EVALUATION_OUTCOME.PASS) {
    throw ApiError.badRequest(
      `Only PASS evaluations qualify for certificate issuance. Current outcome is ${evaluation.outcome}.`
    );
  }

  // 3. Business Rule: Only the LATEST Evaluation per student/cohort is eligible
  const latestEval = await Evaluation.findOne({
    cohort: evaluation.cohort?._id || evaluation.cohort,
    student: evaluation.student?._id || evaluation.student,
  }).sort({ evaluatedAt: -1, createdAt: -1 });

  if (latestEval && String(latestEval._id) !== String(evaluation._id)) {
    throw ApiError.badRequest(
      'Certificate can only be issued for the latest evaluation record of a student in a cohort'
    );
  }

  // 4. Business Rule: One certificate per qualifying evaluation (prevent duplicate issuance)
  const existingCert = await Certificate.findOne({ evaluation: evaluation._id });
  if (existingCert) {
    throw ApiError.conflict(
      `A certificate has already been issued for this evaluation (Serial: ${existingCert.serialNumber}, Status: ${existingCert.status})`
    );
  }

  // Also check if certificate exists for same student + cohort
  const existingStudentCohortCert = await Certificate.findOne({
    student: evaluation.student._id || evaluation.student,
    cohort: evaluation.cohort._id || evaluation.cohort,
    status: CERTIFICATE_STATUS.ISSUED,
  });
  if (existingStudentCohortCert) {
    throw ApiError.conflict(
      `An active certificate has already been issued to this student for cohort (Serial: ${existingStudentCohortCert.serialNumber})`
    );
  }

  // 5. Generate unique serial number & unguessable verification token
  const serialNumber = await generateUniqueSerialNumber(evaluation.division);
  const verificationToken = crypto.randomBytes(16).toString('hex');

  const certificate = await Certificate.create({
    student: evaluation.student._id || evaluation.student,
    cohort: evaluation.cohort._id || evaluation.cohort,
    program: evaluation.program._id || evaluation.program,
    evaluation: evaluation._id,
    division: evaluation.division,
    serialNumber,
    issuedAt: new Date(),
    issuedBy: user._id,
    status: CERTIFICATE_STATUS.ISSUED,
    verificationToken,
  });

  // 6. Record Audit Log
  await recordAudit({
    user: user._id,
    action: 'CERTIFICATE_ISSUED',
    resource: 'Certificate',
    resourceId: certificate._id,
    division: certificate.division,
    after: {
      certificateId: certificate._id,
      serialNumber: certificate.serialNumber,
      studentId: evaluation.student._id || evaluation.student,
      cohortId: evaluation.cohort._id || evaluation.cohort,
      programId: evaluation.program._id || evaluation.program,
      evaluationId: evaluation._id,
      verificationToken: certificate.verificationToken,
      issuedAt: certificate.issuedAt,
    },
    reason: `Certificate ${certificate.serialNumber} issued for ${evaluation.student?.fullName || 'student'} (${evaluation.division}) by ${user.fullName}`,
  });

  const populated = await Certificate.findById(certificate._id)
    .populate('student', 'fullName email phone studentProfile')
    .populate('cohort', 'cohortNumber name startDate endDate')
    .populate('program', 'title division level deliveryMode')
    .populate('evaluation')
    .populate('issuedBy', 'fullName email role');

  // Phase 14: Notify student of certificate issuance with verification link (failure-safe, non-blocking)
  try {
    const studentName = populated.student?.fullName || 'Student';
    const studentEmail = populated.student?.email;
    const programTitle = populated.program?.title || 'Training Program';
    const clientBase = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const verificationUrl = `${clientBase}/verify/${certificate.verificationToken}`;

    await notifyUser({
      recipientId: populated.student?._id || certificate.student,
      type: NOTIFICATION_TYPE.CERTIFICATE_ISSUED,
      title: `Certificate Issued - Serial #${certificate.serialNumber}`,
      message: `Congratulations! Your certificate of completion for "${programTitle}" has been issued (Serial #${certificate.serialNumber}).`,
      relatedResource: {
        resourceType: 'Certificate',
        resourceId: certificate._id,
      },
      division: certificate.division,
      email: {
        to: studentEmail,
        studentName,
        subject: `Certificate of Completion Issued: ${certificate.serialNumber} - ${programTitle}`,
        text: `Dear ${studentName},\n\nCongratulations! Your official Certificate of Completion for "${programTitle}" has been issued.\n\nSerial Number: ${certificate.serialNumber}\nVerification Link: ${verificationUrl}\n\nEgyptian Space Agency Academy`,
        html: wrapEmailHtml({
          title: 'Certificate of Completion Issued',
          contentHtml: `
            <p>Dear <strong>${studentName}</strong>,</p>
            <p>Congratulations! Your official Certificate of Completion has been successfully generated and issued.</p>
            <div class="card" style="border-left-color: #3b82f6;">
              <p style="margin: 0;"><strong>Program:</strong> ${programTitle}</p>
              <p style="margin: 4px 0;"><strong>Serial Number:</strong> <span style="font-family: monospace; color: #60a5fa;">${certificate.serialNumber}</span></p>
              <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #4ade80;">Active / Issued</span></p>
            </div>
            <p>Anyone can verify the authenticity of your credential using the official verification link below:</p>
          `,
          actionUrl: verificationUrl,
          actionText: 'Verify Certificate Online',
        }),
      },
    });
  } catch (certNotifErr) {
    console.error('[CertificateIssued:NotifyError]', certNotifErr.message);
  }

  return populated;

}

/**
 * List certificates with division scoping and filters.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function listCertificates({
  user,
  division = null,
  status = null,
  program = null,
  student = null,
  search = null,
  page = 1,
  limit = 20,
}) {
  const query = {};

  // Enforce division scoping
  if (user.role === ROLES.SUPER_ADMIN) {
    if (division && division.toLowerCase() !== 'all') {
      query.division = division;
    }
  } else {
    query.division = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
  }

  if (status && Object.values(CERTIFICATE_STATUS).includes(status)) {
    query.status = status;
  }

  if (program) {
    query.program = program;
  }

  if (student) {
    query.student = student;
  }

  if (search && search.trim()) {
    const term = search.trim();
    const matchingStudents = await User.find({
      $or: [
        { fullName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id');

    query.$or = [
      { serialNumber: { $regex: term, $options: 'i' } },
      { verificationToken: { $regex: term, $options: 'i' } },
      { student: { $in: matchingStudents.map((s) => s._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [certificates, total] = await Promise.all([
    Certificate.find(query)
      .populate('student', 'fullName email phone')
      .populate('cohort', 'cohortNumber name startDate endDate')
      .populate('program', 'title division level price')
      .populate('evaluation', 'attendanceRate averageScore outcome outcomeReason')
      .populate('issuedBy', 'fullName email role')
      .populate('revokedBy', 'fullName email role')
      .sort({ issuedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Certificate.countDocuments(query),
  ]);

  return {
    certificates,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

/**
 * Get Certificate by ID (scoped).
 */
async function getCertificateById({ certificateId, user }) {
  const certificate = await Certificate.findById(certificateId)
    .populate('student', 'fullName email phone studentProfile')
    .populate('cohort', 'cohortNumber name startDate endDate sessions')
    .populate('program', 'title division level price deliveryMode description')
    .populate('evaluation')
    .populate('issuedBy', 'fullName email role')
    .populate('revokedBy', 'fullName email role');

  if (!certificate) {
    throw ApiError.notFound('Certificate not found');
  }

  assertCertificateAdminAccess(certificate.division, user);

  return certificate;
}

/**
 * Revoke Certificate permanently.
 * Body: { reason }
 */
async function revokeCertificate({ certificateId, user, reason }) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('Revocation reason is required');
  }

  const certificate = await Certificate.findById(certificateId)
    .populate('student', 'fullName email')
    .populate('cohort', 'cohortNumber')
    .populate('program', 'title');

  if (!certificate) {
    throw ApiError.notFound('Certificate not found');
  }

  assertCertificateAdminAccess(certificate.division, user);

  if (certificate.status === CERTIFICATE_STATUS.REVOKED) {
    throw ApiError.badRequest(
      `Certificate ${certificate.serialNumber} has already been revoked on ${new Date(certificate.revokedAt).toISOString()}`
    );
  }

  // Update certificate status (never delete)
  const prevStatus = certificate.status;
  certificate.status = CERTIFICATE_STATUS.REVOKED;
  certificate.revokedAt = new Date();
  certificate.revokedBy = user._id;
  certificate.revocationReason = reason.trim();

  // Preserve in revocationHistory
  if (!certificate.revocationHistory) {
    certificate.revocationHistory = [];
  }
  certificate.revocationHistory.push({
    revokedAt: certificate.revokedAt,
    revokedBy: user._id,
    reason: certificate.revocationReason,
  });

  await certificate.save();

  // Audit Log: CERTIFICATE_REVOKED
  await recordAudit({
    user: user._id,
    action: 'CERTIFICATE_REVOKED',
    resource: 'Certificate',
    resourceId: certificate._id,
    division: certificate.division,
    before: { status: prevStatus },
    after: {
      status: CERTIFICATE_STATUS.REVOKED,
      revokedAt: certificate.revokedAt,
      revokedBy: certificate.revokedBy,
      revocationReason: certificate.revocationReason,
      revocationHistoryLength: certificate.revocationHistory.length,
    },
    reason: `Certificate ${certificate.serialNumber} revoked by ${user.fullName}: ${certificate.revocationReason}`,
  });

  const updated = await Certificate.findById(certificateId)
    .populate('student', 'fullName email phone studentProfile')
    .populate('cohort', 'cohortNumber name')
    .populate('program', 'title division')
    .populate('issuedBy', 'fullName email role')
    .populate('revokedBy', 'fullName email role');

  // Phase 14: Notify student of certificate revocation (failure-safe, non-blocking)
  try {
    const studentName = updated.student?.fullName || 'Student';
    const studentEmail = updated.student?.email;
    const programTitle = updated.program?.title || 'Training Program';

    await notifyUser({
      recipientId: updated.student?._id || certificate.student,
      type: NOTIFICATION_TYPE.CERTIFICATE_REVOKED,
      title: `Certificate Revoked - Serial #${certificate.serialNumber}`,
      message: `Official Notice: Certificate #${certificate.serialNumber} for "${programTitle}" has been revoked. Reason: ${certificate.revocationReason}`,
      relatedResource: {
        resourceType: 'Certificate',
        resourceId: certificate._id,
      },
      division: certificate.division,
      email: {
        to: studentEmail,
        studentName,
        subject: `Certificate Revocation Notice: ${certificate.serialNumber} - ${programTitle}`,
        text: `Dear ${studentName},\n\nPlease be advised that Certificate #${certificate.serialNumber} for "${programTitle}" has been revoked by academy administration.\n\nReason: ${certificate.revocationReason}\n\nEgyptian Space Agency Academy`,
        html: wrapEmailHtml({
          title: 'Certificate Revocation Notice',
          contentHtml: `
            <p>Dear <strong>${studentName}</strong>,</p>
            <p>Please be advised that the following credential has been revoked by academy administration:</p>
            <div class="card" style="border-left-color: #ef4444;">
              <p style="margin: 0; color: #f87171;"><strong>Status:</strong> REVOKED</p>
              <p style="margin: 4px 0;"><strong>Program:</strong> ${programTitle}</p>
              <p style="margin: 4px 0;"><strong>Serial Number:</strong> <span style="font-family: monospace;">${certificate.serialNumber}</span></p>
              <p style="margin: 6px 0 0; color: #94a3b8;"><strong>Reason:</strong> ${certificate.revocationReason}</p>
            </div>
            <p>This certificate is no longer valid for official verification.</p>
          `,
        }),
      },
    });
  } catch (revokeNotifErr) {
    console.error('[CertificateRevoked:NotifyError]', revokeNotifErr.message);
  }

  return updated;
}

/**
 * Restore a mistakenly revoked Certificate.
 * Lifecycle: REVOKED -> RESTORED
 * Preserves revocation history, marks restoredAt/By/Reason, audits CERTIFICATE_RESTORED.
 *
 * @param {Object} params
 * @param {string} params.certificateId
 * @param {Object} params.user
 * @param {string} params.reason
 * @returns {Promise<Object>}
 */
async function restoreCertificate({ certificateId, user, reason }) {
  const certificate = await Certificate.findById(certificateId)
    .populate('student', 'fullName email')
    .populate('cohort', 'cohortNumber')
    .populate('program', 'title');

  if (!certificate) {
    throw ApiError.notFound('Certificate not found');
  }

  assertCertificateAdminAccess(certificate.division, user);

  if (certificate.status !== CERTIFICATE_STATUS.REVOKED) {
    throw ApiError.badRequest(
      `Only REVOKED certificates can be restored. Current status is ${certificate.status}.`
    );
  }

  const prevStatus = certificate.status;
  const restoreReason = (reason && reason.trim()) ? reason.trim() : 'Revocation corrected by administration';

  certificate.status = CERTIFICATE_STATUS.RESTORED;
  certificate.restoredAt = new Date();
  certificate.restoredBy = user._id;
  certificate.restoreReason = restoreReason;

  // Update revocation history with resolution
  if (!certificate.revocationHistory) {
    certificate.revocationHistory = [];
  }
  if (certificate.revocationHistory.length > 0) {
    const lastEntry = certificate.revocationHistory[certificate.revocationHistory.length - 1];
    lastEntry.restoredAt = certificate.restoredAt;
    lastEntry.restoredBy = user._id;
    lastEntry.restoreReason = restoreReason;
  }

  await certificate.save();

  // Audit Log: CERTIFICATE_RESTORED
  await recordAudit({
    user: user._id,
    action: 'CERTIFICATE_RESTORED',
    resource: 'Certificate',
    resourceId: certificate._id,
    division: certificate.division,
    before: {
      status: prevStatus,
      revokedAt: certificate.revokedAt,
      revocationReason: certificate.revocationReason,
    },
    after: {
      status: CERTIFICATE_STATUS.RESTORED,
      restoredAt: certificate.restoredAt,
      restoredBy: certificate.restoredBy,
      restoreReason: certificate.restoreReason,
      revocationHistoryLength: certificate.revocationHistory.length,
    },
    reason: `Certificate ${certificate.serialNumber} restored by ${user.fullName}: ${restoreReason}`,
  });

  const updated = await Certificate.findById(certificateId)
    .populate('student', 'fullName email phone studentProfile')
    .populate('cohort', 'cohortNumber name')
    .populate('program', 'title division')
    .populate('issuedBy', 'fullName email role')
    .populate('revokedBy', 'fullName email role')
    .populate('restoredBy', 'fullName email role');

  // Notify student of certificate restoration (non-blocking)
  try {
    const studentName = updated.student?.fullName || 'Student';
    const studentEmail = updated.student?.email;
    const programTitle = updated.program?.title || 'Training Program';

    await notifyUser({
      recipientId: updated.student?._id || certificate.student,
      type: NOTIFICATION_TYPE.CERTIFICATE_ISSUED,
      title: `Certificate Restored - Serial #${certificate.serialNumber}`,
      message: `Notice: Certificate #${certificate.serialNumber} for "${programTitle}" has been reinstated to valid status.`,
      relatedResource: {
        resourceType: 'Certificate',
        resourceId: certificate._id,
      },
      division: certificate.division,
      email: {
        to: studentEmail,
        studentName,
        subject: `Certificate Restored: ${certificate.serialNumber} - ${programTitle}`,
        text: `Dear ${studentName},\n\nYour certificate #${certificate.serialNumber} for "${programTitle}" has been officially restored and is valid.\n\nEgyptian Space Agency Academy`,
      },
    });
  } catch (notifErr) {
    console.error('[CertificateRestored:NotifyError]', notifErr.message);
  }

  return updated;
}

/**
 * Update certificate permitted non-security metadata.
 * Prohibits changing serialNumber, verificationToken, student, cohort, program, evaluation, division.
 *
 * @param {Object} params
 * @param {string} params.certificateId
 * @param {Object} params.user
 * @param {Object} params.data
 * @returns {Promise<Object>}
 */
async function updateCertificateMetadata({ certificateId, user, data = {} }) {
  const certificate = await Certificate.findById(certificateId);
  if (!certificate) {
    throw ApiError.notFound('Certificate not found');
  }

  assertCertificateAdminAccess(certificate.division, user);

  // Guard against tampering with immutable security credentials
  const forbiddenKeys = ['serialNumber', 'verificationToken', 'student', 'cohort', 'program', 'evaluation', 'division', 'issuedAt', 'issuedBy', 'status'];
  for (const key of forbiddenKeys) {
    if (data[key] !== undefined) {
      delete data[key];
    }
  }

  const beforeNotes = certificate.notes;
  if (data.notes !== undefined) {
    certificate.notes = String(data.notes || '').trim();
  }

  await certificate.save();

  // Audit Log: CERTIFICATE_UPDATED
  await recordAudit({
    user: user._id,
    action: 'CERTIFICATE_UPDATED',
    resource: 'Certificate',
    resourceId: certificate._id,
    division: certificate.division,
    before: { notes: beforeNotes },
    after: { notes: certificate.notes },
    reason: `Certificate ${certificate.serialNumber} metadata updated by ${user.fullName}`,
  });

  return Certificate.findById(certificateId)
    .populate('student', 'fullName email phone studentProfile')
    .populate('cohort', 'cohortNumber name')
    .populate('program', 'title division')
    .populate('issuedBy', 'fullName email role')
    .populate('revokedBy', 'fullName email role')
    .populate('restoredBy', 'fullName email role');
}

/**
 * Public unauthenticated certificate verification lookup.
 * Returns only non-sensitive verification info.
 * Valid if ISSUED or RESTORED.
 *
 * @param {string} tokenOrSerial
 * @returns {Promise<Object>}
 */
async function verifyCertificatePublic(tokenOrSerial) {
  if (!tokenOrSerial || !tokenOrSerial.trim()) {
    throw ApiError.badRequest('Verification token or serial number is required');
  }

  const clean = tokenOrSerial.trim();

  // Lookup by verificationToken OR serialNumber
  const certificate = await Certificate.findOne({
    $or: [{ verificationToken: clean }, { serialNumber: clean.toUpperCase() }],
  })
    .populate('student', 'fullName')
    .populate('program', 'title level')
    .populate('cohort', 'cohortNumber');

  if (!certificate) {
    return {
      found: false,
      isValid: false,
      message: 'No certificate found matching the provided verification identifier.',
    };
  }

  const isValid = certificate.status === CERTIFICATE_STATUS.ISSUED || certificate.status === CERTIFICATE_STATUS.RESTORED;

  return {
    found: true,
    isValid,
    status: certificate.status,
    serialNumber: certificate.serialNumber,
    verificationToken: certificate.verificationToken,
    studentName: certificate.student?.fullName || 'Verified ESA Student',
    program: {
      title: certificate.program?.title || 'ESA Academy Program',
      level: certificate.program?.level,
      division: certificate.division,
    },
    division: certificate.division,
    cohortNumber: certificate.cohort?.cohortNumber,
    issuedAt: certificate.issuedAt,
    revokedAt: certificate.revokedAt || null,
    revocationReason: certificate.status === CERTIFICATE_STATUS.REVOKED ? certificate.revocationReason : null,
    restoredAt: certificate.status === CERTIFICATE_STATUS.RESTORED ? certificate.restoredAt : null,
    restoreReason: certificate.status === CERTIFICATE_STATUS.RESTORED ? certificate.restoreReason : null,
    revocationHistory: (certificate.revocationHistory && certificate.revocationHistory.length > 0)
      ? certificate.revocationHistory.map((h) => ({
          revokedAt: h.revokedAt,
          reason: h.reason,
          restoredAt: h.restoredAt || null,
          restoreReason: h.restoreReason || null,
        }))
      : [],
  };
}

/**
 * Student's own certificates list.
 */
async function getStudentCertificates(studentId) {
  const certificates = await Certificate.find({ student: studentId })
    .populate('program', 'title division level price deliveryMode')
    .populate('cohort', 'cohortNumber name startDate endDate')
    .populate('evaluation', 'attendanceRate averageScore outcome outcomeReason')
    .populate('issuedBy', 'fullName')
    .sort({ issuedAt: -1, createdAt: -1 });

  return certificates;
}

/**
 * Generate PDF buffer for an authorized caller.
 */
async function getCertificatePdfBuffer({ certificateId, user, isStudent = false }) {
  const certificate = await Certificate.findById(certificateId)
    .populate('student', 'fullName email phone')
    .populate('cohort', 'cohortNumber name startDate endDate')
    .populate('program', 'title division level price')
    .populate('evaluation')
    .populate('issuedBy', 'fullName');

  if (!certificate) {
    throw ApiError.notFound('Certificate not found');
  }

  if (isStudent) {
    if (String(certificate.student._id || certificate.student) !== String(user._id)) {
      throw ApiError.forbidden('You are not authorized to download this certificate');
    }
  } else {
    assertCertificateAdminAccess(certificate.division, user);
  }

  return generateCertificatePdfBuffer(certificate);
}

/**
 * Retrieve evaluations eligible for certificate issuance in the scoped division.
 * Follows exact Phase 13 eligibility rules:
 * - Outcome is PASS
 * - Scoped to user's division (or requested division for Super Admin)
 * - Is latest evaluation for student/cohort
 * - Has no active certificate issued yet
 */
async function getEligibleEvaluations({ user, division = null, search = null, limit = 50 }) {
  let targetDivision = division;
  if (user.role !== ROLES.SUPER_ADMIN) {
    targetDivision = user.division || (user.role && require('../constants/divisions').ROLE_TO_DIVISION[user.role]);
  }

  const evalQuery = { outcome: EVALUATION_OUTCOME.PASS };
  if (targetDivision && targetDivision.toLowerCase() !== 'all') {
    evalQuery.division = targetDivision;
  }

  const evaluations = await Evaluation.find(evalQuery)
    .populate('student', 'fullName email phone studentProfile')
    .populate('program', 'title division level price deliveryMode')
    .populate('cohort', 'cohortNumber name startDate endDate status')
    .sort({ evaluatedAt: -1, createdAt: -1 });

  // Fetch all existing active certificates
  const certQuery = { status: CERTIFICATE_STATUS.ISSUED };
  if (targetDivision && targetDivision.toLowerCase() !== 'all') {
    certQuery.division = targetDivision;
  }
  const activeCerts = await Certificate.find(certQuery).select('evaluation student cohort');

  const issuedEvalIds = new Set(activeCerts.map((c) => String(c.evaluation)));
  const issuedStudentCohortKeys = new Set(
    activeCerts.map((c) => `${String(c.student)}_${String(c.cohort)}`)
  );

  // Group by student + cohort to ensure only the latest evaluation is considered
  const latestMap = new Map();
  for (const ev of evaluations) {
    if (!ev.student || !ev.cohort || !ev.program) continue;
    const key = `${String(ev.student._id || ev.student)}_${String(ev.cohort._id || ev.cohort)}`;
    if (!latestMap.has(key)) {
      latestMap.set(key, ev);
    }
  }

  // Check feedback completion status for all eligible student-cohort pairs
  const candidateCohortIds = Array.from(latestMap.values()).map((ev) => ev.cohort?._id || ev.cohort);
  const candidateStudentIds = Array.from(latestMap.values()).map((ev) => ev.student?._id || ev.student);

  const existingFeedbacks = await Feedback.find({
    student: { $in: candidateStudentIds },
    cohort: { $in: candidateCohortIds },
  }).select('student cohort submittedAt');

  const feedbackMap = new Map();
  existingFeedbacks.forEach((f) => {
    feedbackMap.set(`${String(f.student)}_${String(f.cohort)}`, f.submittedAt);
  });

  const eligible = [];
  for (const [key, ev] of latestMap.entries()) {
    if (issuedEvalIds.has(String(ev._id))) continue;
    if (issuedStudentCohortKeys.has(key)) continue;

    if (search) {
      const q = search.trim().toLowerCase();
      const sName = ev.student?.fullName?.toLowerCase() || '';
      const sEmail = ev.student?.email?.toLowerCase() || '';
      const pTitle = ev.program?.title?.toLowerCase() || '';
      const cNum = ev.cohort?.cohortNumber?.toLowerCase() || '';
      if (!sName.includes(q) && !sEmail.includes(q) && !pTitle.includes(q) && !cNum.includes(q)) {
        continue;
      }
    }

    const hasFeedback = feedbackMap.has(key);

    eligible.push({
      _id: ev._id,
      evaluationId: ev._id,
      student: ev.student,
      program: ev.program,
      cohort: ev.cohort,
      outcome: ev.outcome,
      attendanceRate: ev.attendanceRate,
      averageScore: ev.averageScore,
      evaluatedAt: ev.evaluatedAt,
      division: ev.division,
      feedbackCompleted: hasFeedback,
      feedbackSubmittedAt: hasFeedback ? feedbackMap.get(key) : null,
    });

    if (eligible.length >= limit) break;
  }

  return eligible;
}

module.exports = {
  issueCertificate,
  listCertificates,
  getCertificateById,
  revokeCertificate,
  restoreCertificate,
  updateCertificateMetadata,
  verifyCertificatePublic,
  getStudentCertificates,
  getCertificatePdfBuffer,
  getEligibleEvaluations,
};
