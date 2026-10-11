import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import certificateService from '../../services/api/certificateService';
import programService from '../../services/api/programService';
import {
  sendFeedbackReminder,
  retryNotificationEmail,
} from '../../services/api/notificationService';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import { CERTIFICATE_STATUS } from '../../constants/statuses';
import { PERMISSIONS, hasPermission } from '../../constants/permissions';
import styles from './CertificatesPage.module.css';

export default function CertificatesPage() {
  const { user } = useAuth();
  const params = useParams();
  const activeDivision = params.division || ROLE_TO_DIVISION[user?.role] || 'ALL';

  const [certificates, setCertificates] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [programs, setPrograms] = useState([]);

  // Detail Modal
  const [selectedCert, setSelectedCert] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Revoke Modal
  const [certToRevoke, setCertToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Restore Modal
  const [certToRestore, setCertToRestore] = useState(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');

  // Edit Metadata Modal
  const [certToEdit, setCertToEdit] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [editMetaError, setEditMetaError] = useState('');

  // Issue Certificate Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [eligibleList, setEligibleList] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  // Feedback Reminder & Email Retry State
  const [sendingReminderEvalId, setSendingReminderEvalId] = useState(null);
  const [reminderFeedback, setReminderFeedback] = useState(null);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [emailRetryFeedback, setEmailRetryFeedback] = useState(null);

  // Fetch Certificates
  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await certificateService.listCertificates({
        division: activeDivision === 'ALL' ? undefined : activeDivision,
        status: statusFilter || undefined,
        program: programFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      });

      setCertificates(res.certificates || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [activeDivision, statusFilter, programFilter, search, page]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  // Load programs dropdown
  useEffect(() => {
    async function loadPrograms() {
      try {
        const query = activeDivision === 'ALL' ? {} : { division: activeDivision };
        const res = await programService.listPrograms(query);
        setPrograms(res.programs || []);
      } catch (err) {
        console.error('Failed to load programs for filter:', err);
      }
    }
    loadPrograms();
  }, [activeDivision]);

  // Open Detail Modal
  const handleViewDetail = async (cert) => {
    setDetailLoading(true);
    try {
      const full = await certificateService.getCertificate(cert._id);
      setSelectedCert(full);
    } catch (err) {
      alert(err.message || 'Failed to load certificate detail');
    } finally {
      setDetailLoading(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async (cert) => {
    try {
      const blob = await certificateService.downloadCertificatePdf(cert._id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${cert.serialNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(err.message || 'Failed to download certificate PDF');
    }
  };

  // Trigger Revoke
  const handleOpenRevoke = (cert) => {
    setCertToRevoke(cert);
    setRevokeReason('');
    setRevokeError('');
  };

  const handleConfirmRevoke = async () => {
    if (!certToRevoke) return;
    if (!revokeReason.trim()) {
      setRevokeError('Revocation reason is required');
      return;
    }

    setRevoking(true);
    setRevokeError('');
    try {
      const res = await certificateService.revokeCertificate(certToRevoke._id, {
        reason: revokeReason.trim(),
      });
      setSuccessMessage(`Certificate ${res.data?.certificate?.serialNumber} has been officially revoked.`);
      setCertToRevoke(null);
      if (selectedCert?._id === certToRevoke._id) {
        setSelectedCert(res.data?.certificate);
      }
      fetchCertificates();
    } catch (err) {
      setRevokeError(err.message || 'Failed to revoke certificate');
    } finally {
      setRevoking(false);
    }
  };

  // Trigger Restore
  const handleOpenRestore = (cert) => {
    setCertToRestore(cert);
    setRestoreReason('');
    setRestoreError('');
  };

  const handleConfirmRestore = async () => {
    if (!certToRestore) return;
    if (!restoreReason.trim()) {
      setRestoreError('Restoration reason is required');
      return;
    }

    setRestoring(true);
    setRestoreError('');
    try {
      const res = await certificateService.restoreCertificate(certToRestore._id, {
        reason: restoreReason.trim(),
      });
      setSuccessMessage(`Certificate ${res.data?.certificate?.serialNumber} has been officially restored to active validity.`);
      setCertToRestore(null);
      if (selectedCert?._id === certToRestore._id) {
        setSelectedCert(res.data?.certificate);
      }
      fetchCertificates();
    } catch (err) {
      setRestoreError(err.message || 'Failed to restore certificate');
    } finally {
      setRestoring(false);
    }
  };

  // Trigger Edit Metadata
  const handleOpenEditMeta = (cert) => {
    setCertToEdit(cert);
    setEditNotes(cert.notes || '');
    setEditMetaError('');
  };

  const handleConfirmEditMeta = async () => {
    if (!certToEdit) return;
    setEditingMeta(true);
    setEditMetaError('');
    try {
      const res = await certificateService.updateCertificateMetadata(certToEdit._id, {
        notes: editNotes.trim(),
      });
      setSuccessMessage(`Certificate ${certToEdit.serialNumber} metadata updated successfully.`);
      setCertToEdit(null);
      if (selectedCert?._id === certToEdit._id) {
        setSelectedCert(res.data?.certificate);
      }
      fetchCertificates();
    } catch (err) {
      setEditMetaError(err.message || 'Failed to update certificate metadata');
    } finally {
      setEditingMeta(false);
    }
  };

  // Open Issue Certificate Modal
  const handleOpenIssueModal = async () => {
    setShowIssueModal(true);
    setSelectedEvalId('');
    setIssueError('');
    setEligibleError('');
    setReminderFeedback(null);
    setEligibleLoading(true);
    try {
      const eligible = await certificateService.getEligibleEvaluations({
        division: activeDivision === 'ALL' ? undefined : activeDivision,
      });
      setEligibleList(eligible || []);
      if (eligible && eligible.length === 1) {
        setSelectedEvalId(eligible[0]._id);
      }
    } catch (err) {
      setEligibleError(err.message || 'Failed to load eligible student completions');
    } finally {
      setEligibleLoading(false);
    }
  };

  // Send Feedback Reminder to Student
  const handleSendFeedbackReminder = async (evalItem) => {
    if (!evalItem?.student?._id || !evalItem?.cohort?._id) return;
    try {
      setSendingReminderEvalId(evalItem._id);
      setReminderFeedback(null);
      const res = await sendFeedbackReminder({
        studentId: evalItem.student._id,
        cohortId: evalItem.cohort._id,
      });
      setReminderFeedback({
        type: 'success',
        message: res.message || 'Feedback completion reminder sent to student.',
      });
    } catch (err) {
      setReminderFeedback({
        type: 'danger',
        message: err.response?.data?.message || err.message || 'Failed to send feedback reminder.',
      });
    } finally {
      setSendingReminderEvalId(null);
    }
  };

  // Safe retry for failed certificate email delivery
  const handleRetryCertEmail = async () => {
    if (!selectedCert?.emailDispatch?.notificationId) return;
    try {
      setRetryingEmail(true);
      setEmailRetryFeedback(null);
      const res = await retryNotificationEmail(selectedCert.emailDispatch.notificationId);
      setEmailRetryFeedback({
        type: res.success ? 'success' : 'warning',
        message: res.message || 'Email delivery re-attempted.',
      });
      const updated = await certificateService.getCertificate(selectedCert._id);
      setSelectedCert(updated);
    } catch (err) {
      setEmailRetryFeedback({
        type: 'danger',
        message: err.response?.data?.message || err.message || 'Failed to retry email delivery.',
      });
    } finally {
      setRetryingEmail(false);
    }
  };

  // Confirm and Execute Certificate Issuance
  const handleConfirmIssue = async () => {
    if (!selectedEvalId) return;
    setIssuing(true);
    setIssueError('');
    try {
      const res = await certificateService.issueCertificate(selectedEvalId);
      const serial = res.data?.certificate?.serialNumber || '';
      setSuccessMessage(`Certificate ${serial} issued successfully! Official verifiable credential created.`);
      setShowIssueModal(false);
      setSelectedEvalId('');
      fetchCertificates();
    } catch (err) {
      setIssueError(err.message || 'Failed to issue certificate');
    } finally {
      setIssuing(false);
    }
  };

  const selectedEval = eligibleList.find((e) => e._id === selectedEvalId) || null;

  const stats = {
    total: pagination.total,
    issued: certificates.filter((c) => c.status === CERTIFICATE_STATUS.ISSUED || c.status === CERTIFICATE_STATUS.RESTORED).length,
    restored: certificates.filter((c) => c.status === CERTIFICATE_STATUS.RESTORED).length,
    revoked: certificates.filter((c) => c.status === CERTIFICATE_STATUS.REVOKED).length,
  };

  const columns = [
    {
      header: 'Student',
      render: (cert) => (
        <div>
          <div className="fw-semibold text-dark">{cert.student?.fullName || 'Student'}</div>
          <div className="text-muted small">{cert.student?.email}</div>
        </div>
      ),
    },
    {
      header: 'Program & Cohort',
      render: (cert) => (
        <div>
          <div className="fw-medium text-dark">{cert.program?.title}</div>
          <div className="text-muted small">
            {cert.cohort?.cohortNumber} ({cert.division?.replace('_', ' ')})
          </div>
        </div>
      ),
    },
    {
      header: 'Serial Number',
      render: (cert) => (
        <span className={styles.serialNumber}>
          <i className="fa-solid fa-award text-warning"></i>
          {cert.serialNumber}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (cert) => <StatusBadge status={cert.status} />,
    },
    {
      header: 'Issued Date',
      render: (cert) => (
        <span className="small text-secondary">
          {new Date(cert.issuedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (cert) => (
        <div className={styles.actionsCell}>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm py-0 px-2"
            onClick={() => handleViewDetail(cert)}
            id={`btn-view-cert-${cert._id}`}
            title="View Details"
          >
            <i className="fa-solid fa-eye me-1"></i> Details
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm py-0 px-2"
            onClick={() => handleDownloadPdf(cert)}
            id={`btn-pdf-cert-${cert._id}`}
            title="Download PDF"
          >
            <i className="fa-solid fa-file-pdf text-danger me-1"></i> PDF
          </button>
          <Link
            to={`/verify/${cert.verificationToken}`}
            target="_blank"
            className="btn btn-outline-info btn-sm py-0 px-2"
            id={`btn-verify-cert-${cert._id}`}
            title="Open Public Verification Page"
          >
            <i className="fa-solid fa-shield-halved me-1"></i> Verify
          </Link>
          {hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-2"
              onClick={() => handleOpenEditMeta(cert)}
              id={`btn-edit-cert-${cert._id}`}
              title="Edit Permitted Metadata"
            >
              <i className="fa-solid fa-pen-to-square me-1"></i> Edit
            </button>
          )}
          {(cert.status === CERTIFICATE_STATUS.ISSUED || cert.status === CERTIFICATE_STATUS.RESTORED) && hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm py-0 px-2"
              onClick={() => handleOpenRevoke(cert)}
              id={`btn-revoke-cert-${cert._id}`}
              title="Revoke Certificate"
            >
              <i className="fa-solid fa-ban me-1"></i> Revoke
            </button>
          )}
          {cert.status === CERTIFICATE_STATUS.REVOKED && hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
            <button
              type="button"
              className="btn btn-outline-success btn-sm py-0 px-2"
              onClick={() => handleOpenRestore(cert)}
              id={`btn-restore-cert-${cert._id}`}
              title="Restore Mistakenly Revoked Certificate"
            >
              <i className="fa-solid fa-rotate-left me-1"></i> Restore
            </button>
          )}
        </div>
      ),
    },
  ];

  const divisionTitle =
    activeDivision === 'ALL'
      ? 'All Divisions'
      : DIVISION_LABELS[activeDivision] || activeDivision;

  return (
    <div className={styles.container}>
      <PageHeader
        title={`${divisionTitle} Certificates`}
        subtitle="Manage, verify, and revoke institutional certificates of completion. Every credential possesses an append-only audit trail and public verification token."
        actions={
          <div className="d-flex align-items-center gap-2">
            {hasPermission(user, PERMISSIONS.NOTIFICATIONS_VIEW) && (
              <Link
                to={activeDivision && activeDivision !== 'ALL' ? `/admin/${activeDivision}/notifications?template=certificate` : '/admin/notifications?template=certificate'}
                className="btn btn-outline-primary d-flex align-items-center gap-2"
                id="btn-notify-certificate-readiness"
                title="Send Certificate Notification Announcement"
              >
                <i className="fa-solid fa-bullhorn"></i>
                <span>Notify Students</span>
              </Link>
            )}
            {hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
              <button
                type="button"
                className="btn btn-primary d-flex align-items-center gap-2"
                id="btn-open-issue-certificate"
                onClick={handleOpenIssueModal}
                title="Issue Official Certificate"
              >
                <i className="fa-solid fa-award"></i>
                <span>Issue Certificate</span>
              </button>
            )}
          </div>
        }
      />

      {successMessage && (
        <div className="alert alert-success d-flex align-items-center justify-content-between p-3" role="alert">
          <div>
            <i className="fa-solid fa-circle-check me-2"></i>
            {successMessage}
          </div>
          <button type="button" className="btn-close" onClick={() => setSuccessMessage('')}></button>
        </div>
      )}

      {/* STAT CARDS */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Certificates" value={stats.total} icon="fa-certificate" />
        <StatCard label="Active / Valid" value={stats.issued} icon="fa-circle-check" />
        <StatCard label="Restored" value={stats.restored} icon="fa-rotate-left" />
        <StatCard label="Revoked" value={stats.revoked} icon="fa-ban" />
      </div>

      {/* TOOLBAR */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search by serial number, student name, email, or token..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            id="input-search-certificates"
          />
        </div>

        <div className={styles.filters}>
          <select
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            id="select-cert-status"
          >
            <option value="">All Statuses</option>
            <option value={CERTIFICATE_STATUS.ISSUED}>Issued (Valid)</option>
            <option value={CERTIFICATE_STATUS.RESTORED}>Restored (Valid)</option>
            <option value={CERTIFICATE_STATUS.REVOKED}>Revoked</option>
          </select>

          <select
            className={styles.selectInput}
            value={programFilter}
            onChange={(e) => {
              setProgramFilter(e.target.value);
              setPage(1);
            }}
            id="select-cert-program"
          >
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CERTIFICATES TABLE */}
      {loading ? (
        <LoadingState message="Loading certificates..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCertificates} />
      ) : certificates.length === 0 ? (
        <EmptyState
          title="No Certificates Found"
          message="No institutional certificates match your selected filters. Issue certificates from qualifying PASS cohort evaluations."
        />
      ) : (
        <DataTable
          columns={columns}
          data={certificates}
          pagination={pagination}
          onPageChange={(p) => setPage(p)}
          id="table-certificates"
        />
      )}

      {/* CERTIFICATE DETAIL MODAL */}
      {selectedCert && (
        <Modal
          isOpen={Boolean(selectedCert)}
          onClose={() => setSelectedCert(null)}
          title={`Certificate Credential — ${selectedCert.serialNumber}`}
          size="lg"
        >
          {selectedCert.status === CERTIFICATE_STATUS.REVOKED && (
            <div className={styles.revokedBanner}>
              <div className="fw-bold d-flex align-items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                THIS CERTIFICATE HAS BEEN OFFICIALLY REVOKED
              </div>
              <div className="small">
                <strong>Revocation Date:</strong> {new Date(selectedCert.revokedAt).toLocaleString()}
              </div>
              {selectedCert.revokedBy && (
                <div className="small">
                  <strong>Revoked By:</strong> {selectedCert.revokedBy.fullName} ({selectedCert.revokedBy.role})
                </div>
              )}
              {selectedCert.revocationReason && (
                <div className="small">
                  <strong>Reason:</strong> {selectedCert.revocationReason}
                </div>
              )}
            </div>
          )}

          {selectedCert.status === CERTIFICATE_STATUS.RESTORED && (
            <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
              <i className="fa-solid fa-rotate-left fa-lg"></i>
              <div>
                <div className="fw-bold">THIS CERTIFICATE HAS BEEN OFFICIALLY RESTORED</div>
                {selectedCert.restoredAt && (
                  <div className="small">
                    <strong>Restored Date:</strong> {new Date(selectedCert.restoredAt).toLocaleString()}
                  </div>
                )}
                {selectedCert.restoredBy && (
                  <div className="small">
                    <strong>Restored By:</strong> {selectedCert.restoredBy.fullName} ({selectedCert.restoredBy.role})
                  </div>
                )}
                {selectedCert.restoreReason && (
                  <div className="small">
                    <strong>Reason:</strong> {selectedCert.restoreReason}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedCert.notes && (
            <div className="alert alert-secondary py-2 small mb-3">
              <i className="fa-solid fa-note-sticky me-1"></i>
              <strong>Administrative Notes:</strong> {selectedCert.notes}
            </div>
          )}

          <div className={styles.detailCard}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className={styles.serialNumber}>
                <i className="fa-solid fa-award text-warning"></i>
                {selectedCert.serialNumber}
              </span>
              <StatusBadge status={selectedCert.status} />
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Student</span>
                <span className={styles.detailValue}>{selectedCert.student?.fullName}</span>
                <span className="text-muted small">{selectedCert.student?.email}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Program</span>
                <span className={styles.detailValue}>{selectedCert.program?.title}</span>
                <span className="text-muted small">{selectedCert.division?.replace('_', ' ')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Cohort</span>
                <span className={styles.detailValue}>{selectedCert.cohort?.cohortNumber}</span>
                <span className="text-muted small">{selectedCert.cohort?.name}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Issued On</span>
                <span className={styles.detailValue}>{new Date(selectedCert.issuedAt).toLocaleDateString()}</span>
                {selectedCert.issuedBy && (
                  <span className="text-muted small">by {selectedCert.issuedBy.fullName}</span>
                )}
              </div>
            </div>
          </div>

          {/* REVOCATION & RESTORATION AUDIT TIMELINE */}
          {selectedCert.revocationHistory && selectedCert.revocationHistory.length > 0 && (
            <div className={styles.detailCard}>
              <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-primary"></i>
                <span>Credential Audit & Lifecycle History</span>
              </h6>
              <div className="d-flex flex-column gap-2">
                {selectedCert.revocationHistory.map((rev, idx) => (
                  <div key={idx} className="p-2 border rounded bg-light small">
                    <div className="d-flex justify-content-between text-danger fw-semibold">
                      <span><i className="fa-solid fa-ban me-1"></i> Revocation Event #{idx + 1}</span>
                      <span>{new Date(rev.revokedAt).toLocaleString()}</span>
                    </div>
                    <div><strong>Reason:</strong> {rev.reason}</div>
                    {rev.revokedBy && <div className="text-muted">By: {rev.revokedBy?.fullName || rev.revokedBy}</div>}
                    {rev.restoredAt && (
                      <div className="mt-2 pt-2 border-top text-success">
                        <div className="fw-semibold"><i className="fa-solid fa-rotate-left me-1"></i> Restored: {new Date(rev.restoredAt).toLocaleString()}</div>
                        <div><strong>Reason:</strong> {rev.restoreReason}</div>
                        {rev.restoredBy && <div className="text-muted">By: {rev.restoredBy?.fullName || rev.restoredBy}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EVALUATION METRICS */}
          {selectedCert.evaluation && (
            <div className={styles.detailCard}>
              <h6 className="fw-bold text-dark mb-2">Qualifying Learning Outcome Metrics</h6>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Attendance Rate</span>
                  <span className="text-success fw-bold">{selectedCert.evaluation.attendanceRate}%</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Average Score</span>
                  <span className="text-success fw-bold">{selectedCert.evaluation.averageScore}%</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Outcome Status</span>
                  <StatusBadge status={selectedCert.evaluation.outcome} />
                </div>
              </div>
              <div className="text-muted small mt-2">
                <strong>Determination:</strong> {selectedCert.evaluation.outcomeReason}
              </div>
            </div>
          )}

          {/* PUBLIC VERIFICATION CREDENTIALS */}
          <div className={styles.detailCard}>
            <h6 className="fw-bold text-dark mb-2">Public Verification Credentials</h6>
            <div className="mb-2">
              <span className={styles.detailLabel}>Tamper-Evident Verification Token</span>
              <div className={styles.tokenBox}>
                <span>{selectedCert.verificationToken}</span>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2 mt-3">
              <Link
                to={`/verify/${selectedCert.verificationToken}`}
                target="_blank"
                className="btn btn-outline-info btn-sm"
              >
                <i className="fa-solid fa-arrow-up-right-from-square me-1"></i> Open Verification Link
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  const url = `${window.location.origin}/verify/${selectedCert.verificationToken}`;
                  navigator.clipboard.writeText(url);
                  alert('Verification link copied to clipboard!');
                }}
              >
                <i className="fa-solid fa-copy me-1"></i> Copy Link
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm ms-auto"
                onClick={() => handleDownloadPdf(selectedCert)}
              >
                <i className="fa-solid fa-file-pdf me-1"></i> Download PDF
              </button>
            </div>
          </div>

          {/* OFFICIAL EMAIL DISPATCH STATUS */}
          {selectedCert.emailDispatch && (
            <div className={styles.detailCard}>
              <h6 className="fw-bold text-dark mb-2 d-flex align-items-center justify-content-between">
                <span>Official Email Dispatch</span>
                {selectedCert.emailDispatch.sent ? (
                  <span className="badge bg-success-subtle text-success border border-success-subtle">
                    <i className="fa-solid fa-check me-1" /> Delivered via SMTP
                  </span>
                ) : selectedCert.emailDispatch.error ? (
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                    <i className="fa-solid fa-triangle-exclamation me-1" /> Delivery Failed
                  </span>
                ) : (
                  <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
                    In-App Only
                  </span>
                )}
              </h6>
              {selectedCert.emailDispatch.sent && selectedCert.emailDispatch.sentAt && (
                <div className="small text-muted mb-2">
                  Dispatched: {new Date(selectedCert.emailDispatch.sentAt).toLocaleString()}
                </div>
              )}
              {selectedCert.emailDispatch.error && (
                <div className="alert alert-danger py-2 small mb-2">
                  <strong>SMTP Error:</strong> {selectedCert.emailDispatch.error}
                </div>
              )}
              {emailRetryFeedback && (
                <div className={`alert alert-${emailRetryFeedback.type} py-2 small mb-2`}>
                  {emailRetryFeedback.message}
                </div>
              )}
              {!selectedCert.emailDispatch.sent && selectedCert.emailDispatch.notificationId && (
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  disabled={retryingEmail}
                  onClick={handleRetryCertEmail}
                  id="btn-retry-cert-email"
                >
                  {retryingEmail ? (
                    <i className="fa-solid fa-spinner fa-spin me-1" />
                  ) : (
                    <i className="fa-solid fa-rotate-right me-1" />
                  )}
                  Retry Certificate Email Delivery
                </button>
              )}
            </div>
          )}

          <div className="d-flex justify-content-end gap-2 mt-3">
            {hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => handleOpenEditMeta(selectedCert)}
              >
                <i className="fa-solid fa-pen-to-square me-1"></i> Edit Metadata
              </button>
            )}
            {(selectedCert.status === CERTIFICATE_STATUS.ISSUED || selectedCert.status === CERTIFICATE_STATUS.RESTORED) && hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleOpenRevoke(selectedCert)}
              >
                <i className="fa-solid fa-ban me-1"></i> Revoke Certificate
              </button>
            )}
            {selectedCert.status === CERTIFICATE_STATUS.REVOKED && hasPermission(user, PERMISSIONS.CERTIFICATES_MANAGE) && (
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => handleOpenRestore(selectedCert)}
              >
                <i className="fa-solid fa-rotate-left me-1"></i> Restore Certificate
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedCert(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* REVOKE REASON MODAL */}
      {certToRevoke && (
        <Modal
          isOpen={Boolean(certToRevoke)}
          onClose={() => {
            setCertToRevoke(null);
            setRevokeReason('');
            setRevokeError('');
          }}
          title={`Revoke Certificate — ${certToRevoke.serialNumber}`}
          size="md"
        >
          <div className="alert alert-danger small d-flex align-items-center gap-2 mb-3">
            <i className="fa-solid fa-triangle-exclamation fa-lg"></i>
            <div>
              <strong>Administrative Revocation:</strong> Revoking sets this certificate status to REVOKED and flags the public verification credential. If revoked mistakenly, authorized administrators may restore it.
            </div>
          </div>

          {revokeError && <div className="alert alert-danger py-2 small mb-3">{revokeError}</div>}

          <div className="mb-3">
            <label className="form-label fw-semibold small text-dark">
              Reason for Revocation <span className="text-danger">*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="e.g. Disciplinary breach, falsified attendance record, administrative reissue..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              id="input-revoke-reason"
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setCertToRevoke(null)}
              disabled={revoking}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleConfirmRevoke}
              disabled={revoking || !revokeReason.trim()}
              id="btn-confirm-revoke"
            >
              {revoking ? 'Revoking...' : 'Confirm Revocation'}
            </button>
          </div>
        </Modal>
      )}

      {/* RESTORE CERTIFICATE MODAL */}
      {certToRestore && (
        <Modal
          isOpen={Boolean(certToRestore)}
          onClose={() => {
            setCertToRestore(null);
            setRestoreReason('');
            setRestoreError('');
          }}
          title={`Restore Certificate — ${certToRestore.serialNumber}`}
          size="md"
        >
          <div className="alert alert-warning small d-flex align-items-center gap-2 mb-3">
            <i className="fa-solid fa-rotate-left fa-lg"></i>
            <div>
              <strong>Credential Restoration:</strong> Restoring this certificate will return its status to RESTORED (Active & Valid). The complete revocation and restoration history remains permanently preserved and auditable.
            </div>
          </div>

          {restoreError && <div className="alert alert-danger py-2 small mb-3">{restoreError}</div>}

          <div className="mb-3">
            <label className="form-label fw-semibold small text-dark">
              Reason for Restoration <span className="text-danger">*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="e.g. Administrative error corrected, disciplinary appeal approved, credential re-validated..."
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              id="input-restore-reason"
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setCertToRestore(null)}
              disabled={restoring}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handleConfirmRestore}
              disabled={restoring || !restoreReason.trim()}
              id="btn-confirm-restore"
            >
              {restoring ? 'Restoring...' : 'Confirm Restoration'}
            </button>
          </div>
        </Modal>
      )}

      {/* EDIT METADATA MODAL */}
      {certToEdit && (
        <Modal
          isOpen={Boolean(certToEdit)}
          onClose={() => {
            setCertToEdit(null);
            setEditNotes('');
            setEditMetaError('');
          }}
          title={`Edit Certificate Metadata — ${certToEdit.serialNumber}`}
          size="md"
        >
          <div className="alert alert-info small d-flex align-items-center gap-2 mb-3">
            <i className="fa-solid fa-circle-info fa-lg"></i>
            <div>
              <strong>Controlled Metadata:</strong> Serial numbers and cryptographic verification keys are immutable. You may attach administrative notes, corrections, or institutional remarks.
            </div>
          </div>

          {editMetaError && <div className="alert alert-danger py-2 small mb-3">{editMetaError}</div>}

          <div className="mb-3">
            <label className="form-label fw-semibold small text-dark">
              Administrative Notes & Remarks
            </label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Add institutional notes or corrections..."
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              id="input-cert-notes"
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setCertToEdit(null)}
              disabled={editingMeta}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleConfirmEditMeta}
              disabled={editingMeta}
              id="btn-confirm-edit-meta"
            >
              {editingMeta ? 'Saving...' : 'Save Metadata'}
            </button>
          </div>
        </Modal>
      )}

      {/* ISSUE CERTIFICATE MODAL */}
      {showIssueModal && (
        <Modal
          isOpen={showIssueModal}
          onClose={() => {
            if (!issuing) {
              setShowIssueModal(false);
              setSelectedEvalId('');
            }
          }}
          title="Issue Official Certificate"
          size="lg"
        >
          <div className="mb-3 text-secondary small">
            Issue an institutional, verifiable Egyptian Space Agency Certificate of Completion. The selected student must have successfully completed and passed their program evaluation.
          </div>

          {eligibleLoading ? (
            <LoadingState message="Loading eligible student completions..." />
          ) : eligibleError ? (
            <div className="alert alert-danger py-2 small mb-3">{eligibleError}</div>
          ) : eligibleList.length === 0 ? (
            <div className="alert alert-info d-flex align-items-center gap-2 py-3">
              <i className="fa-solid fa-circle-info fa-lg"></i>
              <div>
                <strong>No Unissued Eligible Candidates Found:</strong> All students who have passed cohort evaluations in {divisionTitle} already possess active certificates, or no cohort evaluations have been completed yet.
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <label className="form-label fw-semibold text-dark small">
                  Select Eligible Candidate / Completion <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  id="select-eligible-completion"
                  value={selectedEvalId}
                  onChange={(e) => {
                    setSelectedEvalId(e.target.value);
                    setIssueError('');
                  }}
                  disabled={issuing}
                >
                  <option value="">-- Choose an eligible completion ({eligibleList.length} candidate{eligibleList.length === 1 ? '' : 's'} available) --</option>
                  {eligibleList.map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.student?.fullName || 'Student'} ({e.student?.email}) — {e.program?.title} [{e.cohort?.cohortNumber}] · Score: {e.averageScore}%
                    </option>
                  ))}
                </select>
              </div>

              {selectedEval && (
                <div className="card border bg-light p-3 mb-3">
                  <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                    <i className="fa-solid fa-award text-warning"></i>
                    <span>Credential Verification Summary</span>
                  </h6>
                  <div className="row g-3 small">
                    <div className="col-sm-6">
                      <div className="text-secondary fw-semibold">Student:</div>
                      <div className="fw-bold text-dark">{selectedEval.student?.fullName}</div>
                      <div className="text-muted">{selectedEval.student?.email}</div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-secondary fw-semibold">Program:</div>
                      <div className="fw-bold text-dark">{selectedEval.program?.title}</div>
                      <div className="text-muted">Division: {selectedEval.division?.replace('_', ' ')} · Level: {selectedEval.program?.level}</div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-secondary fw-semibold">Cohort & Delivery:</div>
                      <div className="fw-bold text-dark">{selectedEval.cohort?.cohortNumber}</div>
                      <div className="text-muted">{selectedEval.cohort?.name}</div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-secondary fw-semibold">Completion & Eligibility:</div>
                      <div className="d-flex align-items-center gap-2 mt-1">
                        <span className="badge bg-success">PASS</span>
                        <span className="text-dark fw-medium">Score: {selectedEval.averageScore}%</span>
                        <span className="text-secondary">Attendance: {selectedEval.attendanceRate}%</span>
                      </div>
                    </div>
                    <div className="col-sm-6">
                      <div className="text-secondary fw-semibold">Program Feedback:</div>
                      <div className="d-flex align-items-center gap-2 mt-1 flex-wrap">
                        {selectedEval.feedbackCompleted ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            <i className="fa-solid fa-check me-1" />
                            Completed {selectedEval.feedbackSubmittedAt ? `(${new Date(selectedEval.feedbackSubmittedAt).toLocaleDateString()})` : ''}
                          </span>
                        ) : (
                          <>
                            <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
                              <i className="fa-solid fa-clock me-1" />
                              Feedback Pending
                            </span>
                            <button
                              type="button"
                              className="btn btn-outline-warning btn-sm py-0 px-2"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => handleSendFeedbackReminder(selectedEval)}
                              disabled={sendingReminderEvalId === selectedEval._id}
                              title="Send personalized feedback completion reminder to student"
                            >
                              {sendingReminderEvalId === selectedEval._id ? (
                                <i className="fa-solid fa-spinner fa-spin me-1" />
                              ) : (
                                <i className="fa-solid fa-bell me-1" />
                              )}
                              Send Reminder
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="col-12 pt-2 border-top">
                      <div className="text-secondary fw-semibold">Certificate Type:</div>
                      <div className="fw-bold text-dark d-flex align-items-center gap-2 mt-1">
                        <i className="fa-solid fa-file-shield text-info"></i>
                        <span>Official Certificate of Completion (Verifiable Institutional Credential)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reminderFeedback && (
                <div className={`alert alert-${reminderFeedback.type} py-2 px-3 small mb-3`}>
                  <i
                    className={`fa-solid ${
                      reminderFeedback.type === 'success'
                        ? 'fa-circle-check text-success'
                        : 'fa-circle-exclamation text-danger'
                    } me-2`}
                  />
                  {reminderFeedback.message}
                </div>
              )}

              <div className="alert alert-warning small d-flex align-items-center gap-2 mb-3">
                <i className="fa-solid fa-shield-halved fa-lg"></i>
                <div>
                  <strong>Institutional Confirmation:</strong> Issuing this credential will assign an immutable serial number, generate tamper-evident public verification credentials, and immediately send an official notification to the student.
                </div>
              </div>
            </div>
          )}

          {issueError && (
            <div className="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
              <i className="fa-solid fa-circle-exclamation"></i>
              <div>{issueError}</div>
            </div>
          )}

          <div className="d-flex justify-content-end gap-2 pt-3 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setShowIssueModal(false);
                setSelectedEvalId('');
              }}
              disabled={issuing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm d-flex align-items-center gap-2"
              id="btn-confirm-issue-certificate"
              onClick={handleConfirmIssue}
              disabled={!selectedEvalId || issuing}
            >
              {issuing ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  <span>Issuing Certificate...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-award"></i>
                  <span>Issue Certificate</span>
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
