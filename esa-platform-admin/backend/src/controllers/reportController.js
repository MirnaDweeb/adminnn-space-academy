const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const {
  getOverviewReport,
  getApplicationsReport,
  getEnrollmentCapacityReport,
  getFinanceReport,
  getEvaluationsReport,
  getCertificatesReport,
  getNotificationsReport,
  exportReportCsv,
  exportReportPdf,
} = require('../services/reportService');

/**
 * Resolves and strictly enforces division access for reporting queries.
 */
function resolveEffectiveDivision(req) {
  const { division } = req.query;

  // Division Admins cannot access another division
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    if (division && division !== 'all' && division !== req.scopeDivision) {
      throw ApiError.forbidden("You cannot access another division's reports");
    }
    return req.scopeDivision;
  }

  // Super Admin can pass ?division=all|PRE_UNIVERSITY|UNIVERSITY
  if (division && division !== 'all') {
    return division;
  }
  return req.scopeDivision || 'all';
}

/**
 * GET /api/admin/reports/overview
 */
const getOverviewReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { dateFrom, dateTo } = req.query;

  const data = await getOverviewReport({
    division,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/applications
 */
const getApplicationsReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { program, status, decision, dateFrom, dateTo } = req.query;

  const data = await getApplicationsReport({
    division,
    program,
    status,
    decision,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/enrollments
 */
const getEnrollmentsReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { program, cohort, status, dateFrom, dateTo } = req.query;

  const data = await getEnrollmentCapacityReport({
    division,
    program,
    cohort,
    status,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/finance
 */
const getFinanceReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { program, dateFrom, dateTo } = req.query;

  const data = await getFinanceReport({
    division,
    program,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/evaluations
 */
const getEvaluationsReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { program, cohort, dateFrom, dateTo } = req.query;

  const data = await getEvaluationsReport({
    division,
    program,
    cohort,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/certificates
 */
const getCertificatesReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { program, dateFrom, dateTo } = req.query;

  const data = await getCertificatesReport({
    division,
    program,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/notifications
 */
const getNotificationsReportAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { dateFrom, dateTo } = req.query;

  const data = await getNotificationsReport({
    division,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, data);
});

/**
 * GET /api/admin/reports/export
 */
const exportReportCsvAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { report, program, cohort, dateFrom, dateTo, status } = req.query;

  if (!report) {
    throw ApiError.badRequest('Report type parameter is required for CSV export');
  }

  const { filename, csvContent } = await exportReportCsv({
    reportType: report,
    division,
    program,
    cohort,
    dateFrom,
    dateTo,
    status,
    user: req.user,
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
});

/**
 * GET /api/admin/reports/export-pdf
 */
const exportReportPdfAdmin = asyncHandler(async (req, res) => {
  const division = resolveEffectiveDivision(req);
  const { report, program, cohort, dateFrom, dateTo, status } = req.query;

  const { filename, pdfBuffer } = await exportReportPdf({
    reportType: report,
    division,
    program,
    cohort,
    dateFrom,
    dateTo,
    status,
    user: req.user,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(pdfBuffer);
});

module.exports = {
  getOverviewReportAdmin,
  getApplicationsReportAdmin,
  getEnrollmentsReportAdmin,
  getFinanceReportAdmin,
  getEvaluationsReportAdmin,
  getCertificatesReportAdmin,
  getNotificationsReportAdmin,
  exportReportCsvAdmin,
  exportReportPdfAdmin,
};
