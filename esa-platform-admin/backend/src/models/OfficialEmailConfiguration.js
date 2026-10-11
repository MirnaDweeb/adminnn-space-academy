const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../constants/notifications');

const officialEmailConfigurationSchema = new mongoose.Schema(
  {
    senderName: {
      type: String,
      default: 'Egyptian Space Agency - Academy',
      trim: true,
    },
    senderEmail: {
      type: String,
      default: 'academy-notifications@egsa.gov.eg',
      trim: true,
      lowercase: true,
    },
    globalEmailEnabled: {
      type: Boolean,
      default: true,
    },
    enabledTypes: {
      APPLICATION_DECISION: { type: Boolean, default: true },
      PAYMENT_CONFIRMED: { type: Boolean, default: true },
      PAYMENT_EXPIRED: { type: Boolean, default: true },
      ENROLLMENT_WAITLISTED: { type: Boolean, default: true },
      ENROLLMENT_PROMOTED: { type: Boolean, default: true },
      EVALUATION_PUBLISHED: { type: Boolean, default: true },
      CERTIFICATE_ISSUED: { type: Boolean, default: true },
      CERTIFICATE_REVOKED: { type: Boolean, default: true },
      GENERAL_ANNOUNCEMENT: { type: Boolean, default: true },
      STUDENT_MESSAGE: { type: Boolean, default: true },
      FEEDBACK_REMINDER: { type: Boolean, default: true },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Singleton configuration resolver.
 * Ensures an OfficialEmailConfiguration document always exists.
 */
officialEmailConfigurationSchema.statics.getOrCreateConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      senderName: process.env.EMAIL_SENDER_NAME || 'Egyptian Space Agency - Academy',
      senderEmail: process.env.EMAIL_FROM || 'academy-notifications@egsa.gov.eg',
      globalEmailEnabled: true,
      enabledTypes: {
        APPLICATION_DECISION: true,
        PAYMENT_CONFIRMED: true,
        PAYMENT_EXPIRED: true,
        ENROLLMENT_WAITLISTED: true,
        ENROLLMENT_PROMOTED: true,
        EVALUATION_PUBLISHED: true,
        CERTIFICATE_ISSUED: true,
        CERTIFICATE_REVOKED: true,
        GENERAL_ANNOUNCEMENT: true,
        STUDENT_MESSAGE: true,
        FEEDBACK_REMINDER: true,
      },
    });
  }
  return config;
};

module.exports = mongoose.model('OfficialEmailConfiguration', officialEmailConfigurationSchema);
