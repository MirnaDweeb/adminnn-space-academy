import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import certificateService from '../../services/api/certificateService';
import { CERTIFICATE_STATUS } from '../../constants/statuses';
import styles from './PublicVerifyPage.module.css';

export default function PublicVerifyPage() {
  const { token: pathToken } = useParams();
  const [searchParams] = useSearchParams();
  const queryToken = searchParams.get('token');

  const initialInput = pathToken || queryToken || '';
  const [inputVal, setInputVal] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const executeVerification = async (tokenOrSerial) => {
    if (!tokenOrSerial || !tokenOrSerial.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await certificateService.verifyCertificate(tokenOrSerial.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || 'Verification lookup failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialInput) {
      executeVerification(initialInput);
    }
  }, [initialInput]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputVal.trim()) {
      executeVerification(inputVal.trim());
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.brandLogo}>
          <i className="fa-solid fa-satellite"></i>
        </div>
        <h1 className={styles.title}>Official Credential Verification</h1>
        <p className={styles.subtitle}>
          Egyptian Space Agency Academy &bull; Institutional Certificate Registry
        </p>
      </div>

      <div className={styles.card}>
        <form onSubmit={handleSubmit} className={styles.searchForm}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Enter Verification Token or Serial Number (e.g. CERT-PRE-2026-000001)..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            id="input-public-verify"
          />
          <button type="submit" className={styles.verifyBtn} disabled={loading || !inputVal.trim()} id="btn-public-verify">
            {loading ? 'Verifying...' : 'Verify Credential'}
          </button>
        </form>

        {loading && <LoadingState message="Querying tamper-evident certificate registry..." />}

        {error && <div className="alert alert-danger p-3 mb-3">{error}</div>}

        {result && (
          <div>
            {result.found === false ? (
              <div className={styles.notFoundBadge} id="verification-not-found">
                <i className="fa-solid fa-triangle-exclamation fa-2x"></i>
                <div>
                  <div className="fw-bold">No Certificate Found</div>
                  <div className="small">
                    {result.message || 'No official credential was found matching this code.'}
                  </div>
                </div>
              </div>
            ) : result.status === CERTIFICATE_STATUS.REVOKED ? (
              <div id="verification-result-revoked">
                <div className={styles.revokedBadge}>
                  <i className="fa-solid fa-ban fa-2x"></i>
                  <div>
                    <div className="fw-bold fs-5">CERTIFICATE REVOKED</div>
                    <div className="small">
                      This institutional certificate was officially REVOKED and is no longer valid.
                    </div>
                  </div>
                </div>

                <div className={styles.resultGrid}>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Recipient</span>
                    <span className={styles.resultValue}>{result.studentName}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Program</span>
                    <span className={styles.resultValue}>{result.program?.title}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Serial Number</span>
                    <span className="font-monospace fw-bold text-danger">{result.serialNumber}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Revocation Date</span>
                    <span className="text-danger fw-bold">
                      {new Date(result.revokedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {result.revocationReason && (
                  <div className="alert alert-danger py-2 small mt-3">
                    <strong>Official Revocation Reason:</strong> {result.revocationReason}
                  </div>
                )}
              </div>
            ) : (
              <div id="verification-result-valid">
                <div className={styles.validBadge}>
                  <i className="fa-solid fa-circle-check fa-2x"></i>
                  <div>
                    <div className="fw-bold fs-5">AUTHENTIC CREDENTIAL VERIFIED</div>
                    <div className="small">
                      Officially issued and registered by the Egyptian Space Agency Academy.
                    </div>
                  </div>
                </div>

                <div className={styles.resultGrid}>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Student Name</span>
                    <span className={styles.resultValue} id="verify-student-name">{result.studentName}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Program</span>
                    <span className={styles.resultValue} id="verify-program-title">{result.program?.title}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Division</span>
                    <span className={styles.resultValue} id="verify-division">{result.division?.replace('_', ' ')}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Cohort Identifier</span>
                    <span className={styles.resultValue} id="verify-cohort">{result.cohortNumber}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Serial Number</span>
                    <span className="font-monospace fw-bold text-primary" id="verify-serial">{result.serialNumber}</span>
                  </div>
                  <div className={styles.resultItem}>
                    <span className={styles.resultLabel}>Issue Date</span>
                    <span className={styles.resultValue} id="verify-date">
                      {new Date(result.issuedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 d-flex justify-content-between align-items-center bg-light p-2 rounded border small">
                  <span className="text-muted">Credential Status:</span>
                  <StatusBadge status={result.status} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.footerNote}>
          This public registry confirms credential authenticity and awards without disclosing sensitive personal records, grades, or internal institutional identifiers.
          <div className="mt-2">
            <Link to="/login" className="text-decoration-none text-primary">
              <i className="fa-solid fa-lock me-1"></i> Authorized ESA Portal Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
