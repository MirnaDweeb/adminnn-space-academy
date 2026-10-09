const express = require('express');
const {
  getOverviewReportAdmin,
  getApplicationsReportAdmin,
  getEnrollmentsReportAdmin,
  getFinanceReportAdmin,
  getEvaluationsReportAdmin,
  getCertificatesReportAdmin,
  getNotificationsReportAdmin,
  exportReportCsvAdmin,
  exportReportPdfAdmin,
} = require('../controllers/reportController');

const router = express.Router();

// All reporting endpoints inherit protect, authorize(ADMIN_ROLES), and resolveDivisionScope
// from the parent router mounting in adminRoutes.js
router.get('/overview', getOverviewReportAdmin);
router.get('/applications', getApplicationsReportAdmin);
router.get('/enrollments', getEnrollmentsReportAdmin);
router.get('/finance', getFinanceReportAdmin);
router.get('/evaluations', getEvaluationsReportAdmin);
router.get('/certificates', getCertificatesReportAdmin);
router.get('/notifications', getNotificationsReportAdmin);
router.get('/export', exportReportCsvAdmin);
router.get('/export-pdf', exportReportPdfAdmin);

module.exports = router;
