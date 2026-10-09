const mongoose = require('mongoose');
const {
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  PAYMENT_RECORDING_TYPE,
  PAYMENT_PROVIDER,
} = require('../constants/statuses');

// PaymentTransaction represents an immutable financial record.
// Historical financial records must never be mutated or overwritten;
// corrections are made by voiding and recording new transactions.
// Supports both MANUAL (admin-entered) and ONLINE (gateway/Paymob) transactions.
const paymentTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'EGP',
      uppercase: true,
      trim: true,
    },
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: true,
    },
    reference: {
      type: String,
      trim: true,
      default: '',
    },
    recordingType: {
      type: String,
      enum: Object.values(PAYMENT_RECORDING_TYPE),
      default: PAYMENT_RECORDING_TYPE.MANUAL,
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(PAYMENT_PROVIDER),
      default: PAYMENT_PROVIDER.MANUAL,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    gatewayOrderId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    gatewayReference: {
      type: String,
      trim: true,
      default: '',
    },
    paymentAttemptId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.RECORDED,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ invoice: 1, recordedAt: -1 });
paymentTransactionSchema.index({ enrollment: 1, recordedAt: -1 });
paymentTransactionSchema.index({ recordingType: 1, status: 1 });
paymentTransactionSchema.index({ provider: 1, gatewayTransactionId: 1 });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
