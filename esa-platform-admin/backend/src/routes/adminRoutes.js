const express = require('express');
const { getGatewayOverview, getDivisionOverview } = require('../controllers/adminController');
const {
  listStudents,
  getStudentById,
  updateStudentStatus,
  updateStudentAdmin,
  getStudentOverviewAdmin,
  getStudentReportPdfAdmin,
  createStudentAdmin,
} = require('../controllers/studentController');
const {
  listApplicationsForAdmin,
  getApplicationByIdForAdmin,
  addApplicationReviewNote,
  updateApplicationDecision,
  evaluateApplicationReadiness,
  getApplicationReadinessHistory,
} = require('../controllers/applicationController');
const {
  createAdministrator,
  listAdministrators,
  getAdministratorById,
  updateAdministrator,
  updateAdministratorStatus,
  getAvailablePermissions,
} = require('../controllers/administratorController');
const {
  createInstructor,
  listInstructors,
  getInstructorById,
  updateInstructorStatus,
  updateInstructorAdmin,
  syncInstructorAccessController,
  syncAllInstructorsAccessController,
} = require('../controllers/instructorController');
const {
  listAuditLogsForAdmin,
  getAuditLogByIdForAdmin,
  getAuditLogFilterOptions,
} = require('../controllers/auditLogController');
const {
  enrollApplicationAdmin,
  getProgramEnrollmentsAdmin,
  cancelEnrollmentAdmin,
  getProgramCapacityAdmin,
} = require('../controllers/enrollmentController');
const {
  generateInvoiceAdmin,
  recordPaymentAdmin,
  processExpiredInvoicesAdmin,
  listInvoicesAdmin,
  getInvoiceByIdAdmin,
  getInvoiceByEnrollmentAdmin,
  updateInvoiceMetadataAdmin,
  adjustPaymentAdmin,
  getPaymentRemindersSummaryAdmin,
  previewPaymentRemindersAdmin,
  sendSinglePaymentReminderAdmin,
  sendBulkPaymentRemindersAdmin,
  getPaymentRemindersHistoryAdmin,
} = require('../controllers/financeController');
const {
  createCohortAdmin,
  listCohortsAdmin,
  getCohortByIdAdmin,
  updateCohortAdmin,
  createAssignmentAdmin,
  listAssignmentsAdmin,
  assignEnrollmentAdmin,
  listSessionsAdmin,
  updateSessionStatusAdmin,
} = require('../controllers/cohortController');
const {
  createAssessmentAdmin,
  listAssessmentsAdmin,
  getAssessmentByIdAdmin,
  updateAssessmentAdmin,
  toggleAssessmentStatusAdmin,
  deleteAssessmentAdmin,
  listAttemptsForAssessmentAdmin,
} = require('../controllers/assessmentController');
const {
  evaluateCohortAdmin,
  getCohortEvaluationsAdmin,
} = require('../controllers/evaluationController');
const {
  issueCertificateAdmin,
  listCertificatesAdmin,
  getEligibleCertificatesAdmin,
  getCertificateByIdAdmin,
  revokeCertificateAdmin,
  restoreCertificateAdmin,
  updateCertificateMetadataAdmin,
  downloadCertificatePdfAdmin,
} = require('../controllers/certificateController');
const {
  listFeedbackAdminController,
  getFeedbackSummaryAdminController,
} = require('../controllers/feedbackController');
const {
  listAdminNotifications,
  getEmailConfigAdmin,
  updateEmailConfigAdmin,
  previewBroadcastRecipientsAdmin,
  broadcastAnnouncementAdmin,
  retryNotificationEmailAdmin,
  sendStudentMessageAdmin,
  sendFeedbackReminderAdmin,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { requirePermission } = require('../middleware/permission');
const { PERMISSIONS } = require('../constants/permissions');

const { resolveDivisionScope, enforceDivisionParam } = require('../middleware/divisionScope');
const { ROLES } = require('../constants/roles');

const router = express.Router();

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN];

router.use(protect, authorize(...ADMIN_ROLES));

// Super Admin gateway — aggregate stats for both divisions.
router.get('/gateway', authorize(ROLES.SUPER_ADMIN), getGatewayOverview);

// Administrator provisioning & management — Super Admin only
router.get('/administrators/permissions', authorize(ROLES.SUPER_ADMIN), getAvailablePermissions);
router.post('/administrators', authorize(ROLES.SUPER_ADMIN), createAdministrator);
router.get('/administrators', authorize(ROLES.SUPER_ADMIN), listAdministrators);
router.get('/administrators/:id', authorize(ROLES.SUPER_ADMIN), getAdministratorById);
router.put('/administrators/:id', authorize(ROLES.SUPER_ADMIN), updateAdministrator);
router.patch('/administrators/:id/status', authorize(ROLES.SUPER_ADMIN), updateAdministratorStatus);

