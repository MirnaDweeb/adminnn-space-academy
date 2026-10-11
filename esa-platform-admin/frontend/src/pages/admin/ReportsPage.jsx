import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { ROLE_TO_DIVISION, DIVISION_LABELS, DIVISIONS } from '../../constants/divisions';
import reportService from '../../services/api/reportService';
import programService from '../../services/api/programService';
import cohortService from '../../services/api/cohortService';

import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';

import DonutChart from '../../components/charts/DonutChart';
import BarChart from '../../components/charts/BarChart';
import TrendChart from '../../components/charts/TrendChart';

import styles from './ReportsPage.module.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge' },
  { id: 'applications', label: 'Applications & Admissions', icon: 'fa-file-lines' },
  { id: 'enrollments', label: 'Enrollment & Capacity', icon: 'fa-people-group' },
  { id: 'finance', label: 'Finance & Invoices', icon: 'fa-file-invoice-dollar' },
  { id: 'evaluations', label: 'Training & Evaluation', icon: 'fa-graduation-cap' },
  { id: 'certificates', label: 'Certificates', icon: 'fa-certificate' },
  { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const params = useParams();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const initialDivision = isSuperAdmin
    ? params.division || 'all'
    : ROLE_TO_DIVISION[user?.role] || user?.division;

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDivision, setSelectedDivision] = useState(initialDivision);
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [selectedCohort, setSelectedCohort] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDecision, setSelectedDecision] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dropdown options
  const [programsList, setProgramsList] = useState([]);
  const [cohortsList, setCohortsList] = useState([]);

  // Data states
  const [reportData, setReportData] = useState(null);
  const [loadedTab, setLoadedTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);

  // Sync division when url params change
  useEffect(() => {
    if (params.division) {
      setSelectedDivision(params.division);
    } else if (!isSuperAdmin) {
      setSelectedDivision(ROLE_TO_DIVISION[user?.role] || user?.division);
    }
  }, [params.division, user, isSuperAdmin]);

  // Load programs & cohorts for filters
  useEffect(() => {
    let mounted = true;
    async function loadFilterOptions() {
      try {
        const [progRes, cohortRes] = await Promise.all([
          programService.list({ limit: 100 }),
          cohortService.listCohorts().catch(() => ({ cohorts: [] })),
        ]);
        if (!mounted) return;
        const progs = progRes?.data?.programs || progRes?.programs || [];
        setProgramsList(progs);
        const cohs = cohortRes?.cohorts || cohortRes?.data?.cohorts || [];
        setCohortsList(cohs);
      } catch (err) {
        console.warn('Failed to load filter dropdowns', err);
      }
    }
    loadFilterOptions();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReportData(null);
    setLoadedTab(null);

    const baseParams = {};
    if (dateFrom) baseParams.dateFrom = dateFrom;
    if (dateTo) baseParams.dateTo = dateTo;

    try {
      let data = null;
      switch (activeTab) {
        case 'overview':
          data = await reportService.getOverview(selectedDivision, baseParams);
          break;
        case 'applications':
          data = await reportService.getApplications(selectedDivision, {
            ...baseParams,
            program: selectedProgram,
            status: selectedStatus,
            decision: selectedDecision,
          });
          break;
        case 'enrollments':
          data = await reportService.getEnrollments(selectedDivision, {
            ...baseParams,
            program: selectedProgram,
            cohort: selectedCohort,
            status: selectedStatus,
          });
          break;
        case 'finance':
          data = await reportService.getFinance(selectedDivision, {
            ...baseParams,
            program: selectedProgram,
          });
          break;
        case 'evaluations':
          data = await reportService.getEvaluations(selectedDivision, {
            ...baseParams,
            program: selectedProgram,
            cohort: selectedCohort,
          });
          break;
        case 'certificates':
          data = await reportService.getCertificates(selectedDivision, {
            ...baseParams,
            program: selectedProgram,
          });
          break;
        case 'notifications':
          data = await reportService.getNotifications(selectedDivision, baseParams);
          break;
        default:
          data = await reportService.getOverview(selectedDivision, baseParams);
      }
      setReportData(data);
      setLoadedTab(activeTab);
    } catch (err) {
      console.error('Failed to load report', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    selectedDivision,
    selectedProgram,
    selectedCohort,
    selectedStatus,
    selectedDecision,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Handle PDF Export (Primary institutional export)
  const handleExportPdf = async () => {
    try {
      setExporting(true);
      setExportNotice(null);
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (selectedProgram !== 'all') params.program = selectedProgram;
      if (selectedCohort !== 'all') params.cohort = selectedCohort;
      if (selectedStatus !== 'all') params.status = selectedStatus;

      const filename = await reportService.downloadExportPdf(selectedDivision, activeTab, params);
      setExportNotice(`Report successfully exported as official PDF "${filename}".`);
      setTimeout(() => setExportNotice(null), 6000);
    } catch (err) {
      console.error('Export PDF failed', err);
      alert(err.message || 'Failed to export PDF report');
    } finally {
      setExporting(false);
    }
  };

  // Handle CSV Export (Secondary fallback)
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      setExportNotice(null);
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (selectedProgram !== 'all') params.program = selectedProgram;
      if (selectedCohort !== 'all') params.cohort = selectedCohort;
      if (selectedStatus !== 'all') params.status = selectedStatus;

      const filename = await reportService.downloadExportCsv(selectedDivision, activeTab, params);
      setExportNotice(`Report successfully exported as CSV "${filename}".`);
      setTimeout(() => setExportNotice(null), 6000);
    } catch (err) {
      console.error('Export failed', err);
      alert(err.message || 'Failed to export CSV report');
    } finally {
      setExporting(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedProgram('all');
    setSelectedCohort('all');
    setSelectedStatus('all');
    setSelectedDecision('all');
    setDateFrom('');
    setDateTo('');
  };

  // Filter programs by selected division if not 'all'
  const visiblePrograms = programsList.filter(
    (p) => selectedDivision === 'all' || p.division === selectedDivision
  );
  const visibleCohorts = cohortsList.filter(
    (c) => selectedDivision === 'all' || c.division === selectedDivision
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>
            <i className="fa-solid fa-chart-pie text-primary" aria-hidden="true"></i>
            Reports &amp; Analytics
          </h1>
          <p className={styles.pageSubtitle}>
            Operational performance metrics, capacity utilization, financial records, and learning outcomes.
          </p>
        </div>

        <div className={styles.headerActions}>
          {isSuperAdmin && !params.division ? (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Division:</span>
              <select
                className="form-select form-select-sm"
                value={selectedDivision}
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  setSelectedProgram('all');
                  setSelectedCohort('all');
                }}
                style={{ width: 'auto' }}
              >
                <option value="all">All Divisions (Academy Gateway)</option>
                <option value={DIVISIONS.PRE_UNIVERSITY}>Pre-University Administration</option>
                <option value={DIVISIONS.UNIVERSITY}>University Administration</option>
              </select>
            </div>
          ) : (
            <div className={styles.scopeBadge}>
              <i className="fa-solid fa-building-columns" aria-hidden="true"></i>
              {DIVISION_LABELS[selectedDivision]
                ? `${DIVISION_LABELS[selectedDivision]} Administration`
                : selectedDivision}
            </div>
          )}

          <button
            type="button"
            id="export-report-pdf-btn"
            className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
            onClick={handleExportPdf}
            disabled={exporting || loading}
          >
            {exporting ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-file-pdf me-1" aria-hidden="true"></i>
                <span>Export PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="export-report-csv-btn"
            className="btn btn-sm btn-outline-secondary"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            title="Export CSV backup"
          >
            <i className="fa-solid fa-file-csv" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className={styles.exportSuccessAlert}>
          <span>
            <i className="fa-solid fa-circle-check me-2" aria-hidden="true"></i>
            {exportNotice}
          </span>
          <button
            type="button"
            className="btn-close btn-close-sm"
            onClick={() => setExportNotice(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className={styles.tabsNav} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => {
              setReportData(null);
              setLoadedTab(null);
              setActiveTab(tab.id);
              handleClearFilters();
            }}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true"></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dynamic Filters Bar */}
      <div className={styles.filterCard}>
        <div className={styles.filterControls}>
          <span className="fw-semibold text-muted small me-1">
            <i className="fa-solid fa-filter me-1"></i>Filters:
          </span>

          {/* Program filter (applicable to applications, enrollments, finance, evaluations, certificates) */}
          {['applications', 'enrollments', 'finance', 'evaluations', 'certificates'].includes(activeTab) && (
            <div className={styles.filterGroup}>
              <select
                className="form-select form-select-sm"
                value={selectedProgram}
                onChange={(e) => {
                  setSelectedProgram(e.target.value);
                  setSelectedCohort('all');
                }}
                style={{ maxWidth: '200px' }}
              >
                <option value="all">All Programs</option>
                {visiblePrograms.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cohort filter (applicable to enrollments, evaluations) */}
          {['enrollments', 'evaluations'].includes(activeTab) && (
            <div className={styles.filterGroup}>
              <select
                className="form-select form-select-sm"
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value)}
                style={{ maxWidth: '180px' }}
              >
                <option value="all">All Cohorts</option>
                {visibleCohorts.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.cohortNumber} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter for applications */}
          {activeTab === 'applications' && (
            <>
              <div className={styles.filterGroup}>
                <select
                  className="form-select form-select-sm"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="ELIGIBLE_PAYMENT_PENDING">Payment Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="WAITLISTED">Waitlisted</option>
                  <option value="MANUAL_REVIEW">Manual Review</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <select
                  className="form-select form-select-sm"
                  value={selectedDecision}
                  onChange={(e) => setSelectedDecision(e.target.value)}
                >
                  <option value="all">All Decisions</option>
                  <option value="ACCEPT">Accepted</option>
                  <option value="REJECT">Rejected</option>
                  <option value="WAITLIST">Waitlisted</option>
                </select>
              </div>
            </>
          )}

          {/* Status filter for enrollments */}
          {activeTab === 'enrollments' && (
            <div className={styles.filterGroup}>
              <select
                className="form-select form-select-sm"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING_PAYMENT">Pending Payment</option>
                <option value="WAITLISTED">Waitlisted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          )}

          {/* Date range inputs */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>From:</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: '135px' }}
            />
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>To:</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: '135px' }}
            />
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {(selectedProgram !== 'all' ||
            selectedCohort !== 'all' ||
            selectedStatus !== 'all' ||
            selectedDecision !== 'all' ||
            dateFrom ||
            dateTo) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={handleClearFilters}
            >
              <i className="fa-solid fa-xmark me-1"></i>Clear Filters
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={fetchReport}
            title="Refresh Report Data"
          >
            <i className="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Generating operational analytics from real database data..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchReport} />
      ) : !reportData ? (
        <EmptyState title="No data available" />
      ) : (
        <>
          {/* TAB A: OVERVIEW */}
          {activeTab === 'overview' && loadedTab === 'overview' && reportData && (
            <div className="d-flex flex-column gap-4">
              {/* StatCards KPI Grid */}
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-user-graduate"
                  title="Total Students"
                  value={(reportData.summary.totalStudents ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.activeStudents ?? 0} active`}
                  tone="default"
                />
                <StatCard
                  icon="fa-book-open"
                  title="Total Programs"
                  value={(reportData.summary.totalPrograms ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.activePrograms ?? 0} active`}
                  tone="info"
                />
                <StatCard
                  icon="fa-file-lines"
                  title="Total Applications"
                  value={(reportData.summary.totalApplications ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.acceptedApplications ?? 0} accepted · ${reportData.summary.waitlistedApplications ?? 0} waitlisted`}
                  tone="warning"
                />
                <StatCard
                  icon="fa-people-group"
                  title="Total Enrollments"
                  value={(reportData.summary.totalEnrollments ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.confirmedEnrollments ?? 0} confirmed · ${reportData.summary.pendingPayments ?? 0} pending`}
                  tone="info"
                />
                <StatCard
                  icon="fa-sack-dollar"
                  title="Total Revenue"
                  value={`${(reportData.summary.totalRevenue ?? 0).toLocaleString()} EGP`}
                  subtitle="Verified paid invoices"
                  tone="success"
                />
                <StatCard
                  icon="fa-certificate"
                  title="Certificates Issued"
                  value={(reportData.summary.certificatesIssued ?? 0).toLocaleString()}
                  subtitle="Issued credentials"
                  tone="success"
                />
              </div>

              {/* Trends & Division Breakdowns */}
              <div className={styles.chartsGrid}>
                <div className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h5 className={styles.cardTitle}>
                      <i className="fa-solid fa-chart-line text-primary"></i>
                      Applications &amp; Enrollments Activity
                    </h5>
                  </div>
                  <TrendChart
                    data={(reportData.trends || []).map((t) => ({
                      period: t.period,
                      value: t.applications,
                    }))}
                    unit="apps"
                    color="#3A6985"
                    height={150}
                  />
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h5 className={styles.cardTitle}>
                      <i className="fa-solid fa-money-bill-trend-up text-success"></i>
                      Revenue Trend (EGP)
                    </h5>
                  </div>
                  <TrendChart
                    data={(reportData.trends || []).map((t) => ({
                      period: t.period,
                      value: t.revenue,
                    }))}
                    unit="EGP"
                    color="#10b981"
                    height={150}
                  />
                </div>
              </div>

              {/* Division Breakdown (if All Divisions) */}
              {reportData.divisionBreakdown?.length > 0 && (
                <div className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h5 className={styles.cardTitle}>
                      <i className="fa-solid fa-network-wired text-secondary"></i>
                      Divisional Operational Comparison
                    </h5>
                  </div>
                  <DataTable
                    columns={[
                      {
                        key: 'division',
                        label: 'Division',
                        render: (row) => (
                          <span className="fw-semibold">
                            {DIVISION_LABELS[row.division] || row.division}
                          </span>
                        ),
                      },
                      {
                        key: 'programs',
                        label: 'Programs',
                        render: (row) => `${row.activePrograms} / ${row.programs}`,
                      },
                      { key: 'applications', label: 'Applications' },
                      {
                        key: 'enrollments',
                        label: 'Enrollments',
                        render: (row) => `${row.confirmedEnrollments} confirmed (${row.enrollments} total)`,
                      },
                      {
                        key: 'revenue',
                        label: 'Paid Revenue',
                        render: (row) => (
                          <span className="fw-bold text-success">
                            {row.revenue.toLocaleString()} EGP
                          </span>
                        ),
                      },
                      { key: 'certificates', label: 'Certificates' },
                    ]}
                    rows={reportData.divisionBreakdown}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB B: APPLICATIONS & ADMISSIONS */}
          {activeTab === 'applications' && loadedTab === 'applications' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-file-lines"
                  title="Total Applications"
                  value={(reportData.summary.total ?? 0).toLocaleString()}
                  subtitle="In selected scope"
                  tone="default"
                />
                <StatCard
                  icon="fa-circle-check"
                  title="Acceptance Rate"
                  value={`${reportData.summary.acceptanceRate ?? 0}%`}
                  subtitle={`${reportData.summary.accepted ?? 0} accepted`}
                  tone="success"
                />
                <StatCard
                  icon="fa-circle-xmark"
                  title="Rejection Rate"
                  value={`${reportData.summary.rejectionRate ?? 0}%`}
                  subtitle={`${reportData.summary.rejected ?? 0} rejected`}
                  tone="danger"
                />
                <StatCard
                  icon="fa-clock-rotate-left"
                  title="Waitlist Volume"
                  value={(reportData.summary.waitlisted ?? 0).toLocaleString()}
                  subtitle="Candidates queued"
                  tone="warning"
                />
                <StatCard
                  icon="fa-stopwatch"
                  title="Avg Decision Turnaround"
                  value={
                    reportData.summary.avgDecisionTurnaroundHours !== null && reportData.summary.avgDecisionTurnaroundHours !== undefined
                      ? `${reportData.summary.avgDecisionTurnaroundHours} hrs`
                      : 'N/A'
                  }
                  subtitle={`${reportData.summary.decisionsWithTimestampsCount ?? 0} evaluated records`}
                  tone="info"
                />
              </div>

              <div className={styles.chartsGrid}>
                <DonutChart
                  title="Applications by Status"
                  items={(reportData.byStatus || []).map((s) => ({
                    label: s.status.replace(/_/g, ' '),
                    value: s.count,
                  }))}
                  centerLabel="Total Apps"
                  centerValue={reportData.summary.total ?? 0}
                />
                <BarChart
                  title="Decision Outcomes"
                  items={(reportData.byDecision || []).map((d) => ({
                    label: d.decision,
                    value: d.count,
                    secondaryLabel: `${d.percentage}%`,
                    color:
                      d.decision === 'ACCEPT'
                        ? '#10b981'
                        : d.decision === 'REJECT'
                        ? '#ef4444'
                        : '#f59e0b',
                  }))}
                  unit="apps"
                />
              </div>

              {/* Programs Breakdown Table */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-list-check text-primary"></i>
                    Applications Breakdown by Program
                  </h5>
                </div>
                <DataTable
                  columns={[
                    {
                      key: 'title',
                      label: 'Program',
                      render: (row) => (
                        <div>
                          <div className="fw-semibold">{row.title}</div>
                          <div className="text-muted small">{row.level} · {row.division}</div>
                        </div>
                      ),
                    },
                    { key: 'total', label: 'Total Apps' },
                    {
                      key: 'accepted',
                      label: 'Accepted',
                      render: (row) => <span className="text-success fw-bold">{row.accepted}</span>,
                    },
                    {
                      key: 'rejected',
                      label: 'Rejected',
                      render: (row) => (
                        <span className={row.rejected > 0 ? 'text-danger' : 'text-muted'}>
                          {row.rejected}
                        </span>
                      ),
                    },
                    {
                      key: 'waitlisted',
                      label: 'Waitlist',
                      render: (row) => (
                        <span className={row.waitlisted > 0 ? 'text-warning' : 'text-muted'}>
                          {row.waitlisted}
                        </span>
                      ),
                    },
                    {
                      key: 'acceptanceRate',
                      label: 'Acceptance Rate',
                      render: (row) => (
                        <div className={styles.cellProgress}>
                          <span className={styles.progressText}>{row.acceptanceRate}%</span>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressBar}
                              style={{
                                width: `${Math.min(row.acceptanceRate, 100)}%`,
                                backgroundColor: '#10b981',
                              }}
                            />
                          </div>
                        </div>
                      ),
                    },
                  ]}
                  rows={reportData.byProgram || []}
                  emptyTitle="No applications found for selected criteria"
                />
              </div>
            </div>
          )}

          {/* TAB C: ENROLLMENT & CAPACITY */}
          {activeTab === 'enrollments' && loadedTab === 'enrollments' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-people-group"
                  title="Total Enrollments"
                  value={(reportData.summary.totalEnrollments ?? 0).toLocaleString()}
                  subtitle="All records in scope"
                  tone="default"
                />
                <StatCard
                  icon="fa-chair"
                  title="Occupied Capacity"
                  value={(reportData.summary.occupiedCapacity ?? 0).toLocaleString()}
                  subtitle="CONFIRMED + PENDING_PAYMENT"
                  tone="warning"
                />
                <StatCard
                  icon="fa-circle-check"
                  title="Confirmed Seats"
                  value={(reportData.summary.confirmed ?? 0).toLocaleString()}
                  subtitle="Settled enrollments"
                  tone="success"
                />
                <StatCard
                  icon="fa-hourglass-half"
                  title="Pending Payment"
                  value={(reportData.summary.pendingPayment ?? 0).toLocaleString()}
                  subtitle="Awaiting payment window"
                  tone="info"
                />
                <StatCard
                  icon="fa-gauge-high"
                  title="Capacity Utilization"
                  value={`${reportData.summary.overallUtilizationRate ?? 0}%`}
                  subtitle={`${reportData.summary.availableSeats ?? 0} seats available`}
                  tone="primary"
                />
                <StatCard
                  icon="fa-arrow-up-right-dots"
                  title="Waitlist Promotions"
                  value={(reportData.summary.waitlistPromotions ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.cancelled ?? 0} cancellations`}
                  tone="success"
                />
              </div>

              {/* Program Capacity Table */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-cubes-stacked text-primary"></i>
                    Program Capacity &amp; Seat Utilization (Phase 9 Rule)
                  </h5>
                </div>
                <DataTable
                  columns={[
                    {
                      key: 'title',
                      label: 'Program',
                      render: (row) => (
                        <div>
                          <div className="fw-semibold">{row.title}</div>
                          <div className="text-muted small">{row.division} · {row.level}</div>
                        </div>
                      ),
                    },
                    { key: 'capacity', label: 'Max Capacity' },
                    {
                      key: 'occupied',
                      label: 'Occupied',
                      render: (row) => (
                        <div>
                          <span className="fw-bold">{row.occupied}</span>
                          <span className="text-muted small">
                            {' '}
                            ({row.confirmed} conf, {row.pendingPayment} pend)
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: 'available',
                      label: 'Available',
                      render: (row) => (
                        <span className={row.available === 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}>
                          {row.available}
                        </span>
                      ),
                    },
                    {
                      key: 'waitlisted',
                      label: 'Waitlist',
                      render: (row) => (
                        <span className={row.waitlisted > 0 ? 'badge bg-warning text-dark' : 'text-muted'}>
                          {row.waitlisted}
                        </span>
                      ),
                    },
                    {
                      key: 'utilizationRate',
                      label: 'Utilization',
                      render: (row) => (
                        <div className={styles.cellProgress}>
                          <span className={styles.progressText}>{row.utilizationRate}%</span>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressBar}
                              style={{
                                width: `${Math.min(row.utilizationRate, 100)}%`,
                                backgroundColor:
                                  row.utilizationRate >= 100
                                    ? '#DF4F4C'
                                    : row.utilizationRate >= 75
                                    ? '#996814'
                                    : '#3A6985',
                              }}
                            />
                          </div>
                        </div>
                      ),
                    },
                  ]}
                  rows={reportData.byProgram || []}
                  emptyTitle="No program capacity records found"
                />
              </div>

              {/* Cohorts Delivery Breakdown */}
              {reportData.byCohort?.length > 0 && (
                <div className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h5 className={styles.cardTitle}>
                      <i className="fa-solid fa-users-rectangle text-secondary"></i>
                      Cohort Delivery &amp; Attendance Status
                    </h5>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'cohortNumber', label: 'Cohort #' },
                      { key: 'name', label: 'Cohort Name' },
                      { key: 'programTitle', label: 'Program' },
                      { key: 'capacity', label: 'Capacity' },
                      { key: 'confirmedCount', label: 'Confirmed Students' },
                      {
                        key: 'utilizationRate',
                        label: 'Capacity Fill',
                        render: (row) => `${row.utilizationRate}%`,
                      },
                      {
                        key: 'status',
                        label: 'Status',
                        render: (row) => <StatusBadge status={row.status} />,
                      },
                    ]}
                    rows={reportData.byCohort}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB D: FINANCE */}
          {activeTab === 'finance' && loadedTab === 'finance' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-file-invoice"
                  title="Total Invoiced"
                  value={`${(reportData.summary.totalInvoiced ?? 0).toLocaleString()} EGP`}
                  subtitle={`${reportData.summary.totalInvoicesCount ?? 0} invoices issued`}
                  tone="default"
                />
                <StatCard
                  icon="fa-money-bill-wave"
                  title="Paid Revenue"
                  value={`${(reportData.summary.totalPaid ?? 0).toLocaleString()} EGP`}
                  subtitle={`${reportData.summary.paidInvoicesCount ?? 0} settled invoices`}
                  tone="success"
                />
                <StatCard
                  icon="fa-receipt"
                  title="Collection Rate"
                  value={`${reportData.summary.collectionRate ?? 0}%`}
                  subtitle="Paid vs invoiced ratio"
                  tone="primary"
                />
                <StatCard
                  icon="fa-hourglass-start"
                  title="Pending Amount"
                  value={`${(reportData.summary.pendingAmount ?? 0).toLocaleString()} EGP`}
                  subtitle={`${reportData.summary.pendingCount ?? 0} unpaid invoices`}
                  tone="warning"
                />
                <StatCard
                  icon="fa-clock-rotate-left"
                  title="Expired Amount"
                  value={`${(reportData.summary.expiredAmount ?? 0).toLocaleString()} EGP`}
                  subtitle={`${reportData.summary.expiredCount ?? 0} past deadline`}
                  tone="danger"
                />
                <StatCard
                  icon="fa-credit-card"
                  title="Payment Transactions"
                  value={(reportData.summary.paymentTransactionCount ?? 0).toLocaleString()}
                  subtitle="Financial audit records"
                  tone="info"
                />
              </div>

              <div className={styles.chartsGrid}>
                <DonutChart
                  title="Payment Methods Distribution"
                  items={(reportData.byPaymentMethod || []).map((m) => ({
                    label: m.method.replace(/_/g, ' '),
                    value: m.successfulAmount,
                  }))}
                  centerLabel="Total Settled"
                  centerValue={`${((reportData.summary.totalPaid ?? 0) / 1000).toFixed(0)}k`}
                />
                <BarChart
                  title="Successful Revenue by Method (EGP)"
                  items={(reportData.byPaymentMethod || []).map((m) => ({
                    label: m.method.replace(/_/g, ' '),
                    value: m.successfulAmount,
                    secondaryLabel: `${m.successfulCount} txns`,
                    color: '#10b981',
                  }))}
                  unit="EGP"
                />
              </div>

              {/* Revenue by Program Table */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-file-invoice-dollar text-success"></i>
                    Revenue Breakdown by Program
                  </h5>
                </div>
                <DataTable
                  columns={[
                    {
                      key: 'title',
                      label: 'Program',
                      render: (row) => (
                        <div>
                          <div className="fw-semibold">{row.title}</div>
                          <div className="text-muted small">
                            {row.division} · Fee: {row.price?.toLocaleString()} EGP
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'invoicedAmount',
                      label: 'Invoiced Amount',
                      render: (row) => `${row.invoicedAmount?.toLocaleString()} EGP`,
                    },
                    {
                      key: 'paidAmount',
                      label: 'Paid Revenue',
                      render: (row) => (
                        <span className="fw-bold text-success">
                          {row.paidAmount?.toLocaleString()} EGP
                        </span>
                      ),
                    },
                    {
                      key: 'paidCount',
                      label: 'Paid Invoices',
                      render: (row) => `${row.paidCount} / ${row.invoiceCount}`,
                    },
                    {
                      key: 'pendingAmount',
                      label: 'Pending',
                      render: (row) => (
                        <span className={row.pendingAmount > 0 ? 'text-warning' : 'text-muted'}>
                          {row.pendingAmount?.toLocaleString()} EGP
                        </span>
                      ),
                    },
                    {
                      key: 'expiredAmount',
                      label: 'Expired',
                      render: (row) => (
                        <span className={row.expiredAmount > 0 ? 'text-danger' : 'text-muted'}>
                          {row.expiredAmount?.toLocaleString()} EGP
                        </span>
                      ),
                    },
                  ]}
                  rows={reportData.byProgram || []}
                  emptyTitle="No financial records found"
                />
              </div>
            </div>
          )}

          {/* TAB E: TRAINING & EVALUATION */}
          {activeTab === 'evaluations' && loadedTab === 'evaluations' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-graduation-cap"
                  title="Evaluations Recorded"
                  value={(reportData.summary.totalEvaluations ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.evaluatedCohortsCount ?? 0} cohorts evaluated`}
                  tone="default"
                />
                <StatCard
                  icon="fa-circle-check"
                  title="Passing Students"
                  value={`${reportData.summary.passRate ?? 0}%`}
                  subtitle={`${reportData.summary.passCount ?? 0} pass outcomes`}
                  tone="success"
                />
                <StatCard
                  icon="fa-circle-xmark"
                  title="Failing Outcome"
                  value={`${reportData.summary.failRate ?? 0}%`}
                  subtitle={`${reportData.summary.failCount ?? 0} fail outcomes`}
                  tone="danger"
                />
                <StatCard
                  icon="fa-chart-simple"
                  title="Average Score"
                  value={`${reportData.summary.avgScore ?? 0}%`}
                  subtitle="Across graded assignments"
                  tone="primary"
                />
                <StatCard
                  icon="fa-calendar-check"
                  title="Avg Attendance Rate"
                  value={`${reportData.summary.avgAttendanceRate ?? 0}%`}
                  subtitle="Session presence"
                  tone="info"
                />
              </div>

              <div className={styles.chartsGrid}>
                <DonutChart
                  title="Outcome Distribution"
                  items={(reportData.outcomeDistribution || []).map((o) => ({
                    label: o.outcome,
                    value: o.count,
                    color: o.outcome === 'PASS' ? '#10b981' : o.outcome === 'FAIL' ? '#ef4444' : '#f59e0b',
                  }))}
                  centerLabel="Total Evaluated"
                  centerValue={reportData.summary.totalEvaluations ?? 0}
                />
                <BarChart
                  title="Grade Score Distribution"
                  items={(reportData.scoreDistribution || []).map((s) => ({
                    label: s.range,
                    value: s.count,
                    secondaryLabel: `${s.percentage}%`,
                    color: s.range.includes('Below') ? '#DF4F4C' : '#3A6985',
                  }))}
                  unit="students"
                />
              </div>

              {/* Cohorts Evaluation Breakdown */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-chalkboard-user text-primary"></i>
                    Evaluation Outcomes by Cohort
                  </h5>
                </div>
                <DataTable
                  columns={[
                    { key: 'cohortNumber', label: 'Cohort #' },
                    { key: 'name', label: 'Cohort Name' },
                    { key: 'programTitle', label: 'Program' },
                    { key: 'total', label: 'Evaluated' },
                    {
                      key: 'passCount',
                      label: 'Passed',
                      render: (row) => <span className="text-success fw-bold">{row.passCount}</span>,
                    },
                    {
                      key: 'failCount',
                      label: 'Failed',
                      render: (row) => (
                        <span className={row.failCount > 0 ? 'text-danger' : 'text-muted'}>
                          {row.failCount}
                        </span>
                      ),
                    },
                    {
                      key: 'passRate',
                      label: 'Pass Rate',
                      render: (row) => `${row.passRate}%`,
                    },
                    {
                      key: 'avgScore',
                      label: 'Avg Score',
                      render: (row) => <span className="fw-semibold">{row.avgScore}%</span>,
                    },
                    {
                      key: 'avgAttendance',
                      label: 'Avg Attendance',
                      render: (row) => `${row.avgAttendance}%`,
                    },
                  ]}
                  rows={reportData.byCohort || []}
                  emptyTitle="No cohort evaluations found"
                />
              </div>
            </div>
          )}

          {/* TAB F: CERTIFICATES */}
          {activeTab === 'certificates' && loadedTab === 'certificates' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-certificate"
                  title="Total Certificates"
                  value={(reportData.summary.totalCertificates ?? 0).toLocaleString()}
                  subtitle="Issued credentials"
                  tone="default"
                />
                <StatCard
                  icon="fa-award"
                  title="Active (Valid)"
                  value={(reportData.summary.issuedCount ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.activeRate ?? 0}% active rate`}
                  tone="success"
                />
                <StatCard
                  icon="fa-ban"
                  title="Revoked Credentials"
                  value={(reportData.summary.revokedCount ?? 0).toLocaleString()}
                  subtitle="Academic audit actions"
                  tone="danger"
                />
              </div>

              {/* Certificates by Program Table */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-ribbon text-primary"></i>
                    Certificates Awarded by Program
                  </h5>
                </div>
                <DataTable
                  columns={[
                    {
                      key: 'title',
                      label: 'Program',
                      render: (row) => (
                        <div>
                          <div className="fw-semibold">{row.title}</div>
                          <div className="text-muted small">{row.division}</div>
                        </div>
                      ),
                    },
                    {
                      key: 'issued',
                      label: 'Valid Certificates',
                      render: (row) => <span className="text-success fw-bold">{row.issued}</span>,
                    },
                    {
                      key: 'revoked',
                      label: 'Revoked',
                      render: (row) => (
                        <span className={row.revoked > 0 ? 'text-danger' : 'text-muted'}>
                          {row.revoked}
                        </span>
                      ),
                    },
                    { key: 'total', label: 'Total Awarded' },
                  ]}
                  rows={reportData.byProgram || []}
                  emptyTitle="No certificate records found"
                />
              </div>
            </div>
          )}

          {/* TAB G: NOTIFICATIONS */}
          {activeTab === 'notifications' && loadedTab === 'notifications' && reportData && (
            <div className="d-flex flex-column gap-4">
              <div className={styles.kpiGrid}>
                <StatCard
                  icon="fa-bell"
                  title="Total Generated"
                  value={(reportData.summary.totalNotifications ?? 0).toLocaleString()}
                  subtitle="System events triggered"
                  tone="default"
                />
                <StatCard
                  icon="fa-envelope-open"
                  title="Read Count"
                  value={(reportData.summary.readCount ?? 0).toLocaleString()}
                  subtitle={`${reportData.summary.readRate ?? 0}% read rate`}
                  tone="info"
                />
                <StatCard
                  icon="fa-envelope"
                  title="Unread Count"
                  value={(reportData.summary.unreadCount ?? 0).toLocaleString()}
                  subtitle="Pending student notice"
                  tone="warning"
                />
                <StatCard
                  icon="fa-paper-plane"
                  title="Official Emails Sent"
                  value={(reportData.summary.emailSentCount ?? 0).toLocaleString()}
                  subtitle="SMTP dispatches"
                  tone="success"
                />
                <StatCard
                  icon="fa-triangle-exclamation"
                  title="Email Failures"
                  value={(reportData.summary.emailFailureCount ?? 0).toLocaleString()}
                  subtitle="Delivery failures"
                  tone={reportData.summary.emailFailureCount > 0 ? 'danger' : 'default'}
                />
              </div>

              {/* Notification Types Breakdown */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h5 className={styles.cardTitle}>
                    <i className="fa-solid fa-tags text-primary"></i>
                    Notification Dispatches by Event Type
                  </h5>
                </div>
                <DataTable
                  columns={[
                    {
                      key: 'type',
                      label: 'Event Type',
                      render: (row) => (
                        <span className="fw-semibold">{row.type.replace(/_/g, ' ')}</span>
                      ),
                    },
                    { key: 'count', label: 'Total Sent' },
                    { key: 'readCount', label: 'Read' },
                    { key: 'unreadCount', label: 'Unread' },
                    {
                      key: 'readRate',
                      label: 'Read Rate',
                      render: (row) => `${row.readRate}%`,
                    },
                  ]}
                  rows={reportData.byType || []}
                  emptyTitle="No notification events found"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
