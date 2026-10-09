const express = require('express');
const { listMyInvoices } = require('../controllers/financeController');
const { getMyCohorts } = require('../controllers/cohortController');
const { getMyEvaluations } = require('../controllers/evaluationController');
const { listMyCertificates, downloadMyCertificatePdf } = require('../controllers/certificateController');
const { submitFeedbackController } = require('../controllers/feedbackController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

const router = express.Router();

// Student-facing self-service invoice status (read-only)
router.get('/mine/invoices', protect, authorize(ROLES.STUDENT), listMyInvoices);

// Student-facing cohorts, attendance, and grades (read-only)
router.get('/mine/cohorts', protect, authorize(ROLES.STUDENT), getMyCohorts);

// Phase 12: Student-facing evaluation outcomes & history (read-only)
router.get('/mine/evaluations', protect, authorize(ROLES.STUDENT), getMyEvaluations);

// Phase 13: Student-facing earned certificates & PDF download (read-only)
router.get('/mine/certificates', protect, authorize(ROLES.STUDENT), listMyCertificates);
router.get('/mine/certificates/:id/pdf', protect, authorize(ROLES.STUDENT), downloadMyCertificatePdf);
router.get('/certificates/:id/pdf', protect, authorize(ROLES.STUDENT), downloadMyCertificatePdf);

// Student Feedback Submission
router.post('/mine/feedback', protect, authorize(ROLES.STUDENT), submitFeedbackController);

module.exports = router;
