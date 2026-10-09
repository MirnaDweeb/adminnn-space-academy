const express = require('express');
const { createApplication, listMyApplications } = require('../controllers/applicationController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post('/', protect, authorize(ROLES.STUDENT), createApplication);
router.get('/mine', protect, authorize(ROLES.STUDENT), listMyApplications);

module.exports = router;
