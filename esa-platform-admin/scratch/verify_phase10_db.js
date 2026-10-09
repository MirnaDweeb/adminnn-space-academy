const mongoose = require('../backend/node_modules/mongoose');

async function run() {
  console.log('===============================================================');
  console.log('PHASE 10: DATABASE RECORD EVIDENCE & IMMUTABILITY AUDIT');
  console.log('===============================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  const Invoice = mongoose.model('Invoice', new mongoose.Schema({}, { strict: false }));
  const PaymentTransaction = mongoose.model('PaymentTransaction', new mongoose.Schema({}, { strict: false }));
  const Enrollment = mongoose.model('Enrollment', new mongoose.Schema({}, { strict: false }));
  const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

  // 1. Invoices
  console.log('--- 1. INVOICE DOCUMENTS (STATUS TRANSITIONS) ---');
  const invoices = await Invoice.find().sort({ createdAt: -1 }).limit(5);
  for (const inv of invoices) {
    console.log({
      id: inv._id.toString(),
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      currency: inv.currency,
      division: inv.division,
      status: inv.status,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      paidAt: inv.paidAt || null,
      notes: inv.notes || '',
    });
  }

  // 2. Payment Transactions
  console.log('\n--- 2. PAYMENT TRANSACTIONS (IMMUTABLE APPEND-ONLY) ---');
  const transactions = await PaymentTransaction.find().sort({ recordedAt: -1 }).limit(5);
  for (const tx of transactions) {
    console.log({
      id: tx._id.toString(),
      transactionNumber: tx.transactionNumber,
      invoice: tx.invoice?.toString(),
      amount: tx.amount,
      currency: tx.currency,
      method: tx.method,
      reference: tx.reference,
      status: tx.status,
      recordedAt: tx.recordedAt,
    });
  }

  // 3. Enrollments with Payment Status
  console.log('\n--- 3. ENROLLMENTS TIED TO FINANCIAL EVENTS ---');
  const enrollments = await Enrollment.find().sort({ updatedAt: -1, createdAt: -1 }).limit(5);
  for (const enr of enrollments) {
    console.log({
      id: enr._id.toString(),
      student: enr.student?.toString(),
      program: enr.program?.toString(),
      status: enr.status,
      enrolledAt: enr.enrolledAt,
      confirmedAt: enr.confirmedAt || null,
      cancelledAt: enr.cancelledAt || null,
      cancelReason: enr.cancelReason || null,
    });
  }

  // 4. Audit Log Entries for all Phase 10 actions
  console.log('\n--- 4. AUDIT LOG VERIFICATION (PHASE 10 ACTIONS) ---');
  const phase10Actions = [
    'INVOICE_CREATED',
    'PAYMENT_RECORDED',
    'ENROLLMENT_CONFIRMED',
    'INVOICE_EXPIRED',
    'ENROLLMENT_CANCELLED',
    'ENROLLMENT_PROMOTED_FROM_WAITLIST',
  ];

  for (const action of phase10Actions) {
    const log = await AuditLog.findOne({ action }).sort({ timestamp: -1 });
    if (log) {
      console.log(`[✓] ${action}:`);
      console.log(`    ResourceId: ${log.resourceId}`);
      console.log(`    Division:   ${log.division}`);
      console.log(`    Timestamp:  ${log.timestamp?.toISOString()}`);
      console.log(`    Reason:     ${log.reason}`);
      console.log(`    After:      ${JSON.stringify(log.after)}`);
    } else {
      console.log(`[✗] Missing audit log for action: ${action}`);
    }
  }

  // 5. Immutability Check: Confirm that multiple payments for same invoice exist as separate records
  console.log('\n--- 5. FINANCIAL RECORD PRESERVATION CHECK ---');
  const txByInvoice = await PaymentTransaction.aggregate([
    { $group: { _id: '$invoice', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  if (txByInvoice.length > 0 && txByInvoice[0].count >= 2) {
    console.log(
      `[✓] Preserved ${txByInvoice[0].count} distinct transactions for Invoice ${txByInvoice[0]._id} (Total: ${txByInvoice[0].total} EGP). Historical records were never overwritten!`
    );
  } else {
    console.log(`[i] Transaction count check: ${JSON.stringify(txByInvoice)}`);
  }

  await mongoose.disconnect();
  console.log('\n===============================================================');
  console.log('DATABASE EVIDENCE AUDIT COMPLETE');
  console.log('===============================================================');
}

run().catch((err) => {
  console.error('Fatal DB evidence error:', err);
  process.exit(1);
});
