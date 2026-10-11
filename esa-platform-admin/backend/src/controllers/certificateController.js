const certificateService = require('../services/certificateService');
const Notification = require('../models/Notification');

/**
 * POST /api/admin/evaluations/:id/certificate
 */
async function issueCertificateAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const certificate = await certificateService.issueCertificate({
      evaluationId: id,
      user: req.user,
    });
    res.status(201).json({
      success: true,
      message: `Certificate ${certificate.serialNumber} issued successfully`,
      data: { certificate },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/certificates
 */
async function listCertificatesAdmin(req, res, next) {
  try {
    const { division, status, program, student, search, page, limit } = req.query;
    const activeDivision = req.division || division;
    const result = await certificateService.listCertificates({
      user: req.user,
      division: activeDivision,
      status,
      program,
      student,
      search,
      page,
      limit,
    });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/certificates/eligible
 */
async function getEligibleCertificatesAdmin(req, res, next) {
  try {
    const { search, limit } = req.query;
    const activeDivision = req.scopeDivision || req.division || req.query.division;
    const eligible = await certificateService.getEligibleEvaluations({
      user: req.user,
      division: activeDivision,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({
      success: true,
      data: { eligible },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/certificates/:id
 */
async function getCertificateByIdAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const certificate = await certificateService.getCertificateById({
      certificateId: id,
      user: req.user,
    });

    const notif = await Notification.findOne({
      'relatedResource.resourceType': 'Certificate',
      'relatedResource.resourceId': certificate._id,
    }).sort({ createdAt: -1 });

    const certObj = certificate.toObject ? certificate.toObject() : { ...certificate };
    certObj.emailDispatch = {
      sent: notif ? notif.emailSent : false,
      error: notif ? notif.emailError : null,
      notificationId: notif ? notif._id : null,
    };

    res.json({
      success: true,
      data: { certificate: certObj },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/certificates/:id/revoke
 */
async function revokeCertificateAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const certificate = await certificateService.revokeCertificate({
      certificateId: id,
      user: req.user,
      reason,
    });
    res.json({
      success: true,
      message: `Certificate ${certificate.serialNumber} revoked successfully`,
      data: { certificate },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/certificates/:id/pdf
 */
async function downloadCertificatePdfAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const pdfBuffer = await certificateService.getCertificatePdfBuffer({
      certificateId: id,
      user: req.user,
      isStudent: false,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/certificates/verify/:verificationToken (Public, Unauthenticated)
 */
async function verifyCertificatePublic(req, res, next) {
  try {
    const { verificationToken } = req.params;
    const result = await certificateService.verifyCertificatePublic(verificationToken);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/student/mine/certificates (Student Self-Service)
 */
async function listMyCertificates(req, res, next) {
  try {
    const certificates = await certificateService.getStudentCertificates(req.user._id);
    res.json({
      success: true,
      data: { certificates },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/student/mine/certificates/:id/pdf (Student PDF Download)
 */
async function downloadMyCertificatePdf(req, res, next) {
  try {
    const { id } = req.params;
    const pdfBuffer = await certificateService.getCertificatePdfBuffer({
      certificateId: id,
      user: req.user,
      isStudent: true,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/certificates/:id/restore
 */
async function restoreCertificateAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const certificate = await certificateService.restoreCertificate({
      certificateId: id,
      user: req.user,
      reason,
    });
    res.json({
      success: true,
      message: `Certificate ${certificate.serialNumber} restored successfully`,
      data: { certificate },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/certificates/:id
 */
async function updateCertificateMetadataAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const certificate = await certificateService.updateCertificateMetadata({
      certificateId: id,
      user: req.user,
      data: req.body,
    });
    res.json({
      success: true,
      message: `Certificate ${certificate.serialNumber} metadata updated successfully`,
      data: { certificate },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  issueCertificateAdmin,
  listCertificatesAdmin,
  getEligibleCertificatesAdmin,
  getCertificateByIdAdmin,
  revokeCertificateAdmin,
  restoreCertificateAdmin,
  updateCertificateMetadataAdmin,
  downloadCertificatePdfAdmin,
  verifyCertificatePublic,
  listMyCertificates,
  downloadMyCertificatePdf,
};
