const PDFDocument = require('pdfkit');

/**
 * Generates an official Egyptian Space Agency Academy Student Dossier & Report PDF.
 * Uses Helvetica fonts built into PDFKit.
 *
 * @param {Object} dossier Aggregated student data
 * @returns {Promise<Buffer>}
 */
function generateStudentReportPdfBuffer(dossier) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 40,
        compress: false,
        info: {
          Title: `Student Dossier - ${dossier.student?.user?.fullName || 'Student'}`,
          Author: 'Egyptian Space Agency Academy',
          Subject: 'Official Student Record and Academic Dossier',
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const width = doc.page.width;
      const height = doc.page.height;
      const margin = 40;
      const contentWidth = width - margin * 2;

      // Header Banner
      doc.rect(margin, margin, contentWidth, 65).fillColor('#0b2545').fill();

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#ffffff')
        .text('EGYPTIAN SPACE AGENCY ACADEMY', margin + 15, margin + 12);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#c59b27')
        .text('OFFICIAL STUDENT DOSSIER & ACADEMIC TRANSCRIPT', margin + 15, margin + 32);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#cbd5e1')
        .text(`Generated: ${new Date().toLocaleDateString()} | Confidential Academy Record`, margin + 15, margin + 46);

      let curY = margin + 80;

      // Section 1: Student Profile
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('1. Student Information', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const profile = dossier.student || {};
      const user = profile.user || {};

      const infoRows = [
        ['Full Name:', user.fullName || '—', 'Student ID:', String(profile._id || '—').slice(-8).toUpperCase()],
        ['Email:', user.email || '—', 'Division:', profile.division?.replace(/_/g, ' ') || '—'],
        ['Phone:', profile.phone || '—', 'Academic Year:', profile.academicYear || '—'],
        ['Institution:', profile.institution || '—', 'Major:', profile.major || '—'],
        ['GPA:', profile.gpa != null ? String(profile.gpa) : 'N/A', 'Account Status:', user.isActive ? 'Active' : 'Inactive'],
      ];

      doc.font('Helvetica').fontSize(9);
      infoRows.forEach((row) => {
        doc.font('Helvetica-Bold').fillColor('#475569').text(row[0], margin, curY, { width: 90 });
        doc.font('Helvetica').fillColor('#0f172a').text(row[1], margin + 95, curY, { width: 170 });

        doc.font('Helvetica-Bold').fillColor('#475569').text(row[2], margin + 270, curY, { width: 90 });
        doc.font('Helvetica').fillColor('#0f172a').text(row[3], margin + 365, curY, { width: 150 });
        curY += 15;
      });

      curY += 10;

      // Section 2: Applications & Admissions
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('2. Applications & Admissions History', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const applications = dossier.applications || [];
      if (applications.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No program applications on record.', margin, curY);
        curY += 18;
      } else {
        // Table Header
        doc.rect(margin, curY, contentWidth, 18).fillColor('#f1f5f9').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
        doc.text('Program', margin + 6, curY + 5, { width: 230 });
        doc.text('Applied Date', margin + 240, curY + 5, { width: 80 });
        doc.text('Status', margin + 325, curY + 5, { width: 90 });
        doc.text('Decision', margin + 420, curY + 5, { width: 90 });
        curY += 20;

        applications.slice(0, 5).forEach((app) => {
          doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
          doc.text(app.program?.title || 'Program', margin + 6, curY, { width: 230 });
          doc.text(app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '—', margin + 240, curY, { width: 80 });
          doc.text(app.status || '—', margin + 325, curY, { width: 90 });
          doc.text(app.decision || 'PENDING', margin + 420, curY, { width: 90 });
          curY += 14;
        });
      }

      curY += 10;

      // Section 3: Training Cohorts & Enrollments
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('3. Academy Training & Cohort Enrollments', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const enrollments = dossier.enrollments || [];
      if (enrollments.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No cohort enrollments recorded.', margin, curY);
        curY += 18;
      } else {
        doc.rect(margin, curY, contentWidth, 18).fillColor('#f1f5f9').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
        doc.text('Cohort / Program', margin + 6, curY + 5, { width: 230 });
        doc.text('Status', margin + 240, curY + 5, { width: 90 });
        doc.text('Enrolled Date', margin + 335, curY + 5, { width: 85 });
        doc.text('Completion', margin + 425, curY + 5, { width: 85 });
        curY += 20;

        enrollments.slice(0, 5).forEach((enr) => {
          doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
          const title = `${enr.cohort?.cohortNumber || ''} - ${enr.program?.title || ''}`;
          doc.text(title.slice(0, 48), margin + 6, curY, { width: 230 });
          doc.text(enr.status || '—', margin + 240, curY, { width: 90 });
          doc.text(enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : '—', margin + 335, curY, { width: 85 });
          doc.text(enr.confirmedAt ? 'Confirmed' : 'Pending', margin + 425, curY, { width: 85 });
          curY += 14;
        });
      }

      curY += 10;

      // Section 4: Learning Evaluations & Academic Performance
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('4. Performance Evaluations & Learning Outcomes', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const evaluations = dossier.evaluations || [];
      if (evaluations.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No final evaluations recorded yet.', margin, curY);
        curY += 18;
      } else {
        doc.rect(margin, curY, contentWidth, 18).fillColor('#f1f5f9').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
        doc.text('Cohort / Program', margin + 6, curY + 5, { width: 230 });
        doc.text('Attendance', margin + 240, curY + 5, { width: 70 });
        doc.text('Average Score', margin + 315, curY + 5, { width: 75 });
        doc.text('Outcome', margin + 395, curY + 5, { width: 60 });
        doc.text('Evaluation Date', margin + 460, curY + 5, { width: 55 });
        curY += 20;

        evaluations.slice(0, 5).forEach((ev) => {
          doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
          const title = `${ev.cohort?.cohortNumber || ''} - ${ev.program?.title || ''}`;
          doc.text(title.slice(0, 48), margin + 6, curY, { width: 230 });
          doc.text(`${ev.attendanceRate}%`, margin + 240, curY, { width: 70 });
          doc.text(`${ev.averageScore}%`, margin + 315, curY, { width: 75 });
          doc.font('Helvetica-Bold').fillColor(ev.outcome === 'PASS' ? '#15803d' : '#b91c1c').text(ev.outcome || '—', margin + 395, curY, { width: 60 });
          doc.font('Helvetica').fillColor('#0f172a').text(ev.evaluatedAt ? new Date(ev.evaluatedAt).toLocaleDateString() : '—', margin + 460, curY, { width: 55 });
          curY += 14;
        });
      }

      curY += 10;

      // Section 5: Issued Certificates & Credentials
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('5. Verifiable Credentials & Certificates', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const certificates = dossier.certificates || [];
      if (certificates.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No certificates issued for this student.', margin, curY);
        curY += 18;
      } else {
        doc.rect(margin, curY, contentWidth, 18).fillColor('#f1f5f9').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
        doc.text('Program', margin + 6, curY + 5, { width: 190 });
        doc.text('Serial Number', margin + 200, curY + 5, { width: 130 });
        doc.text('Issued Date', margin + 335, curY + 5, { width: 85 });
        doc.text('Status', margin + 425, curY + 5, { width: 85 });
        curY += 20;

        certificates.forEach((c) => {
          doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
          doc.text(c.program?.title || 'Program', margin + 6, curY, { width: 190 });
          doc.font('Helvetica-Bold').text(c.serialNumber || '—', margin + 200, curY, { width: 130 });
          doc.font('Helvetica').text(c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : '—', margin + 335, curY, { width: 85 });
          doc.font('Helvetica-Bold').fillColor(c.status === 'REVOKED' ? '#dc2626' : '#15803d').text(c.status || 'ISSUED', margin + 425, curY, { width: 85 });
          curY += 14;
        });
      }

      curY += 10;

      // Section 6: Financial Ledger
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b2545')
        .text('6. Financial Ledger & Invoices', margin, curY);

      doc.moveTo(margin, curY + 15).lineTo(width - margin, curY + 15).lineWidth(1).strokeColor('#e2e8f0').stroke();
      curY += 22;

      const invoices = dossier.invoices || [];
      if (invoices.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No financial transactions or invoices.', margin, curY);
        curY += 18;
      } else {
        doc.rect(margin, curY, contentWidth, 18).fillColor('#f1f5f9').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
        doc.text('Invoice #', margin + 6, curY + 5, { width: 140 });
        doc.text('Program', margin + 150, curY + 5, { width: 180 });
        doc.text('Amount', margin + 335, curY + 5, { width: 80 });
        doc.text('Status', margin + 420, curY + 5, { width: 90 });
        curY += 20;

        invoices.slice(0, 5).forEach((inv) => {
          doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
          doc.text(inv.invoiceNumber || '—', margin + 6, curY, { width: 140 });
          doc.text(inv.program?.title || 'Program', margin + 150, curY, { width: 180 });
          doc.text(`${inv.amount} ${inv.currency || 'EGP'}`, margin + 335, curY, { width: 80 });
          doc.font('Helvetica-Bold').fillColor(inv.status === 'PAID' ? '#15803d' : '#ea580c').text(inv.status || '—', margin + 420, curY, { width: 90 });
          curY += 14;
        });
      }

      // Footer
      doc
        .rect(margin, height - 35, contentWidth, 1)
        .fillColor('#cbd5e1')
        .fill();

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(
          'Egyptian Space Agency Academy • Official Institutional Record • Verification: info@egsa.gov.eg',
          margin,
          height - 28,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateStudentReportPdfBuffer,
};
