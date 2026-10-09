import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import paymentService from '../../services/api/paymentService';
import StatusBadge from '../../components/common/StatusBadge';
import { INVOICE_STATUS, ENROLLMENT_STATUS } from '../../constants/statuses';
import styles from './PaymentReturnPage.module.css';

export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentData, setPaymentData] = useState(null);

  const gatewayTxId = searchParams.get('id');
  const gatewayOrderId = searchParams.get('order');
  const successParam = searchParams.get('success');
  const enrollmentIdParam = searchParams.get('enrollmentId');

  useEffect(() => {
    let isMounted = true;

    async function verifyWithBackend() {
      setLoading(true);
      setError('');
      try {
        let enrollmentId = enrollmentIdParam;

        // If enrollmentId not provided in query, find from student's invoices
        if (!enrollmentId) {
          const studentInvoices = await paymentService.getStudentInvoices();
          if (studentInvoices && studentInvoices.length > 0) {
            // Find invoice matching gatewayOrderId or latest invoice
            const matched = studentInvoices.find(
              (inv) =>
                inv.transactions?.some(
                  (t) =>
                    String(t.gatewayTransactionId) === String(gatewayTxId) ||
                    String(t.gatewayOrderId) === String(gatewayOrderId)
                )
            );
            enrollmentId = matched ? matched.enrollment?._id : studentInvoices[0]?.enrollment?._id;
          }
        }

        if (!enrollmentId) {
          throw new Error('Unable to identify corresponding enrollment for verification.');
        }

        // Query authoritative backend verification state
        const statusRes = await paymentService.getPaymentStatus(enrollmentId);
        if (isMounted) {
          setPaymentData(statusRes);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to verify payment status with server');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verifyWithBackend();

    return () => {
      isMounted = false;
    };
  }, [gatewayTxId, gatewayOrderId, enrollmentIdParam]);

  // Loading state: Verifying Payment...
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={`${styles.iconCircle} ${styles.iconPending}`}>
            <i className="fa-solid fa-spinner fa-spin"></i>
          </div>
          <h2 className={styles.title}>Verifying Payment...</h2>
          <p className={styles.subtitle}>
            Please wait while Space Academy verifies the payment transaction with the gateway.
          </p>
          <div className="spinner-border text-primary my-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state during verification
  if (error && !paymentData) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={`${styles.iconCircle} ${styles.iconFailed}`}>
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 className={styles.title}>Verification Error</h2>
          <p className={styles.subtitle}>{error}</p>
          <div className={styles.actions}>
            <Link to="/student/invoices" className="btn btn-primary">
              <i className="fa-solid fa-file-invoice me-1"></i> Return to Invoices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { enrollment, invoice, transactions = [] } = paymentData || {};
  const isInvoicePaid = invoice?.status === INVOICE_STATUS.PAID;
  const isEnrollmentConfirmed = enrollment?.status === ENROLLMENT_STATUS.CONFIRMED;
  const isExpired = invoice?.status === INVOICE_STATUS.EXPIRED || enrollment?.status === ENROLLMENT_STATUS.CANCELLED;

  // Find latest transaction
  const latestTx = transactions[0];

  // Determine actual server-verified state
  let pageState = 'FAILED';
  if (isInvoicePaid && isEnrollmentConfirmed) {
    pageState = 'SUCCESS';
  } else if (isExpired) {
    pageState = 'EXPIRED';
  } else if (latestTx?.status === 'PENDING') {
    pageState = 'PENDING';
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* SUCCESS */}
        {pageState === 'SUCCESS' && (
          <>
            <div className={`${styles.iconCircle} ${styles.iconSuccess}`}>
              <i className="fa-solid fa-check"></i>
            </div>
            <h2 className={styles.title}>Payment Successful!</h2>
            <p className={styles.subtitle}>
              Your payment has been verified by the Egyptian Space Agency payment gateway. Your
              enrollment is now officially confirmed!
            </p>

            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Invoice Number</span>
                <span className={styles.value}>{invoice?.invoiceNumber}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Amount Paid</span>
                <span className={styles.value}>
                  {invoice?.amount?.toLocaleString()} {invoice?.currency || 'EGP'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Enrollment Status</span>
                <span className={styles.value}>
                  <StatusBadge status={enrollment?.status || ENROLLMENT_STATUS.CONFIRMED} />
                </span>
              </div>
              {latestTx?.gatewayTransactionId && (
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Gateway Reference</span>
                  <span className={styles.value}>{latestTx.gatewayTransactionId}</span>
                </div>
              )}
              {invoice?.paidAt && (
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Settlement Date</span>
                  <span className={styles.value}>
                    {new Date(invoice.paidAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <Link to="/student/invoices" className="btn btn-outline-secondary">
                <i className="fa-solid fa-file-invoice me-1"></i> View Invoices
              </Link>
              <Link to="/student/dashboard" className="btn btn-primary">
                <i className="fa-solid fa-graduation-cap me-1"></i> Go to Dashboard
              </Link>
            </div>
          </>
        )}

        {/* PENDING */}
        {pageState === 'PENDING' && (
          <>
            <div className={`${styles.iconCircle} ${styles.iconPending}`}>
              <i className="fa-solid fa-clock-rotate-left"></i>
            </div>
            <h2 className={styles.title}>Payment Pending Authorization</h2>
            <p className={styles.subtitle}>
              Your payment is currently being authorized by the card network or mobile wallet provider.
              Once confirmed, your invoice will be settled automatically.
            </p>
            <div className={styles.actions}>
              <Link to="/student/invoices" className="btn btn-primary">
                <i className="fa-solid fa-file-invoice me-1"></i> View Invoice Status
              </Link>
            </div>
          </>
        )}

        {/* EXPIRED */}
        {pageState === 'EXPIRED' && (
          <>
            <div className={`${styles.iconCircle} ${styles.iconFailed}`}>
              <i className="fa-solid fa-calendar-xmark"></i>
            </div>
            <h2 className={styles.title}>Payment Deadline Expired</h2>
            <p className={styles.subtitle}>
              The 72-hour payment window for this enrollment invoice has expired and the reserved seat
              has been released to the waiting list.
            </p>
            <div className={styles.actions}>
              <Link to="/student/invoices" className="btn btn-secondary">
                <i className="fa-solid fa-file-invoice me-1"></i> Back to Invoices
              </Link>
            </div>
          </>
        )}

        {/* FAILED */}
        {pageState === 'FAILED' && (
          <>
            <div className={`${styles.iconCircle} ${styles.iconFailed}`}>
              <i className="fa-solid fa-xmark"></i>
            </div>
            <h2 className={styles.title}>Payment Failed or Cancelled</h2>
            <p className={styles.subtitle}>
              Your payment attempt could not be completed. Your enrollment seat remains reserved until
              the payment deadline. You may try again with another card or wallet.
            </p>

            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Invoice Number</span>
                <span className={styles.value}>{invoice?.invoiceNumber || '—'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Amount Due</span>
                <span className={styles.value}>
                  {invoice?.amount?.toLocaleString()} {invoice?.currency || 'EGP'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.label}>Invoice Status</span>
                <span className={styles.value}>
                  <StatusBadge status={invoice?.status || INVOICE_STATUS.PENDING} />
                </span>
              </div>
            </div>

            <div className={styles.actions}>
              <Link to="/student/invoices" className="btn btn-primary">
                <i className="fa-solid fa-rotate-left me-1"></i> Retry Payment
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
