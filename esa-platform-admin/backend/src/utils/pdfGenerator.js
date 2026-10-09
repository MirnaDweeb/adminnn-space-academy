const PDFDocument = require('pdfkit');

/**
 * Generate a clean, readable, professional PDF Certificate of Completion.
 * Uses standard built-in Helvetica fonts requiring zero external font files.
 *
 * @param {Object} certificate Populated certificate object
 * @returns {Promise<Buffer>}
 */
function generateCertificatePdfBuffer(certificate) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        compress: false,
        info: {
          Title: `Certificate - ${certificate.serialNumber}`,
          Author: 'Egyptian Space Agency Academy',
          Subject: `Certificate of Completion for ${certificate.student?.fullName || 'Student'}`,
          Keywords: 'certificate, esa, space agency, completion',
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => reject(err));

      const width = doc.page.width;
      const height = doc.page.height;

      // 1. Decorative Borders
      // Outer Navy Border
      doc
        .rect(20, 20, width - 40, height - 40)
        .lineWidth(4)
        .strokeColor('#0b2545')
        .stroke();

      // Inner Gold Border
      doc
        .rect(26, 26, width - 52, height - 52)
        .lineWidth(1.5)
        .strokeColor('#c59b27')
        .stroke();

      // Corner Accents
      const cornerSize = 16;
      doc.rect(26, 26, cornerSize, cornerSize).fillColor('#0b2545').fill();
      doc.rect(width - 26 - cornerSize, 26, cornerSize, cornerSize).fillColor('#0b2545').fill();
      doc.rect(26, height - 26 - cornerSize, cornerSize, cornerSize).fillColor('#0b2545').fill();
      doc.rect(width - 26 - cornerSize, height - 26 - cornerSize, cornerSize, cornerSize).fillColor('#0b2545').fill();

      // 2. Header
      doc.y = 55;
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#0b2545')
        .text('EGYPTIAN SPACE AGENCY', { align: 'center', characterSpacing: 2 });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#6c757d')
        .text('ACADEMY TRAINING & CAPACITY BUILDING PROGRAM', { align: 'center', characterSpacing: 1 });

      doc.moveDown(0.8);

      // Certificate Title
      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor('#c59b27')
        .text('CERTIFICATE OF COMPLETION', { align: 'center', characterSpacing: 1.5 });

      doc.moveDown(0.6);

      // Presentation Text
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#495057')
        .text('This is to certify that', { align: 'center' });

      doc.moveDown(0.5);

      // Student Name
      const studentName = certificate.student?.fullName || 'Accomplished Scholar';
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#0b2545')
        .text(studentName, { align: 'center' });

      // Subtle underline for student name
      const textWidth = doc.widthOfString(studentName);
      const startX = (width - textWidth) / 2;
      doc
        .moveTo(startX - 20, doc.y + 4)
        .lineTo(startX + textWidth + 20, doc.y + 4)
        .lineWidth(1)
        .strokeColor('#c59b27')
        .stroke();

      doc.moveDown(0.8);

      // Completion Description
      const divisionLabel =
        certificate.division === 'PRE_UNIVERSITY'
          ? 'Pre-University Division'
          : certificate.division === 'UNIVERSITY'
          ? 'University Division'
          : `${certificate.division} Division`;

      const programTitle = certificate.program?.title || 'Advanced Aerospace Engineering Program';

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#495057')
        .text(
          `has successfully satisfied all rigorous academic, attendance, and project assessment qualifications for the program:`,
          { align: 'center' }
        );

      doc.moveDown(0.4);

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#1a365d')
        .text(`"${programTitle}"`, { align: 'center' });

      doc
        .font('Helvetica-Oblique')
        .fontSize(11)
        .fillColor('#6c757d')
        .text(`Conducted under the ${divisionLabel}`, { align: 'center' });

      // 3. Metadata Grid (Bottom)
      const bottomY = height - 145;
      doc.y = bottomY;

      // Left Column: Issue Date & Cohort
      const issueDateStr = certificate.issuedAt
        ? new Date(certificate.issuedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : new Date().toLocaleDateString('en-US');

      const cohortNumber = certificate.cohort?.cohortNumber || 'COH-ACTIVE';

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0b2545')
        .text('DATE OF ISSUANCE:', 60, bottomY);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#212529')
        .text(issueDateStr, 60, bottomY + 12);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0b2545')
        .text('COHORT IDENTIFIER:', 60, bottomY + 30);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#212529')
        .text(cohortNumber, 60, bottomY + 42);

      // Center Column: Authorized Signature Stamp
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0b2545')
        .text('EXECUTIVE SEAL & SIGNATURE', width / 2 - 80, bottomY, { width: 160, align: 'center' });

      doc
        .moveTo(width / 2 - 70, bottomY + 36)
        .lineTo(width / 2 + 70, bottomY + 36)
        .lineWidth(1)
        .strokeColor('#adb5bd')
        .stroke();

      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#6c757d')
        .text('Academy Director, ESA', width / 2 - 80, bottomY + 40, { width: 160, align: 'center' });

      // Right Column: Serial Number & Verification
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0b2545')
        .text('SERIAL NUMBER:', width - 240, bottomY, { width: 180, align: 'right' });
      doc
        .font('Courier-Bold')
        .fontSize(10)
        .fillColor('#0b2545')
        .text(certificate.serialNumber, width - 240, bottomY + 12, { width: 180, align: 'right' });

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#6c757d')
        .text('PUBLIC VERIFICATION CODE:', width - 240, bottomY + 30, { width: 180, align: 'right' });
      doc
        .font('Courier')
        .fontSize(8)
        .fillColor('#495057')
        .text(certificate.verificationToken?.slice(0, 16) + '...', width - 240, bottomY + 42, {
          width: 180,
          align: 'right',
        });

      // Verification instructions footer
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#868e96')
        .text(
          `To verify authenticity of this digital credential, navigate to the public verification portal and enter code: ${certificate.verificationToken}`,
          40,
          height - 40,
          { width: width - 80, align: 'center' }
        );

      // 4. Revocation Watermark if status === REVOKED
      if (certificate.status === 'REVOKED') {
        doc.save();
        doc
          .font('Helvetica-Bold')
          .fontSize(44)
          .fillColor('#dc3545', 0.85)
          .text('REVOKED - VOID', 0, height / 2 - 30, {
            width,
            align: 'center',
          });

        const revDateStr = certificate.revokedAt
          ? new Date(certificate.revokedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '';

        doc
          .font('Helvetica')
          .fontSize(14)
          .fillColor('#721c24')
          .text(`Revoked on: ${revDateStr}${certificate.revocationReason ? ` — Reason: ${certificate.revocationReason}` : ''}`, 0, height / 2 + 25, {
            width,
            align: 'center',
          });
        doc.restore();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCertificatePdfBuffer,
};