// Division-scoped resources. resolveDivisionScope reads ?division= for
// Super Admin, or forces the admin's own division otherwise.
router.post('/students', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_MANAGE), createStudentAdmin);
router.get('/students', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), listStudents);
router.get('/students/:id/overview', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), getStudentOverviewAdmin);
router.get('/students/:id/report-pdf', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), getStudentReportPdfAdmin);
router.get('/students/:id', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), getStudentById);
router.put('/students/:id', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_MANAGE), updateStudentAdmin);
router.patch('/students/:id/status', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_MANAGE), updateStudentStatus);

// Instructor provisioning & management — Division scoped (Super Admin + Division Admins)
router.post('/instructors/sync-access', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE), syncAllInstructorsAccessController);
router.post('/instructors/:id/sync-access', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE), syncInstructorAccessController);
router.post('/instructors', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE), createInstructor);
router.get('/instructors', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_VIEW), listInstructors);
router.get('/instructors/:id', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_VIEW), getInstructorById);
router.put('/instructors/:id', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE), updateInstructorAdmin);
router.patch('/instructors/:id/status', resolveDivisionScope, requirePermission(PERMISSIONS.INSTRUCTORS_MANAGE), updateInstructorStatus);

// Application review & decision workflow — Division scoped
router.get('/applications', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_VIEW), listApplicationsForAdmin);
router.get('/applications/:id', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_VIEW), getApplicationByIdForAdmin);
router.post('/applications/:id/notes', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_REVIEW), addApplicationReviewNote);
router.patch('/applications/:id/decision', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_REVIEW), updateApplicationDecision);
router.post('/applications/:id/readiness', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_REVIEW), evaluateApplicationReadiness);
router.get('/applications/:id/readiness', resolveDivisionScope, requirePermission(PERMISSIONS.APPLICATIONS_REVIEW), getApplicationReadinessHistory);

// Phase 9: Enrollment, Capacity & Waitlist Workflow — Division scoped
router.post('/applications/:id/enroll', resolveDivisionScope, requirePermission(PERMISSIONS.ENROLLMENTS_MANAGE), enrollApplicationAdmin);
router.get('/programs/:id/enrollments', resolveDivisionScope, requirePermission(PERMISSIONS.ENROLLMENTS_VIEW), getProgramEnrollmentsAdmin);
router.get('/programs/:id/capacity', resolveDivisionScope, requirePermission(PERMISSIONS.ENROLLMENTS_VIEW), getProgramCapacityAdmin);
router.patch('/enrollments/:id/cancel', resolveDivisionScope, requirePermission(PERMISSIONS.ENROLLMENTS_MANAGE), cancelEnrollmentAdmin);

// Phase 10: Invoices, Payments & Financial Management — Division scoped
router.post('/enrollments/:id/invoice', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), generateInvoiceAdmin);
router.get('/enrollments/:id/invoice', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), getInvoiceByEnrollmentAdmin);
router.post('/invoices/process-expired', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), processExpiredInvoicesAdmin);
router.post('/invoices/:id/payments', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), recordPaymentAdmin);
router.patch('/invoices/:id', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), updateInvoiceMetadataAdmin);
router.post('/payments/:id/adjust', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), adjustPaymentAdmin);
router.get('/invoices', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), listInvoicesAdmin);

// Payment Reminders & Deadline Notifications
router.get('/invoices/reminders/summary', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), getPaymentRemindersSummaryAdmin);
router.post('/invoices/reminders/preview', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), previewPaymentRemindersAdmin);
router.post('/invoices/reminders/bulk', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), sendBulkPaymentRemindersAdmin);
router.get('/invoices/reminders/history', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), getPaymentRemindersHistoryAdmin);
router.post('/invoices/:id/reminder', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_MANAGE), sendSinglePaymentReminderAdmin);

router.get('/invoices/:id', resolveDivisionScope, requirePermission(PERMISSIONS.FINANCE_VIEW), getInvoiceByIdAdmin);

