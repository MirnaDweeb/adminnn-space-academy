const express = require('express');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const programRoutes = require('./programRoutes');
const studentRoutes = require('./studentRoutes');
const applicationRoutes = require('./applicationRoutes');
const paymentRoutes = require('./paymentRoutes');
const instructorRoutes = require('./instructorRoutes');
const certificatePublicRoutes = require('./certificatePublicRoutes');
const notificationRoutes = require('./notificationRoutes');
const studentAssessmentRoutes = require('./studentAssessmentRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/programs', programRoutes);
router.use('/students', studentRoutes);
router.use('/student/assessments', studentAssessmentRoutes);
router.use('/assessments', studentAssessmentRoutes);
router.use('/student', studentRoutes);
router.use('/applications', applicationRoutes);
router.use('/payments', paymentRoutes);
router.use('/instructor', instructorRoutes);
router.use('/certificates', certificatePublicRoutes);
router.use('/notifications', notificationRoutes);


router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

module.exports = router;
