const mongoose = require('../backend/node_modules/mongoose');
require('../backend/src/models/User');
require('../backend/src/models/Course');
require('../backend/src/models/Cohort');
require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const AuditLog = require('../backend/src/models/AuditLog');
const Evaluation = require('../backend/src/models/Evaluation');
const User = require('../backend/src/models/User');
const certificateService = require('../backend/src/services/certificateService');

async function dumpEvidence() {
  console.log('================================================================');
  console.log('PHASE 13: DATABASE EVIDENCE & AUDIT DUMP');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  let issuedCert = await Certificate.findOne({ status: 'ISSUED' })
    .populate('student', 'fullName email')
    .populate('cohort', 'cohortNumber name')
    .populate('program', 'title division level')
    .populate('evaluation')
    .populate('issuedBy', 'fullName email role');

  let revokedCert = await Certificate.findOne({ status: 'REVOKED' })
    .populate('student', 'fullName email')
    .populate('cohort', 'cohortNumber name')
    .populate('program', 'title division level')
    .populate('evaluation')
    .populate('issuedBy', 'fullName email role')
    .populate('revokedBy', 'fullName email role');

  // If no active ISSUED certificate, issue one via certificateService
  if (!issuedCert) {
    const passEval = await Evaluation.findOne({
      outcome: 'PASS',
      division: 'PRE_UNIVERSITY',
    })
      .populate('cohort')
      .populate('student')
      .populate('program')
      .sort({ evaluatedAt: -1 });

    const adminUser = await User.findOne({ email: 'preuni.admin@esa.dev' });

    // Clean any prior certificate on this evaluation so service can issue cleanly
    await Certificate.deleteMany({ evaluation: passEval._id });

    const issueResult = await certificateService.issueCertificate({
      evaluationId: passEval._id,
      user: adminUser,
    });

    issuedCert = await Certificate.findById(issueResult._id)
      .populate('student', 'fullName email')
      .populate('cohort', 'cohortNumber name')
      .populate('program', 'title division level')
      .populate('evaluation')
      .populate('issuedBy', 'fullName email role');
  }

  console.log('--- 1. REAL DOCUMENT EVIDENCE: ISSUED CERTIFICATE ---');
  console.log(JSON.stringify(issuedCert, null, 2));

  console.log('\n--- 2. REAL DOCUMENT EVIDENCE: REVOKED CERTIFICATE ---');
  console.log(JSON.stringify(revokedCert, null, 2));

  console.log('\n--- 3. REAL AUDIT LOG: CERTIFICATE_ISSUED ---');
  const issueAudit = await AuditLog.findOne({ action: 'CERTIFICATE_ISSUED' })
    .populate('user', 'fullName email role')
    .sort({ timestamp: -1, createdAt: -1 });
  console.log(JSON.stringify(issueAudit, null, 2));

  console.log('\n--- 4. REAL AUDIT LOG: CERTIFICATE_REVOKED ---');
  const revokeAudit = await AuditLog.findOne({ action: 'CERTIFICATE_REVOKED' })
    .populate('user', 'fullName email role')
    .sort({ timestamp: -1, createdAt: -1 });
  console.log(JSON.stringify(revokeAudit, null, 2));

  console.log('\n--- 5. GENERATED PDF SAMPLE CONTENT & METRICS (ISSUED) ---');
  const adminUser = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const pdfBuffer = await certificateService.getCertificatePdfBuffer({
    certificateId: issuedCert._id,
    user: adminUser,
  });

  function extractPdfHexStrings(buf) {
    const raw = buf.toString('binary');
    const hexMatches = raw.match(/<([0-9a-fA-F]+)>/g) || [];
    return hexMatches
      .map((h) => {
        try {
          return Buffer.from(h.slice(1, -1), 'hex').toString('utf8');
        } catch {
          return '';
        }
      })
      .join('');
  }

  const extractedIssuedText = extractPdfHexStrings(pdfBuffer);
  console.log(`PDF Buffer Size: ${pdfBuffer.length} bytes`);
  console.log(`PDF Version Header: ${pdfBuffer.slice(0, 8).toString('utf8')}`);
  console.log('Extracted Plaintext Content Sample:');
  console.log(extractedIssuedText.slice(0, 300));
  console.log(`Contains Student Name: ${extractedIssuedText.includes(issuedCert.student?.fullName)}`);
  console.log(`Contains Program Title: ${extractedIssuedText.includes(issuedCert.program?.title)}`);
  console.log(`Contains Serial Number: ${extractedIssuedText.includes(issuedCert.serialNumber)}`);

  console.log('\n--- 6. REVOKED CERTIFICATE PDF WATERMARK & METRICS ---');
  if (revokedCert) {
    const revokedPdfBuffer = await certificateService.getCertificatePdfBuffer({
      certificateId: revokedCert._id,
      user: adminUser,
    });
    const extractedRevokedText = extractPdfHexStrings(revokedPdfBuffer);
    console.log(`Revoked PDF Buffer Size: ${revokedPdfBuffer.length} bytes`);
    console.log(`Contains REVOKED - VOID: ${extractedRevokedText.includes('REVOKED - VOID')}`);
    console.log(`Contains Revocation Reason: ${extractedRevokedText.includes(revokedCert.revocationReason.slice(0, 30))}`);
    console.log('Revoked PDF Plaintext Snippet:');
    console.log(extractedRevokedText.slice(0, 350));
  }

  await mongoose.disconnect();
  console.log('\n[DB] Database evidence dump complete.');
}

dumpEvidence().catch(console.error);
