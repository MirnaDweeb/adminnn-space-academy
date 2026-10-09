const PDFDocument = require('pdfkit');

/**
 * Generates an institutional Egyptian Space Agency Academy Analytics Report PDF.
 * Uses built-in Helvetica fonts and landscape/portrait layout.
 *
 * @param {Object} options
 * @param {string} options.reportTitle
 * @param {string} options.reportType
 * @param {string} options.division
 * @param {Object} options.filters
 * @param {Array<{ label: string, value: any }>} options.kpiCards
 * @param {Array<{ label: string, key: string, width?: number }>} options.headers
 * @param {Array<Object>} options.rows
 * @returns {Promise<Buffer>}
 */
function generateAnalyticsReportPdfBuffer({
  reportTitle = 'Academy Analytics Report',
  reportType = 'Overview',
  division = 'ALL',
  filters = {},
  kpiCards = [],
  headers = [],
  rows = [],
}) {
  return new Promise((resolve, reject) => {
    try {
      const isWide = headers.length > 5;
      const doc = new PDFDocument({
        size: 'A4',
        layout: isWide ? 'landscape' : 'portrait',
        margin: 36,
        compress: false,
        info: {
          Title: reportTitle,
          Author: 'Egyptian Space Agency Academy',
          Subject: `Executive Analytics Report: ${reportTitle}`,
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const width = doc.page.width;
      const height = doc.page.height;
      const margin = 36;
      const contentWidth = width - margin * 2;

      // Top Navy Header Banner
      doc.rect(margin, margin, contentWidth, 58).fillColor('#0b2545').fill();

      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#ffffff')
        .text('EGYPTIAN SPACE AGENCY ACADEMY', margin + 14, margin + 12);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#c59b27')
        .text(reportTitle.toUpperCase(), margin + 14, margin + 32);

      const genDateStr = `Generated: ${new Date().toLocaleString()} | Scope: ${division.replace(/_/g, ' ')}`;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(genDateStr, width - margin - 260, margin + 22, { width: 245, align: 'right' });

      let curY = margin + 68;

      // Active Filters Metadata Box
      doc.rect(margin, curY, contentWidth, 24).fillColor('#f8fafc').strokeColor('#e2e8f0').lineWidth(1).fillAndStroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('Applied Filters:', margin + 8, curY + 7);

      const filterItems = [];
      if (division && division !== 'all') filterItems.push(`Division: ${division}`);
      if (filters.program) filterItems.push(`Program: ${filters.program}`);
      if (filters.cohort) filterItems.push(`Cohort: ${filters.cohort}`);
      if (filters.status) filterItems.push(`Status: ${filters.status}`);
      if (filters.dateFrom || filters.dateTo) {
        filterItems.push(`Date: ${filters.dateFrom || 'start'} to ${filters.dateTo || 'now'}`);
      }
      const filterSummary = filterItems.length > 0 ? filterItems.join('  •  ') : 'All historical Academy data (no active filters)';

      doc.font('Helvetica').fontSize(8).fillColor('#334155').text(filterSummary, margin + 85, curY + 7, { width: contentWidth - 95 });
      curY += 32;

      // High Level KPI Metric Summary Cards (if provided)
      if (kpiCards && kpiCards.length > 0) {
        const cardCount = Math.min(kpiCards.length, 4);
        const cardWidth = (contentWidth - (cardCount - 1) * 8) / cardCount;
        const cardHeight = 44;

        kpiCards.slice(0, 4).forEach((kpi, idx) => {
          const cardX = margin + idx * (cardWidth + 8);
          doc.rect(cardX, curY, cardWidth, cardHeight).fillColor('#f1f5f9').strokeColor('#cbd5e1').lineWidth(0.8).fillAndStroke();
          doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(kpi.label, cardX + 8, curY + 8, { width: cardWidth - 16 });
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#0b2545').text(String(kpi.value != null ? kpi.value : '0'), cardX + 8, curY + 22, { width: cardWidth - 16 });
        });
        curY += cardHeight + 14;
      }

      // Structured Data Table
      if (headers.length > 0) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0b2545').text('Detailed Breakdown & Records', margin, curY);
        curY += 15;

        // Table Header
        const colWidth = contentWidth / headers.length;
        doc.rect(margin, curY, contentWidth, 20).fillColor('#0b2545').fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');

        headers.forEach((h, i) => {
          const x = margin + i * colWidth + 5;
          doc.text(h.label, x, curY + 6, { width: colWidth - 8, align: i === 0 ? 'left' : 'center' });
        });
        curY += 21;

        // Table Rows
        if (!rows || rows.length === 0) {
          doc.rect(margin, curY, contentWidth, 24).fillColor('#f8fafc').strokeColor('#e2e8f0').lineWidth(0.5).fillAndStroke();
          doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748b').text('No data matches the selected reporting criteria.', margin + 10, curY + 8);
          curY += 26;
        } else {
          rows.slice(0, 40).forEach((row, rIdx) => {
            // Check if page overflow
            if (curY > height - 60) {
              doc.addPage();
              curY = margin;
            }

            const rowBg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(margin, curY, contentWidth, 18).fillColor(rowBg).strokeColor('#e2e8f0').lineWidth(0.5).fillAndStroke();
            doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b');

            headers.forEach((h, i) => {
              const val = row[h.key] != null ? String(row[h.key]) : '—';
              const x = margin + i * colWidth + 5;
              doc.text(val, x, curY + 5, { width: colWidth - 8, align: i === 0 ? 'left' : 'center' });
            });
            curY += 18;
          });
        }
      }

      // Institutional Footer
      doc
        .rect(margin, height - 32, contentWidth, 1)
        .fillColor('#cbd5e1')
        .fill();

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(
          'Egyptian Space Agency Academy • Operations & Performance Analytics • Confidential Internal Document',
          margin,
          height - 24,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateAnalyticsReportPdfBuffer,
};
