import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import certificateService from '../../services/api/certificateService';
import { CERTIFICATE_STATUS } from '../../constants/statuses';
import styles from './StudentCertificatesPage.module.css';

export default function StudentCertificatesPage() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');

  const fetchCertificates = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await certificateService.getMyCertificates();
      setCertificates(list);
    } catch (err) {
      setError(err.message || 'Failed to load your certificates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  const handleDownloadPdf = async (cert) => {
    try {
      const blob = await certificateService.downloadMyCertificatePdf(cert._id);
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

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/verify/${token}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(`Verification link copied! (${url})`);
    setTimeout(() => setCopySuccess(''), 3500);
  };

  if (loading) {
    return <LoadingState message="Loading your certificates & credentials..." />;
  }

  if (error && certificates.length === 0) {
    return <ErrorState message={error} onRetry={fetchCertificates} />;
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Certificates & Credentials"
        subtitle="View and download your official certificates of completion from the Egyptian Space Agency Academy. Each credential includes a public verification link."
      />

      {copySuccess && (
        <div className="alert alert-info py-2 small d-flex align-items-center gap-2" role="alert">
          <i className="fa-solid fa-circle-check"></i>
          <span>{copySuccess}</span>
        </div>
      )}

      {certificates.length === 0 ? (
        <EmptyState
          title="No Certificates Issued Yet"
          message="You do not have any issued certificates. Complete an active training cohort with passing attendance (&ge;80%) and deliverable scores (&ge;60%) to earn your verified credential."
        />
      ) : (
        <div className={styles.certGrid}>
          {certificates.map((cert) => (
            <div key={cert._id} className={styles.certCard} id={`cert-card-${cert._id}`}>
              <div className={styles.certHeader}>
                <div className="d-flex align-items-center gap-2">
                  <i className="fa-solid fa-award text-warning fa-lg"></i>
                  <span className="fw-bold small font-monospace">ESA ACADEMY</span>
                </div>
                <StatusBadge status={cert.status} />
              </div>

              <div className={styles.certBody}>
                <h4 className={styles.programTitle}>{cert.program?.title || 'Training Program'}</h4>
                <div className="text-muted small">
                  {cert.division?.replace('_', ' ')} &bull; {cert.cohort?.cohortNumber || 'Cohort'}
                </div>

                <div className={styles.serialRow}>
                  <span>SERIAL NO:</span>
                  <span className="text-primary">{cert.serialNumber}</span>
                </div>

                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Issued Date</span>
                    <span className={styles.metaValue}>
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Delivery Mode</span>
                    <span className={styles.metaValue}>
                      {cert.program?.deliveryMode || 'Onsite'}
                    </span>
                  </div>
                </div>

                {cert.status === CERTIFICATE_STATUS.REVOKED && (
                  <div className={styles.revokedNotice}>
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>This credential was officially revoked on {new Date(cert.revokedAt).toLocaleDateString()}.</span>
                  </div>
                )}
              </div>

              <div className={styles.certFooter}>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm py-1 px-2"
                    onClick={() => handleCopyLink(cert.verificationToken)}
                    title="Copy Public Verification Link"
                  >
                    <i className="fa-solid fa-share-nodes me-1"></i> Share
                  </button>
                  <Link
                    to={`/verify/${cert.verificationToken}`}
                    target="_blank"
                    className="btn btn-outline-info btn-sm py-1 px-2"
                    id={`btn-verify-student-${cert._id}`}
                    title="Verify Public Credential"
                  >
                    <i className="fa-solid fa-shield-halved me-1"></i> Verify
                  </Link>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm py-1 px-3 d-flex align-items-center gap-1"
                  onClick={() => handleDownloadPdf(cert)}
                  id={`btn-download-pdf-${cert._id}`}
                  title="Download Certificate PDF"
                >
                  <i className="fa-solid fa-file-pdf"></i>
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
