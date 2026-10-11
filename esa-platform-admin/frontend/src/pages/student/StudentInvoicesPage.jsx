import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import paymentService from '../../services/api/paymentService';
import { INVOICE_STATUS, ENROLLMENT_STATUS } from '../../constants/statuses';
import styles from './StudentInvoicesPage.module.css';

export default function StudentInvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Checkout Initiation Modal State
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [initiating, setInitiating] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');

  // Sandbox simulation payment state
  const [simulating, setSimulating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await paymentService.getStudentInvoices();
      setInvoices(Array.isArray(data) ? data : data?.invoices || []);
    } catch (err) {
      setError(err.message || 'Failed to load your invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleOpenPayModal = (invoice) => {
    setSelectedInvoice(invoice);
    setCheckoutData(null);
    setCheckoutError('');
  };

  const handleInitiateCheckout = async () => {
    if (!selectedInvoice || !selectedInvoice.enrollment) return;
    setInitiating(true);
    setCheckoutError('');
    try {
      const res = await paymentService.initiateOnlinePayment(selectedInvoice.enrollment._id);
      setCheckoutData(res);
    } catch (err) {
      setCheckoutError(err.message || 'Failed to initiate Paymob checkout');
    } finally {
      setInitiating(false);
    }
  };

  const handleSimulatePayment = async (isSuccess) => {
    if (!checkoutData) return;
    setSimulating(true);
    try {
      const simTxId = Math.floor(10000000 + Math.random() * 90000000);
      const simOrderId = checkoutData.gatewayOrderId || Math.floor(10000000 + Math.random() * 90000000);

      await paymentService.simulateSandboxPayment({
        transactionNumber: checkoutData.transactionNumber,
        gatewayTransactionId: simTxId,
        gatewayOrderId: simOrderId,
        // amountCents intentionally omitted — derived server-side from the invoice
        success: isSuccess,
      });

      // Redirect to return page with verification query params
      navigate(`/student/payments/return?id=${simTxId}&order=${simOrderId}&success=${isSuccess}&amount_cents=${Math.round(checkoutData.amount * 100)}&enrollmentId=${selectedInvoice.enrollment._id}`);
    } catch (err) {
      // Provide a clear, user-friendly message for 404 (production/unavailable) and 403 (access denied)
      const status = err?.response?.status;
      if (status === 404 || status === 403) {
        setCheckoutError('Sandbox payments are not available in this environment. Please contact your administrator.');
      } else {
        setCheckoutError(err.message || 'Payment simulation failed');
      }
      setSimulating(false);
    }
  };

  const renderDeadlineIndicator = (invoice) => {
    if (invoice.status === INVOICE_STATUS.PAID) {
      return (
        <span className="badge bg-success-subtle text-success border border-success-subtle">
          <i className="fa-solid fa-check-double me-1"></i> Paid & Settled
        </span>
      );
    }
    if (invoice.status === INVOICE_STATUS.EXPIRED) {
      return (
        <span className={`${styles.deadlineToBadge} ${styles.deadlineExpired}`}>
          <i className="fa-solid fa-circle-exclamation"></i> Deadline Expired
        </span>
      );
    }
    if (!invoice.dueAt) return <span className="text-muted">—</span>;

    const diffMs = new Date(invoice.dueAt).getTime() - Date.now();
    if (diffMs <= 0) {
      return (
        <span className={`${styles.deadlineToBadge} ${styles.deadlineExpired}`}>
          <i className="fa-solid fa-triangle-exclamation"></i> Overdue
        </span>
      );
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) {
      return (
        <span className={`${styles.deadlineToBadge} ${styles.deadlineUrgent}`} title="Expiring soon">
          <i className="fa-solid fa-clock"></i> {hours}h remaining!
        </span>
      );
    }

    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return (
      <span className={`${styles.deadlineToBadge} ${styles.deadlineSafe}`}>
        <i className="fa-regular fa-clock"></i> {days}d {remHours}h left
      </span>
    );
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Invoices & Online Payments"
        subtitle="View your space training program fees, 72-hour reservation deadlines, and complete online checkout."
      />

      {loading ? (
        <LoadingState message="Loading your invoices & billing status..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchInvoices} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon="fa-file-invoice-dollar"
          title="No Invoices Found"
          description="You currently have no program invoices issued for payment."
        />
      ) : (
        <div>
          {invoices.map((inv) => {
            const isEligibleToPay =
              inv.status === INVOICE_STATUS.PENDING &&
              inv.enrollment?.status === ENROLLMENT_STATUS.PENDING_PAYMENT &&
              (!inv.dueAt || new Date(inv.dueAt) > new Date());

            return (
              <div key={inv._id} className={styles.invoiceCard}>
                <div className={styles.invoiceHeader}>
                  <div>
                    <div className={styles.invoiceNumber}>{inv.invoiceNumber}</div>
                    <div className={styles.programTitle}>{inv.program?.title || 'Training Program'}</div>
                    <span className="badge bg-light text-dark border">
                      {inv.division ? inv.division.replace(/_/g, ' ') : 'PRE UNIVERSITY'}
                    </span>
                  </div>
                  <div className="text-end">
                    <StatusBadge status={inv.status} />
                    <div className="mt-2">{renderDeadlineIndicator(inv)}</div>
                  </div>
                </div>

                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Invoice Amount</span>
                    <div className={styles.amountBox}>
                      <span className={styles.amountValue}>
                        {Number(inv.amount || 0).toLocaleString()}
                      </span>
                      <span className={styles.amountCurrency}>{inv.currency || 'EGP'}</span>
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Issued Date</span>
                    <span className={styles.detailValue}>
                      {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Payment Deadline</span>
                    <span className={styles.detailValue}>
                      {inv.dueAt ? new Date(inv.dueAt).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Enrollment Status</span>
                    <span className={styles.detailValue}>
                      <StatusBadge status={inv.enrollment?.status || 'PENDING_PAYMENT'} />
                    </span>
                  </div>
                </div>

                {/* ACTION SECTION */}
                <div className={styles.actionSection}>
                  <div className="text-secondary small">
                    {inv.status === INVOICE_STATUS.PAID ? (
                      <span className="text-success fw-semibold">
                        <i className="fa-solid fa-circle-check me-1"></i> Payment confirmed on{' '}
                        {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : 'recently'}. Your seat is confirmed!
                      </span>
                    ) : inv.status === INVOICE_STATUS.EXPIRED ? (
                      <span className="text-danger fw-semibold">
                        <i className="fa-solid fa-circle-xmark me-1"></i> Payment window lapsed. The reserved seat has been released.
                      </span>
                    ) : (
                      <span>
                        <i className="fa-solid fa-shield-halved me-1 text-primary"></i>
                        Payments processed securely via Paymob Accept (Visa, MasterCard, Meeza, Mobile Wallets).
                      </span>
                    )}
                  </div>

                  {isEligibleToPay && (
                    <button
                      type="button"
                      className={styles.payNowBtn}
                      onClick={() => handleOpenPayModal(inv)}
                      id={`btn-pay-now-${inv._id}`}
                    >
                      <i className="fa-solid fa-credit-card"></i> Pay Now (Online Checkout)
                    </button>
                  )}
                </div>

                {/* PAYMENT TRANSACTION HISTORY (IMMUTABLE) */}
                {inv.transactions && inv.transactions.length > 0 && (
                  <div className={styles.transactionsTableWrap}>
                    <div className="p-2 bg-light border-bottom fw-semibold small text-secondary">
                      <i className="fa-solid fa-clock-rotate-left me-1"></i> Transaction History ({inv.transactions.length})
                    </div>
                    <table className={`table ${styles.transactionsTable}`}>
                      <thead>
                        <tr>
                          <th>Txn Reference</th>
                          <th>Type & Provider</th>
                          <th>Method</th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.transactions.map((tx, idx) => (
                          <tr key={tx._id || idx}>
                            <td className="font-monospace fw-semibold">{tx.transactionNumber}</td>
                            <td>
                              <span
                                className={`badge ${
                                  tx.recordingType === 'ONLINE'
                                    ? 'bg-primary-subtle text-primary border border-primary-subtle'
                                    : 'bg-secondary-subtle text-secondary border'
                                }`}
                              >
                                {tx.recordingType || 'MANUAL'} &middot; {tx.provider || 'ADMIN'}
                              </span>
                            </td>
                            <td>{tx.method}</td>
                            <td className="fw-bold">{Number(tx.amount || 0).toLocaleString()} {tx.currency || 'EGP'}</td>
                            <td>{new Date(tx.recordedAt || Date.now()).toLocaleString()}</td>
                            <td><StatusBadge status={tx.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ONLINE CHECKOUT MODAL */}
      {selectedInvoice && (
        <Modal
          isOpen={!!selectedInvoice}
          onClose={() => {
            setSelectedInvoice(null);
            setCheckoutData(null);
          }}
          title="Online Program Payment Checkout"
          size="md"
        >
          <div>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.88rem' }}>
              <i className="fa-solid fa-satellite-dish me-2"></i>
              You are completing payment for: <strong>{selectedInvoice.program?.title}</strong>
            </div>

            {checkoutError && (
              <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
                {checkoutError}
              </div>
            )}

            {!checkoutData ? (
              <div>
                <div className="d-flex justify-content-between align-items-center py-2 border-bottom mb-2">
                  <span className="text-secondary">Invoice Number</span>
                  <span className="font-monospace fw-bold">{selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2 border-bottom mb-2">
                  <span className="text-secondary">Amount Due</span>
                  <span className="fs-5 fw-bold text-success">
                    {Number(selectedInvoice.amount || 0).toLocaleString()} {selectedInvoice.currency || 'EGP'}
                  </span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2 border-bottom mb-3">
                  <span className="text-secondary">Payment Deadline</span>
                  <span className="text-dark fw-semibold">
                    {selectedInvoice.dueAt ? new Date(selectedInvoice.dueAt).toLocaleString() : '—'}
                  </span>
                </div>

                <div className="p-3 bg-light rounded border mb-4">
                  <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.9rem' }}>
                    <i className="fa-solid fa-lock text-success me-1"></i> Paymob Secure Payment Gateway
                  </div>
                  <p className="text-secondary small mb-2">
                    Clicking continue will create a secure Paymob payment session. You will be redirected to complete your payment using:
                  </p>
                  <div className="d-flex gap-2">
                    <span className="badge bg-white text-dark border"><i className="fa-brands fa-cc-visa text-primary me-1"></i> Visa</span>
                    <span className="badge bg-white text-dark border"><i className="fa-brands fa-cc-mastercard text-danger me-1"></i> MasterCard</span>
                    <span className="badge bg-white text-dark border"><i className="fa-solid fa-mobile-screen-button text-success me-1"></i> Mobile Wallet</span>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedInvoice(null)}
                    disabled={initiating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                    onClick={handleInitiateCheckout}
                    disabled={initiating}
                    id="btn-confirm-proceed-paymob"
                  >
                    {initiating ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                        Connecting to Paymob...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-arrow-right me-1"></i> Proceed to Paymob Checkout
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Paymob Checkout Gateway Ready */
              <div>
                <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-solid fa-circle-check me-1"></i> Secure Paymob order registered! (Ref: <code>{checkoutData.transactionNumber}</code>)
                </div>

                <div className="p-3 bg-light rounded border text-center mb-3">
                  <div className="fw-bold text-dark mb-1">Paymob Gateway Sandbox Simulation</div>
                  <p className="text-secondary small mb-3">
                    Simulate card authorization or decline in sandbox mode:
                  </p>
                  <div className="d-flex justify-content-center gap-2">
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={() => handleSimulatePayment(true)}
                      disabled={simulating}
                      id="btn-sandbox-pay-approve"
                    >
                      {simulating ? 'Processing...' : 'Simulate Card Approval (Success)'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleSimulatePayment(false)}
                      disabled={simulating}
                      id="btn-sandbox-pay-decline"
                    >
                      Simulate Card Decline (Failure)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
