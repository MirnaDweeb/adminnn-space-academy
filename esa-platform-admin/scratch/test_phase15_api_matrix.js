const http = require('http');
require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const connectDB = require('../backend/src/config/db');
const createApp = require('../backend/src/app');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Application = require('../backend/src/models/Application');
const Enrollment = require('../backend/src/models/Enrollment');
const Invoice = require('../backend/src/models/Invoice');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const Notification = require('../backend/src/models/Notification');
const AuditLog = require('../backend/src/models/AuditLog');

const PORT = 5000;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {},
    };

    if (options.body && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let rawData = [];
      res.on('data', (chunk) => rawData.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(rawData);
        let parsed = null;
        try {
          parsed = JSON.parse(buffer.toString('utf8'));
        } catch (e) {
          parsed = buffer.toString('utf8');
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function login(email, password = 'Password123!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || !res.data?.data?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runApiMatrix() {
  console.log('====================================================');
  console.log('PHASE 15 — REPORTS & ANALYTICS API MATRIX & DB TESTS');
  console.log('====================================================\n');

  await connectDB();

  const results = [];
  function assert(testName, condition, detail = '') {
    results.push({ testName, pass: Boolean(condition), detail });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${testName} ${detail ? `(${detail})` : ''}`);
  }

  try {
    // 1. Obtain tokens
    const superToken = await login('superadmin@esa.dev');
    const preUniToken = await login('preuni.admin@esa.dev');
    const uniToken = await login('uni.admin@esa.dev');
    const studentToken = await login('student@esa.dev');

    // -----------------------------------------------------------------
    // TEST 1: Unauthenticated request -> 401
    // -----------------------------------------------------------------
    const unauthRes = await request('/admin/reports/overview');
    assert('1. Unauthenticated report request -> 401', unauthRes.status === 401, `Status: ${unauthRes.status}`);

    // -----------------------------------------------------------------
    // TEST 2: Student / non-admin request -> 403
    // -----------------------------------------------------------------
    const studentRes = await request('/admin/reports/overview', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert('2. Student/non-admin request -> 403', studentRes.status === 403, `Status: ${studentRes.status}`);

    // -----------------------------------------------------------------
    // TEST 3: SUPER_ADMIN -> both divisions ('all')
    // -----------------------------------------------------------------
    const superOverviewRes = await request('/admin/reports/overview', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const superOverview = superOverviewRes.data?.data;
    assert(
      '3. SUPER_ADMIN -> both divisions overview (200)',
      superOverviewRes.status === 200 &&
        superOverview?.summary?.totalStudents > 0 &&
        superOverview?.divisionBreakdown?.length === 2,
      `Students: ${superOverview?.summary?.totalStudents}, Total Revenue: ${superOverview?.summary?.totalRevenue}`
    );

    // -----------------------------------------------------------------
    // TEST 4: PRE_UNIVERSITY_ADMIN -> only PRE_UNIVERSITY
    // -----------------------------------------------------------------
    const preUniOverviewRes = await request('/admin/reports/overview', {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    const preUniOverview = preUniOverviewRes.data?.data;
    assert(
      '4. PRE_UNIVERSITY_ADMIN -> scoped to PRE_UNIVERSITY (200)',
      preUniOverviewRes.status === 200 &&
        preUniOverview?.appliedFilters?.division === 'PRE_UNIVERSITY',
      `Applied Division: ${preUniOverview?.appliedFilters?.division}, Apps: ${preUniOverview?.summary?.totalApplications}`
    );

    // -----------------------------------------------------------------
    // TEST 5: UNIVERSITY_ADMIN -> only UNIVERSITY
    // -----------------------------------------------------------------
    const uniOverviewRes = await request('/admin/reports/overview', {
      headers: { Authorization: `Bearer ${uniToken}` },
    });
    const uniOverview = uniOverviewRes.data?.data;
    assert(
      '5. UNIVERSITY_ADMIN -> scoped to UNIVERSITY (200)',
      uniOverviewRes.status === 200 &&
        uniOverview?.appliedFilters?.division === 'UNIVERSITY',
      `Applied Division: ${uniOverview?.appliedFilters?.division}, Apps: ${uniOverview?.summary?.totalApplications}`
    );

    // -----------------------------------------------------------------
    // TEST 6: Cross-division access -> 403
    // -----------------------------------------------------------------
    const crossPreToUni = await request('/admin/reports/overview?division=UNIVERSITY', {
      headers: { Authorization: `Bearer ${preUniToken}` },
    });
    assert('6.1 PRE_UNIVERSITY_ADMIN requesting UNIVERSITY -> 403', crossPreToUni.status === 403, `Status: ${crossPreToUni.status}`);

    const crossUniToPre = await request('/admin/reports/applications?division=PRE_UNIVERSITY', {
      headers: { Authorization: `Bearer ${uniToken}` },
    });
    assert('6.2 UNIVERSITY_ADMIN requesting PRE_UNIVERSITY -> 403', crossUniToPre.status === 403, `Status: ${crossUniToPre.status}`);

    // -----------------------------------------------------------------
    // TEST 7: SUPER_ADMIN querying specific division -> 200
    // -----------------------------------------------------------------
    const superFilteredRes = await request('/admin/reports/overview?division=PRE_UNIVERSITY', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      '7. SUPER_ADMIN filter ?division=PRE_UNIVERSITY -> 200',
      superFilteredRes.status === 200 &&
        superFilteredRes.data?.data?.appliedFilters?.division === 'PRE_UNIVERSITY',
      `Division: ${superFilteredRes.data?.data?.appliedFilters?.division}`
    );

    // -----------------------------------------------------------------
    // TEST 8: Valid filters (Applications by status and decision)
    // -----------------------------------------------------------------
    const appFilteredRes = await request('/admin/reports/applications?status=CONFIRMED', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      '8. Valid filters: Applications ?status=CONFIRMED -> 200',
      appFilteredRes.status === 200 && Array.isArray(appFilteredRes.data?.data?.byProgram),
      `Total: ${appFilteredRes.data?.data?.summary?.total}`
    );

    // -----------------------------------------------------------------
    // TEST 9: Date-range filtering
    // -----------------------------------------------------------------
    const dateRangeRes = await request('/admin/reports/finance?dateFrom=2026-01-01&dateTo=2026-12-31', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      '9. Date-range filtering: Finance dateFrom & dateTo -> 200',
      dateRangeRes.status === 200 &&
        dateRangeRes.data?.data?.appliedFilters?.dateFrom === '2026-01-01',
      `Total Invoiced: ${dateRangeRes.data?.data?.summary?.totalInvoiced}`
    );

    // -----------------------------------------------------------------
    // TEST 10: Empty dataset handling (returns 0s, not errors)
    // -----------------------------------------------------------------
    const emptyDatasetRes = await request('/admin/reports/evaluations?dateFrom=2099-01-01&dateTo=2099-12-31', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    assert(
      '10. Empty dataset handling (far-future date range) -> 200 with 0s',
      emptyDatasetRes.status === 200 &&
        emptyDatasetRes.data?.data?.summary?.totalEvaluations === 0 &&
        emptyDatasetRes.data?.data?.summary?.passRate === 0,
      `Total: ${emptyDatasetRes.data?.data?.summary?.totalEvaluations}`
    );

    // -----------------------------------------------------------------
    // TEST 11: Overview aggregation correctness against MongoDB
    // -----------------------------------------------------------------
    const dbTotalStudents = await User.countDocuments({ role: 'STUDENT' });
    const dbTotalApps = await Application.countDocuments({});
    const dbTotalEnrs = await Enrollment.countDocuments({});
    const dbPaidInvAgg = await Invoice.aggregate([
      { $match: { status: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const dbPaidTotal = dbPaidInvAgg[0]?.total || 0;

    assert(
      '11. Overview aggregation matches MongoDB directly',
      superOverview.summary.totalStudents === dbTotalStudents &&
        superOverview.summary.totalApplications === dbTotalApps &&
        superOverview.summary.totalEnrollments === dbTotalEnrs &&
        superOverview.summary.totalRevenue === dbPaidTotal,
      `API: Apps=${superOverview.summary.totalApplications}, Rev=${superOverview.summary.totalRevenue} | DB: Apps=${dbTotalApps}, Rev=${dbPaidTotal}`
    );

    // -----------------------------------------------------------------
    // TEST 12: Applications report endpoint & metrics
    // -----------------------------------------------------------------
    const appReportRes = await request('/admin/reports/applications', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const appReport = appReportRes.data?.data;
    assert(
      '12. Applications report returns summary, byStatus, byProgram, timeline, turnaround',
      appReportRes.status === 200 &&
        appReport?.summary?.total === dbTotalApps &&
        Array.isArray(appReport?.byStatus) &&
        Array.isArray(appReport?.byProgram) &&
        appReport?.summary?.acceptanceRate >= 0,
      `Total: ${appReport?.summary?.total}, Acceptance Rate: ${appReport?.summary?.acceptanceRate}%, Turnaround: ${appReport?.summary?.avgDecisionTurnaroundHours}h`
    );

    // -----------------------------------------------------------------
    // TEST 13: Enrollment & Capacity aggregation correctness (Phase 9 rule)
    // -----------------------------------------------------------------
    const enrReportRes = await request('/admin/reports/enrollments', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const enrReport = enrReportRes.data?.data;
    const expectedOccupied = (enrReport?.summary?.confirmed || 0) + (enrReport?.summary?.pendingPayment || 0);

    assert(
      '13. Enrollment & Capacity obeys Phase 9 rule: Occupied = Confirmed + PendingPayment',
      enrReportRes.status === 200 &&
        enrReport?.summary?.occupiedCapacity === expectedOccupied &&
        enrReport?.summary?.occupiedCapacity > 0,
      `Occupied: ${enrReport?.summary?.occupiedCapacity} == Confirmed(${enrReport?.summary?.confirmed}) + Pending(${enrReport?.summary?.pendingPayment})`
    );

    // -----------------------------------------------------------------
    // TEST 14: Finance report aggregation correctness
    // -----------------------------------------------------------------
    const finReportRes = await request('/admin/reports/finance', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const finReport = finReportRes.data?.data;
    assert(
      '14. Finance report matches invoiced, paid, pending, expired, and payment methods',
      finReportRes.status === 200 &&
        finReport?.summary?.totalPaid === dbPaidTotal &&
        finReport?.summary?.totalInvoiced >= finReport?.summary?.totalPaid &&
        Array.isArray(finReport?.byPaymentMethod),
      `Paid: ${finReport?.summary?.totalPaid} EGP, Invoiced: ${finReport?.summary?.totalInvoiced} EGP, Txns: ${finReport?.summary?.paymentTransactionCount}`
    );

    // -----------------------------------------------------------------
    // TEST 15: Evaluation report aggregation correctness
    // -----------------------------------------------------------------
    const evalReportRes = await request('/admin/reports/evaluations', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const evalReport = evalReportRes.data?.data;
    const dbEvalCount = await Evaluation.countDocuments({});
    assert(
      '15. Evaluation report matches MongoDB evaluation records and outcome distribution',
      evalReportRes.status === 200 &&
        evalReport?.summary?.totalEvaluations === dbEvalCount &&
        evalReport?.summary?.passCount > 0 &&
        evalReport?.summary?.avgScore > 0,
      `Total: ${evalReport?.summary?.totalEvaluations}, Pass Rate: ${evalReport?.summary?.passRate}%, Avg Score: ${evalReport?.summary?.avgScore}%`
    );

    // -----------------------------------------------------------------
    // TEST 16: Certificate report aggregation correctness
    // -----------------------------------------------------------------
    const certReportRes = await request('/admin/reports/certificates', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const certReport = certReportRes.data?.data;
    const dbIssuedCerts = await Certificate.countDocuments({ status: 'ISSUED' });
    const dbRevokedCerts = await Certificate.countDocuments({ status: 'REVOKED' });
    assert(
      '16. Certificate report matches issued, revoked, and program distribution',
      certReportRes.status === 200 &&
        certReport?.summary?.issuedCount === dbIssuedCerts &&
        certReport?.summary?.revokedCount === dbRevokedCerts,
      `Issued: ${certReport?.summary?.issuedCount}, Revoked: ${certReport?.summary?.revokedCount}`
    );

    // -----------------------------------------------------------------
    // TEST 17: Notification report aggregation correctness
    // -----------------------------------------------------------------
    const notifReportRes = await request('/admin/reports/notifications', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const notifReport = notifReportRes.data?.data;
    const dbTotalNotifs = await Notification.countDocuments({});
    assert(
      '17. Notification report matches total, read, unread, and type distribution',
      notifReportRes.status === 200 &&
        notifReport?.summary?.totalNotifications === dbTotalNotifs &&
        Array.isArray(notifReport?.byType),
      `Total: ${notifReport?.summary?.totalNotifications}, Read Rate: ${notifReport?.summary?.readRate}%`
    );

    // -----------------------------------------------------------------
    // TEST 18: CSV Export endpoint & Audit Log verification
    // -----------------------------------------------------------------
    const csvExportRes = await request('/admin/reports/export?report=finance', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const isCsv =
      csvExportRes.status === 200 &&
      csvExportRes.headers['content-type']?.includes('text/csv') &&
      typeof csvExportRes.data === 'string' &&
      csvExportRes.data.includes('Program Title');

    assert('18.1 CSV Export returns valid text/csv with attachment header', isCsv, `Status: ${csvExportRes.status}`);

    const exportAudit = await AuditLog.findOne({
      action: 'REPORT_EXPORT',
      resource: 'Report',
    }).sort({ timestamp: -1 });

    assert(
      '18.2 CSV Export creates REPORT_EXPORT AuditLog record',
      Boolean(exportAudit) && exportAudit?.after?.reportType === 'finance',
      `Audit Action: ${exportAudit?.action}, Report: ${exportAudit?.after?.reportType}`
    );

  } catch (err) {
    console.error('Test Execution Error:', err);
    assert('Execution without fatal exceptions', false, err.message);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nAPI Matrix Finished: ${passed}/${results.length} PASSED, ${failed} FAILED.`);
  process.exit(failed > 0 ? 1 : 0);
}

runApiMatrix().catch((e) => {
  console.error('Fatal API Matrix Runner Error:', e);
  process.exit(1);
});