// Phase 11: Training Delivery, Cohorts, Schedule & Assignments — Division scoped
router.post('/cohorts', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_MANAGE), createCohortAdmin);
router.get('/cohorts', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_VIEW), listCohortsAdmin);
router.get('/cohorts/:id', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_VIEW), getCohortByIdAdmin);
router.put('/cohorts/:id', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_MANAGE), updateCohortAdmin);
router.post('/cohorts/:id/assignments', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_MANAGE), createAssignmentAdmin);
router.get('/cohorts/:id/assignments', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_VIEW), listAssignmentsAdmin);
router.post('/cohorts/:id/assign-enrollment', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_MANAGE), assignEnrollmentAdmin);
router.get('/sessions', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_VIEW), listSessionsAdmin);
router.patch('/sessions/:cohortId/:sessionId/status', resolveDivisionScope, requirePermission(PERMISSIONS.COHORTS_MANAGE), updateSessionStatusAdmin);

// Program Assessment Builder — Admission Readiness Decision Support
router.post('/assessments', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_MANAGE), createAssessmentAdmin);
router.get('/assessments', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_VIEW), listAssessmentsAdmin);
router.get('/assessments/:id', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_VIEW), getAssessmentByIdAdmin);
router.put('/assessments/:id', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_MANAGE), updateAssessmentAdmin);
router.patch('/assessments/:id/status', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_MANAGE), toggleAssessmentStatusAdmin);
router.delete('/assessments/:id', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_MANAGE), deleteAssessmentAdmin);
router.get('/assessments/:id/attempts', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_VIEW), listAttemptsForAssessmentAdmin);

// Phase 12: Evaluations & Learning Outcomes — Division scoped
router.post('/cohorts/:id/evaluate', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_MANAGE), evaluateCohortAdmin);
router.get('/cohorts/:id/evaluations', resolveDivisionScope, requirePermission(PERMISSIONS.ASSESSMENTS_VIEW), getCohortEvaluationsAdmin);

// Phase 13: Certificates & Verifiable Credentials — Division scoped
router.post('/evaluations/:id/certificate', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_MANAGE), issueCertificateAdmin);
router.get('/certificates', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_VIEW), listCertificatesAdmin);
router.get('/certificates/eligible', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_VIEW), getEligibleCertificatesAdmin);
router.get('/certificates/:id', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_VIEW), getCertificateByIdAdmin);
router.patch('/certificates/:id/revoke', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_MANAGE), revokeCertificateAdmin);
router.patch('/certificates/:id/restore', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_MANAGE), restoreCertificateAdmin);
router.patch('/certificates/:id', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_MANAGE), updateCertificateMetadataAdmin);
router.get('/certificates/:id/pdf', resolveDivisionScope, requirePermission(PERMISSIONS.CERTIFICATES_VIEW), downloadCertificatePdfAdmin);

// Phase 14: Notifications & Official Email — Division scoped oversight
router.get('/notifications/email-config', authorize(ROLES.SUPER_ADMIN), getEmailConfigAdmin);
router.patch('/notifications/email-config', authorize(ROLES.SUPER_ADMIN), updateEmailConfigAdmin);
router.get('/notifications/broadcast-preview', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), previewBroadcastRecipientsAdmin);
router.post('/notifications/broadcast', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), broadcastAnnouncementAdmin);
router.post('/notifications/message-student', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), sendStudentMessageAdmin);
router.post('/notifications/feedback-reminder', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), sendFeedbackReminderAdmin);
router.post('/notifications/:id/retry-email', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), retryNotificationEmailAdmin);
router.get('/notifications', resolveDivisionScope, requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), listAdminNotifications);

// Student Feedback Center — Division scoped
router.get('/feedback/summary', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), getFeedbackSummaryAdminController);
router.get('/feedback', resolveDivisionScope, requirePermission(PERMISSIONS.STUDENTS_VIEW), listFeedbackAdminController);

// Audit Log Viewer — Division scoped (Super Admin sees all, Division Admins see own)
router.get('/audit-logs/filters', resolveDivisionScope, requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW), getAuditLogFilterOptions);
router.get('/audit-logs', resolveDivisionScope, requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW), listAuditLogsForAdmin);
router.get('/audit-logs/:id', resolveDivisionScope, requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW), getAuditLogByIdForAdmin);

// Phase 15: Reports & Analytics — Division scoped
const reportRoutes = require('./reportRoutes');
router.use('/reports', resolveDivisionScope, requirePermission(PERMISSIONS.REPORTS_VIEW), reportRoutes);

// Explicit division-in-path routes used by the /admin/:division dashboard.
// enforceDivisionParam blocks a division admin from requesting the other
// division's overview by editing the URL.
router.get('/:division/overview', enforceDivisionParam('division'), getDivisionOverview);

module.exports = router;
