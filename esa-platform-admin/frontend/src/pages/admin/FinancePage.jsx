import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import StatCard from '../../components/common/StatCard';
import SearchBar from '../../components/common/SearchBar';
import adminService from '../../services/api/adminService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { PERMISSIONS } from '../../constants/permissions';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import { INVOICE_STATUS, PAYMENT_METHOD } from '../../constants/statuses';
import styles from './FinancePage.module.css';

export default function FinancePage() {
  const { user } = useAuth();
  const params = useParams();
  const activeDivision = params.division || ROLE_TO_DIVISION[user?.role] || 'all';

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const canManageFinance = isSuperAdmin || user?.permissions?.includes(PERMISSIONS.FINANCE_MANAGE);

  // State
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Detail Modal State
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Record Payment Modal State
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Edit Invoice Metadata Modal State
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editDueAt, setEditDueAt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Payment Adjustment Modal State
  const [adjustingTx, setAdjustingTx] = useState(null);
  const [adjustNewAmount, setAdjustNewAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState('');

  // Process Expired Sweep Modal State
  const [showSweepModal, setShowSweepModal] = useState(false);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepError, setSweepError] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = { page, limit: 15 };
      if (statusFilter) q.status = statusFilter;
      if (search.trim()) q.search = search.trim();

      const res = await adminService.listInvoices(activeDivision, q);
      setInvoices(res.data?.invoices || []);
      setPagination(res.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [activeDivision, page, statusFilter, search]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const fetchInvoiceDetail = async (id) => {
    setSelectedInvoiceId(id);
    setDetailLoading(true);
    setDetailError('');
    try {
      const res = await adminService.getInvoice(id);
      setInvoiceDetail(res);
    } catch (err) {
      setDetailError(err.message || 'Failed to load invoice details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenPaymentModal = (invoice, balance) => {
    setPayingInvoice(invoice);
    setPaymentAmount(balance != null ? balance : invoice.amount);
    setPaymentMethod('BANK_TRANSFER');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentError('');
  };

  const handleExecutePayment = async (e) => {
    e.preventDefault();
    if (!payingInvoice) return;

    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Payment amount must be greater than zero');
      return;
    }

    setPaymentLoading(true);
    setPaymentError('');
    try {
      const res = await adminService.recordPayment(payingInvoice._id, {
        amount: amt,
        method: paymentMethod,
        reference: paymentReference.trim(),
        notes: paymentNotes.trim(),
      });

      const confirmedMsg = res.isFullyPaid
        ? `Payment of ${amt} EGP recorded successfully. Invoice marked PAID and enrollment confirmed!`
        : `Partial payment of ${amt} EGP recorded. Balance remaining: ${res.invoice?.amount - res.totalPaid} EGP.`;

      setSuccessMessage(confirmedMsg);
      setPayingInvoice(null);

      // Refresh list and detail if open
      await fetchInvoices();
      if (selectedInvoiceId === payingInvoice._id) {
        await fetchInvoiceDetail(payingInvoice._id);
      }
    } catch (err) {
      setPaymentError(err.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleExecuteSweep = async () => {
    setSweepLoading(true);
    setSweepError('');
    try {
      const res = await adminService.processExpiredInvoices();
      const count = res.processedCount || 0;
      const promotedCount = res.processed?.filter((p) => p.promotedEnrollment).length || 0;
      setSuccessMessage(
        `Deadline sweep completed: ${count} expired unpaid invoice(s) released. ${promotedCount} waitlisted student(s) automatically promoted (FIFO).`
      );
      setShowSweepModal(false);
      await fetchInvoices();
    } catch (err) {
      setSweepError(err.message || 'Failed to execute deadline sweep');
    } finally {
      setSweepLoading(false);
    }
  };

  const handleOpenEditInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setEditNotes(invoice.notes || '');
    setEditDueAt(invoice.dueAt ? new Date(invoice.dueAt).toISOString().slice(0, 16) : '');
    setEditError('');
  };

  const handleSaveEditInvoice = async (e) => {
    e.preventDefault();
    if (!editingInvoice) return;
    setEditLoading(true);
    setEditError('');
    try {
      await adminService.updateInvoiceMetadata(editingInvoice._id, {
        notes: editNotes.trim(),
        dueAt: editDueAt ? new Date(editDueAt).toISOString() : undefined,
      });
      setSuccessMessage(`Invoice ${editingInvoice.invoiceNumber} metadata updated successfully.`);
      setEditingInvoice(null);
      await fetchInvoices();
      if (selectedInvoiceId === editingInvoice._id) {
        await fetchInvoiceDetail(editingInvoice._id);
      }
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update invoice');
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenAdjustTx = (tx) => {
    setAdjustingTx(tx);
    setAdjustNewAmount(tx.amount);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError('');
  };

  const handleExecuteAdjust = async (e) => {
    e.preventDefault();
    if (!adjustingTx) return;
    const newAmt = Number(adjustNewAmount);
    if (isNaN(newAmt) || newAmt < 0) {
      setAdjustError('New amount must be a non-negative number');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('Accounting reason is mandatory for payment adjustment audit trail');
      return;
    }

    setAdjustLoading(true);
    setAdjustError('');
    try {
      const res = await adminService.adjustPayment(adjustingTx._id, {
        newAmount: newAmt,
        reason: adjustReason.trim(),
        notes: adjustNotes.trim(),
      });
      setSuccessMessage(`Accounting adjustment processed. Net adjustment: ${res.netAdjustment} EGP. New invoice balance: ${res.newBalance} EGP.`);
      setAdjustingTx(null);
      await fetchInvoices();
      if (selectedInvoiceId) {
        await fetchInvoiceDetail(selectedInvoiceId);
      }
    } catch (err) {
      setAdjustError(err.response?.data?.message || err.message || 'Failed to adjust payment');
    } finally {
      setAdjustLoading(false);
    }
  };

  // Helper for deadline countdown
  const renderDeadlineIndicator = (invoice) => {
    if (invoice.status === INVOICE_STATUS.PAID) {
      return (
        <span className="badge bg-success-subtle text-success border border-success-subtle">
          <i className="fa-solid fa-check-double me-1"></i> Paid
        </span>
      );
    }
    if (invoice.status === INVOICE_STATUS.EXPIRED) {
      return (
        <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
          <i className="fa-solid fa-circle-exclamation me-1"></i> Expired
        </span>
      );
    }
    if (invoice.status === INVOICE_STATUS.CANCELLED) {
      return <span className="badge bg-secondary">Cancelled</span>;
    }

    if (!invoice.dueAt) return <span className="text-muted">—</span>;

    const diffMs = new Date(invoice.dueAt).getTime() - Date.now();
    if (diffMs <= 0) {
      return (
        <span className={`${styles.deadlineToBadge} ${styles.deadlineExpired}`}>
          <i className="fa-solid fa-triangle-exclamation"></i> Overdue (Sweep Pending)
        </span>
      );
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) {
      return (
        <span className={`${styles.deadlineToBadge} ${styles.deadlineUrgent}`} title="Expiring soon">
          <i className="fa-solid fa-clock"></i> {hours}h left
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

  // Stats calculation
  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const paidCount = invoices.filter((i) => i.status === INVOICE_STATUS.PAID).length;
  const pendingCount = invoices.filter((i) => i.status === INVOICE_STATUS.PENDING).length;
  const expiredCount = invoices.filter((i) => i.status === INVOICE_STATUS.EXPIRED).length;

  const columns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (inv) => (
        <div>
          <span className={styles.invoiceNumber}>{inv.invoiceNumber}</span>
          <div className="text-muted small">
            Issued: {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'student',
      label: 'Student',
      render: (inv) => (
        <div>
          <div className="fw-semibold text-dark">{inv.student?.fullName || 'Student'}</div>
          <div className="text-muted small">{inv.student?.email || '—'}</div>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Program',
      render: (inv) => (
        <div>
          <div className="fw-semibold text-dark">{inv.program?.title || 'Program'}</div>
          <span className="badge bg-light text-dark border" style={{ fontSize: '0.72rem' }}>
            {DIVISION_LABELS[inv.division] || inv.division}
          </span>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (inv) => (
        <div className="fw-bold text-dark">
          {Number(inv.amount || 0).toLocaleString()} {inv.currency || 'EGP'}
        </div>
      ),
    },
    {
      key: 'deadline',
      label: 'Payment Deadline',
      render: (inv) => (
        <div>
          <div style={{ fontSize: '0.8rem', color: '#475569' }}>
            {inv.dueAt ? new Date(inv.dueAt).toLocaleString() : '—'}
          </div>
          <div className="mt-1">{renderDeadlineIndicator(inv)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (inv) => (
        <div className={styles.actionBtnGroup}>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => fetchInvoiceDetail(inv._id)}
            id={`btn-view-invoice-${inv._id}`}
          >
            <i className="fa-solid fa-eye me-1" aria-hidden="true"></i> View
          </button>
          {canManageFinance && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => handleOpenEditInvoice(inv)}
              id={`btn-edit-invoice-${inv._id}`}
              title="Edit Invoice Metadata"
            >
              <i className="fa-solid fa-pen-to-square me-1" aria-hidden="true"></i> Edit
            </button>
          )}
          {inv.status === INVOICE_STATUS.PENDING && canManageFinance && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => handleOpenPaymentModal(inv, inv.amount)}
              id={`btn-record-payment-${inv._id}`}
            >
              <i className="fa-solid fa-credit-card me-1" aria-hidden="true"></i> Pay
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title={
          activeDivision && activeDivision !== 'all'
            ? `${DIVISION_LABELS[activeDivision] || activeDivision} Invoices & Finance`
            : 'Finance & Invoice Management'
        }
        subtitle="Manage billing, student invoices, manual payment settlements, and enforce 72-hour payment deadlines."
        actions={
          <button
            type="button"
            className="btn btn-outline-danger btn-sm d-flex align-items-center gap-2"
            onClick={() => {
              setSweepError('');
              setShowSweepModal(true);
            }}
            id="btn-process-expired-invoices"
          >
            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
            <span>Process Expired Invoices</span>
          </button>
        }
      />

      {successMessage && (
        <div className="alert alert-success alert-dismissible fade show py-2 px-3 mb-0" role="alert">
          <i className="fa-solid fa-circle-check me-2" aria-hidden="true"></i>
          {successMessage}
          <button
            type="button"
            className="btn-close"
            style={{ padding: '0.75rem' }}
            onClick={() => setSuccessMessage('')}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      <div className={styles.statsGrid}>
        <StatCard
          icon="fa-file-invoice-dollar"
          title="Total Invoiced"
          value={`${totalInvoiced.toLocaleString()} EGP`}
          tone="primary"
          subtitle={`${invoices.length} invoices on page`}
        />
        <StatCard
          icon="fa-circle-check"
          title="Paid Invoices"
          value={paidCount}
          tone="success"
          subtitle="Fully settled"
        />
        <StatCard
          icon="fa-hourglass-half"
          title="Pending Payment"
          value={pendingCount}
          tone="warning"
          subtitle="Awaiting payment confirmation"
        />
        <StatCard
          icon="fa-circle-xmark"
          title="Expired / Released"
          value={expiredCount}
          tone="danger"
          subtitle="Deadlines lapsed"
        />
      </div>

      {/* TOOLBAR */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchBar
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search by invoice # or notes..."
          />
        </div>
        <div className={styles.filters}>
          <label htmlFor="finance-status-filter" className="small text-secondary fw-semibold mb-0 me-1">
            Status:
          </label>
          <select
            id="finance-status-filter"
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value={INVOICE_STATUS.PENDING}>Pending</option>
            <option value={INVOICE_STATUS.PAID}>Paid</option>
            <option value={INVOICE_STATUS.EXPIRED}>Expired</option>
            <option value={INVOICE_STATUS.CANCELLED}>Cancelled</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      {loading ? (
        <LoadingState message="Loading invoices & financial records..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchInvoices} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon="fa-file-invoice"
          title="No Invoices Found"
          description="There are currently no invoices matching the selected division or filters."
        />
      ) : (
        <div className="bg-white rounded border shadow-sm p-3">
          <DataTable
            columns={columns}
            rows={invoices}
            keyField="_id"
            pagination={{
              page: pagination.page,
              totalPages: pagination.totalPages,
              totalItems: pagination.total,
              onPageChange: (p) => setPage(p),
            }}
          />
        </div>
      )}

      {/* INVOICE DETAIL MODAL */}
      {selectedInvoiceId && (
        <Modal
          isOpen={!!selectedInvoiceId}
          onClose={() => {
            setSelectedInvoiceId(null);
            setInvoiceDetail(null);
          }}
          title={
            invoiceDetail?.invoice
              ? `Invoice ${invoiceDetail.invoice.invoiceNumber}`
              : 'Invoice Details'
          }
          size="lg"
        >
          {detailLoading ? (
            <LoadingState message="Fetching invoice details and payment history..." />
          ) : detailError ? (
            <div className="alert alert-danger py-2 px-3">{detailError}</div>
          ) : invoiceDetail?.invoice ? (
            <div>
              {/* STATUS & SUMMARY HEADER */}
              <div className={styles.modalSection}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="fw-bold text-dark fs-5">
                    {invoiceDetail.invoice.invoiceNumber}
                  </div>
                  <StatusBadge status={invoiceDetail.invoice.status} />
                </div>
                <div className={styles.grid2}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Issued Date</span>
                    <span className={styles.detailValue}>
                      {new Date(invoiceDetail.invoice.issuedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Due Date</span>
                    <span className={styles.detailValue}>
                      {new Date(invoiceDetail.invoice.dueAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Division</span>
                    <span className={styles.detailValue}>
                      {DIVISION_LABELS[invoiceDetail.invoice.division] || invoiceDetail.invoice.division}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Created By</span>
                    <span className={styles.detailValue}>
                      {invoiceDetail.invoice.createdBy?.fullName || 'Admin'}
                    </span>
                  </div>
                </div>

                <div className={styles.amountBox}>
                  <div>
                    <div className={styles.detailLabel}>Invoice Total</div>
                    <div className={styles.amountPrimary}>
                      {invoiceDetail.invoice.amount.toLocaleString()} {invoiceDetail.invoice.currency}
                    </div>
                  </div>
                  <div>
                    <div className={styles.detailLabel}>Total Paid</div>
                    <div className={styles.amountPaid}>
                      {invoiceDetail.totalPaid.toLocaleString()} {invoiceDetail.invoice.currency}
                    </div>
                  </div>
                  <div>
                    <div className={styles.detailLabel}>Balance Remaining</div>
                    <div className={styles.amountBalance}>
                      {invoiceDetail.balanceRemaining.toLocaleString()} {invoiceDetail.invoice.currency}
                    </div>
                  </div>
                </div>
              </div>

              {/* STUDENT & PROGRAM DETAILS */}
              <div className={styles.modalSection}>
                <div className={styles.sectionTitle}>
                  <i className="fa-solid fa-graduation-cap"></i> Student & Program Information
                </div>
                <div className={styles.grid2}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Student Name</span>
                    <span className={styles.detailValue}>
                      {invoiceDetail.invoice.student?.fullName || '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Email / Phone</span>
                    <span className={styles.detailValue}>
                      {invoiceDetail.invoice.student?.email || '—'}
                      {invoiceDetail.invoice.student?.phone ? ` (${invoiceDetail.invoice.student.phone})` : ''}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Program Title</span>
                    <span className={styles.detailValue}>
                      {invoiceDetail.invoice.program?.title || '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Enrollment Status</span>
                    <span className={styles.detailValue}>
                      <StatusBadge status={invoiceDetail.invoice.enrollment?.status || 'PENDING_PAYMENT'} />
                    </span>
                  </div>
                </div>
              </div>

              {/* PAYMENT TRANSACTION HISTORY (APPEND-ONLY) */}
              <div className={styles.modalSection}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
                    <i className="fa-solid fa-receipt"></i> Payment History (Immutable Transactions)
                  </div>
                  {invoiceDetail.invoice.status === INVOICE_STATUS.PENDING && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm d-flex align-items-center gap-1"
                      onClick={() =>
                        handleOpenPaymentModal(invoiceDetail.invoice, invoiceDetail.balanceRemaining)
                      }
                      id="btn-detail-record-payment"
                    >
                      <i className="fa-solid fa-plus" aria-hidden="true"></i> Record Payment
                    </button>
                  )}
                </div>

                {invoiceDetail.transactions && invoiceDetail.transactions.length > 0 ? (
                  <div className={styles.tableContainer}>
                    <table className={styles.historyTable}>
                      <thead>
                        <tr>
                          <th>Txn #</th>
                          <th>Date</th>
                          <th>Type / Channel</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Reference / Gateway ID</th>
                          <th>Recorded By</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceDetail.transactions.map((tx) => (
                          <tr key={tx._id}>
                            <td className="font-monospace fw-semibold">{tx.transactionNumber}</td>
                            <td>{new Date(tx.recordedAt).toLocaleString()}</td>
                            <td>
                              <span className={`badge ${tx.recordingType === 'ONLINE' ? 'bg-primary-subtle text-primary border border-primary-subtle' : tx.recordingType === 'ADJUSTMENT' ? 'bg-warning-subtle text-warning border border-warning-subtle' : 'bg-secondary-subtle text-secondary border'}`}>
                                {tx.recordingType || 'MANUAL'}
                              </span>
                              {tx.provider && tx.provider !== 'MANUAL' && (
                                <span className="badge bg-info-subtle text-info border ms-1">{tx.provider}</span>
                              )}
                            </td>
                            <td className={`fw-bold ${tx.amount < 0 ? 'text-danger' : 'text-success'}`}>
                              {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} {tx.currency}
                            </td>
                            <td>
                              <span className="badge bg-light text-dark border">{tx.method}</span>
                            </td>
                            <td className="text-secondary small">
                              {tx.gatewayTransactionId ? (
                                <span title="Gateway Transaction ID" className="font-monospace text-dark">
                                  {tx.gatewayTransactionId}
                                </span>
                              ) : (
                                tx.reference || '—'
                              )}
                            </td>
                            <td className="small">
                              {tx.recordingType === 'ONLINE'
                                ? 'Paymob Gateway'
                                : tx.recordedBy?.fullName || 'Admin'}
                            </td>
                            <td>
                              <StatusBadge status={tx.status} />
                            </td>
                            <td>
                              {canManageFinance && tx.status === 'CONFIRMED' && tx.recordingType !== 'ONLINE' && tx.recordingType !== 'ADJUSTMENT' ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-warning btn-xs py-0 px-2 text-xs"
                                  onClick={() => handleOpenAdjustTx(tx)}
                                  title="Create accounting-safe adjustment record"
                                >
                                  <i className="fa-solid fa-scale-balanced me-1"></i> Adjust
                                </button>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-3 text-secondary" style={{ fontSize: '0.85rem' }}>
                    No payment transactions recorded yet for this invoice.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* RECORD PAYMENT MODAL */}
      {payingInvoice && (
        <Modal
          isOpen={!!payingInvoice}
          onClose={() => !paymentLoading && setPayingInvoice(null)}
          title={`Record Payment — Invoice ${payingInvoice.invoiceNumber}`}
          size="md"
        >
          <form onSubmit={handleExecutePayment}>
            <div className="alert alert-info py-2 px-3 mb-3" style={{ fontSize: '0.85rem' }}>
              <i className="fa-solid fa-circle-info me-1"></i>
              Recording a payment creates an immutable <strong>PaymentTransaction</strong> record. Settling the full invoice amount will mark the invoice <strong>PAID</strong> and automatically confirm the student's enrollment.
            </div>

            {paymentError && (
              <div className="alert alert-danger py-1 px-2 mb-3" style={{ fontSize: '0.82rem' }}>
                {paymentError}
              </div>
            )}

            <div className="mb-3">
              <label htmlFor="payment-amount-input" className="form-label small fw-semibold">
                Payment Amount (EGP) *
              </label>
              <input
                type="number"
                id="payment-amount-input"
                className="form-control form-control-sm"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="1"
                step="any"
                required
                disabled={paymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="payment-method-select" className="form-label small fw-semibold">
                Payment Method *
              </label>
              <select
                id="payment-method-select"
                className="form-select form-select-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={paymentLoading}
              >
                <option value={PAYMENT_METHOD.BANK_TRANSFER}>Bank Transfer</option>
                <option value={PAYMENT_METHOD.CASH}>Cash (Receipt)</option>
                <option value={PAYMENT_METHOD.CARD}>Credit/Debit Card (POS)</option>
                <option value={PAYMENT_METHOD.OTHER}>Other / Institutional Sponsor</option>
              </select>
            </div>

            <div className="mb-3">
              <label htmlFor="payment-reference-input" className="form-label small fw-semibold">
                Transaction Reference / Receipt #
              </label>
              <input
                type="text"
                id="payment-reference-input"
                className="form-control form-control-sm"
                placeholder="e.g. TRF-98234, Bank Deposit Slip #4421"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={paymentLoading}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="payment-notes-input" className="form-label small fw-semibold">
                Administrative Notes
              </label>
              <textarea
                id="payment-notes-input"
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional notes or teller remarks..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                disabled={paymentLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPayingInvoice(null)}
                disabled={paymentLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success btn-sm d-flex align-items-center gap-1"
                disabled={paymentLoading}
                id="btn-confirm-record-payment"
              >
                {paymentLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Recording...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check me-1" aria-hidden="true"></i> Confirm Payment
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PROCESS EXPIRED DEADLINE SWEEP MODAL */}
      {showSweepModal && (
        <ConfirmModal
          isOpen={showSweepModal}
          onClose={() => !sweepLoading && setShowSweepModal(false)}
          onConfirm={handleExecuteSweep}
          title="Process Expired Invoices (Deadline Sweep)"
          message={
            <div>
              <p className="mb-2">
                Run the administrative deadline enforcement sweep across unpaid invoices where the 72-hour payment window has lapsed.
              </p>
              <div className="alert alert-warning py-2 px-3 mb-2" style={{ fontSize: '0.82rem' }}>
                <i className="fa-solid fa-triangle-exclamation me-1"></i>
                <strong>Consequences:</strong>
                <ul className="mb-0 mt-1 ps-3">
                  <li>Unpaid invoices with <code>dueAt &lt;= now</code> will be marked <strong>EXPIRED</strong>.</li>
                  <li>Linked reserved seat enrollments will be <strong>CANCELLED</strong>.</li>
                  <li>Oldest waitlisted candidate will be <strong>automatically promoted</strong> to reserved seat (FIFO).</li>
                </ul>
              </div>
              {sweepError && (
                <div className="alert alert-danger py-1 px-2 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  {sweepError}
                </div>
              )}
            </div>
          }
          confirmText="Run Deadline Sweep"
          confirmTone="danger"
          loading={sweepLoading}
          icon="fa-clock-rotate-left"
        />
      )}

      {/* EDIT INVOICE METADATA MODAL */}
      {editingInvoice && (
        <Modal
          isOpen={!!editingInvoice}
          onClose={() => !editLoading && setEditingInvoice(null)}
          title={`Edit Invoice Metadata — ${editingInvoice.invoiceNumber}`}
          size="md"
        >
          <form onSubmit={handleSaveEditInvoice}>
            <div className="alert alert-secondary py-2 px-3 mb-3 text-xs">
              <i className="fa-solid fa-circle-info me-1"></i>
              Manage administrative invoice metadata. In compliance with accounting-safe rules, core financial amounts are immutable.
            </div>

            {editError && (
              <div className="alert alert-danger py-1 px-2 mb-3 text-xs">
                {editError}
              </div>
            )}

            {editingInvoice.status === INVOICE_STATUS.PENDING && (
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">
                  Payment Due Date &amp; Deadline
                </label>
                <input
                  type="datetime-local"
                  className="form-control form-control-sm bg-dark text-white border-secondary"
                  value={editDueAt}
                  onChange={(e) => setEditDueAt(e.target.value)}
                  disabled={editLoading}
                />
                <div className="form-text text-muted text-xs">
                  Modifying due date extends the grace period before the automated deadline sweep expires the invoice.
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Administrative Notes &amp; Remarks
              </label>
              <textarea
                className="form-control form-control-sm bg-dark text-white border-secondary"
                rows={3}
                placeholder="Internal accounting or administration notes..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={editLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-2 border-top border-secondary">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setEditingInvoice(null)}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="save-invoice-metadata-btn"
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                disabled={editLoading}
              >
                {editLoading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
                <span>Save Metadata</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ACCOUNTING-SAFE PAYMENT ADJUSTMENT MODAL */}
      {adjustingTx && (
        <Modal
          isOpen={!!adjustingTx}
          onClose={() => !adjustLoading && setAdjustingTx(null)}
          title={`Accounting Adjustment — Transaction ${adjustingTx.transactionNumber}`}
          size="md"
        >
          <form onSubmit={handleExecuteAdjust}>
            <div className="alert alert-warning py-2 px-3 mb-3 text-xs">
              <i className="fa-solid fa-shield-halved me-1"></i>
              <strong>Accounting-Safe Rule:</strong> The original payment record remains permanently immutable. An <code>ADJUSTMENT</code> transaction will be appended to the ledger, and the invoice balance and enrollment status will be safely recalculated.
            </div>

            {adjustError && (
              <div className="alert alert-danger py-1 px-2 mb-3 text-xs">
                {adjustError}
              </div>
            )}

            <div className="row g-2 mb-3">
              <div className="col-6">
                <div className="p-2 border border-secondary rounded bg-dark-eval">
                  <div className="text-secondary text-xs">Original Amount</div>
                  <div className="fw-bold text-white fs-6">
                    {adjustingTx.amount.toLocaleString()} {adjustingTx.currency || 'EGP'}
                  </div>
                </div>
              </div>
              <div className="col-6">
                <div className="p-2 border border-secondary rounded bg-dark-eval">
                  <div className="text-secondary text-xs">Net Ledger Impact</div>
                  <div className={`fw-bold fs-6 ${Number(adjustNewAmount) - adjustingTx.amount < 0 ? 'text-danger' : 'text-success'}`}>
                    {(Number(adjustNewAmount) - adjustingTx.amount >= 0 ? '+' : '')}
                    {(Number(adjustNewAmount) - adjustingTx.amount || 0).toLocaleString()} {adjustingTx.currency || 'EGP'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Corrected Target Amount (EGP) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className="form-control form-control-sm bg-dark text-white border-secondary font-monospace"
                value={adjustNewAmount}
                onChange={(e) => setAdjustNewAmount(e.target.value)}
                required
                disabled={adjustLoading}
              />
              <div className="form-text text-muted text-xs">
                Enter the corrected actual amount for this transaction. Setting to 0 reverses the transaction.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Adjustment Reason (Required for Audit Trail) *
              </label>
              <input
                type="text"
                placeholder="e.g. Bank correction, Partial refund, Clerical error adjustment"
                className="form-control form-control-sm bg-dark text-white border-secondary"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
                disabled={adjustLoading}
              />
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">
                Audit / Ledger Notes
              </label>
              <textarea
                className="form-control form-control-sm bg-dark text-white border-secondary"
                rows={2}
                placeholder="Optional detailed remarks for financial oversight..."
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                disabled={adjustLoading}
              />
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-2 border-top border-secondary">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setAdjustingTx(null)}
                disabled={adjustLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="confirm-payment-adjust-btn"
                className="btn btn-warning btn-sm d-inline-flex align-items-center gap-1 text-dark fw-semibold"
                disabled={adjustLoading}
              >
                {adjustLoading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>}
                <span>Apply Accounting Adjustment</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
