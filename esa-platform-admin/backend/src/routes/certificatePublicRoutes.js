const express = require('express');
const { verifyCertificatePublic } = require('../controllers/certificateController');

const router = express.Router();

// Public, unauthenticated certificate verification lookup
// Returns strictly non-sensitive credential verification information
router.get('/verify/:verificationToken', verifyCertificatePublic);

module.exports = router;
