const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const OfficialEmailConfiguration = require('../models/OfficialEmailConfiguration');
const User = require('../models/User');

let transporterInstance = null;

/**
 * Returns or creates the Nodemailer transporter.
 * If SMTP environment variables are defined, creates an SMTP transporter.
 * Otherwise, falls back to a deterministic JSON/mock transporter for safe development and testing.
 */
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }

  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    transporterInstance = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  } else {
    // Development fallback: JSON transport logs emails cleanly without network failure
    transporterInstance = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporterInstance;
}

/**
 * Creates an in-app Notification record in MongoDB.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.recipient - User ID
 * @param {string} params.type - Enum value from NOTIFICATION_TYPE
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message body
 * @param {Object} [params.relatedResource] - { resourceType, resourceId }
 * @param {string} [params.division] - PRE_UNIVERSITY or UNIVERSITY
 * @returns {Promise<Notification>}
 */
async function createNotification({
  recipient,
  type,
  title,
  message,
  relatedResource = null,
  division = null,
}) {
  if (!recipient) {
    throw new Error('Notification recipient is required');
  }
  if (!type) {
    throw new Error('Notification type is required');
  }
  if (!title) {
    throw new Error('Notification title is required');
  }
  if (!message) {
    throw new Error('Notification message is required');
  }

  const notification = await Notification.create({
    recipient,
    type,
    title: title.trim(),
    message: message.trim(),
    relatedResource: relatedResource
      ? {
          resourceType: relatedResource.resourceType,
          resourceId: relatedResource.resourceId,
        }
      : null,
    division: division || null,
  });

  return notification;
}

/**
 * Sends an official notification email via Nodemailer.
 *
 * Crucial Business Rule:
 * Failures must be logged but must NOT block or roll back the underlying
 * business transaction. Notifications are a side effect, not a dependency.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.text - Plain text email content
 * @param {string} [params.html] - HTML email content
 * @param {string} [params.type] - Notification type for configuration check
 * @param {string} [params.division] - Program division
 * @param {string|ObjectId} [params.notificationId] - Associated Notification doc ID
 * @returns {Promise<Object>} Status of email attempt
 */
async function sendEmail({
  to,
  subject,
  text,
  html,
  type,
  division = null,
  notificationId = null,
}) {
  try {
    if (!to) {
      console.warn('[NotificationService:Email] No recipient email address provided. Skipping.');
      return { success: false, reason: 'NO_RECIPIENT' };
    }

    // Check configuration toggles
    const config = await OfficialEmailConfiguration.getOrCreateConfig();

    if (!config.globalEmailEnabled) {
      console.log(`[NotificationService:Email] Global email disabled. Skipping email to ${to}.`);
      return { success: false, reason: 'GLOBAL_EMAIL_DISABLED' };
    }

    if (type && config.enabledTypes && config.enabledTypes[type] === false) {
      console.log(`[NotificationService:Email] Emails disabled for type ${type}. Skipping email to ${to}.`);
      return { success: false, reason: 'TYPE_EMAIL_DISABLED' };
    }

    // Test hook for simulating email failure (required for Phase 14 testing)
    if (process.env.SIMULATE_EMAIL_FAILURE === 'true') {
      throw new Error('Simulated SMTP connection failure: Connection refused (ECONNREFUSED 127.0.0.1:25)');
    }

    const transporter = getTransporter();
    const sender = `"${config.senderName}" <${config.senderEmail}>`;

    const mailOptions = {
      from: sender,
      to,
      subject: `[ESA Academy] ${subject}`,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    };

    const info = await transporter.sendMail(mailOptions);

    if (notificationId) {
      await Notification.updateOne(
        { _id: notificationId },
        { $set: { emailSent: true, emailError: null } }
      );
    }

    console.log(
      `[NotificationService:EmailSuccess] Sent email "${subject}" to ${to} (MessageId: ${info.messageId || 'mock'})`
    );

    return {
      success: true,
      messageId: info.messageId,
      envelope: info.envelope,
    };
  } catch (err) {
    // Failure logging: application level error logging, never throwing to caller
    console.error(`[NotificationService:EmailError] Failed to send email to ${to} for type "${type}":`, err.message);

    if (notificationId) {
      try {
        await Notification.updateOne(
          { _id: notificationId },
          { $set: { emailSent: false, emailError: err.message } }
        );
      } catch (dbErr) {
        console.error('[NotificationService:EmailError] Failed to record email error on notification:', dbErr.message);
      }
    }

    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Unified dispatch helper:
 * 1. Creates the in-app Notification record.
 * 2. Asynchronously / non-blockingly dispatches the email via setImmediate.
 * 3. Never throws an error out to the caller.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.recipientId - Recipient User ID
 * @param {string} params.type - Enum value from NOTIFICATION_TYPE
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {Object} [params.relatedResource] - { resourceType, resourceId }
 * @param {string} [params.division] - PRE_UNIVERSITY or UNIVERSITY
 * @param {Object} [params.email] - { to, subject, text, html } or true
 * @returns {Promise<Object>} { notification, emailQueued }
 */
async function notifyUser({
  recipientId,
  type,
  title,
  message,
  relatedResource = null,
  division = null,
  email = null,
}) {
  let notification = null;

  try {
    notification = await createNotification({
      recipient: recipientId,
      type,
      title,
      message,
      relatedResource,
      division,
    });
  } catch (notifErr) {
    console.error('[NotificationService:InAppError] Failed to create in-app notification:', notifErr.message);
  }

  // Asynchronous non-blocking email dispatch (fire-and-forget)
  if (email) {
    setImmediate(async () => {
      try {
        let recipientEmail = typeof email === 'object' && email.to ? email.to : null;
        let studentName = typeof email === 'object' && email.studentName ? email.studentName : null;

        if (!recipientEmail) {
          const user = await User.findById(recipientId).select('email fullName');
          if (user) {
            recipientEmail = user.email;
            if (!studentName) studentName = user.fullName;
          }
        }

        if (recipientEmail) {
          const emailSubject = (typeof email === 'object' && email.subject) || title;
          const emailText = (typeof email === 'object' && email.text) || message;
          const emailHtml = (typeof email === 'object' && email.html) || null;

          await sendEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
            type,
            division,
            notificationId: notification ? notification._id : null,
          });
        }
      } catch (asyncErr) {
        console.error('[NotificationService:AsyncDispatchError]', asyncErr.message);
      }
    });
  }

  return {
    notification,
    emailQueued: !!email,
  };
}

/**
 * Standard branded HTML template wrapper for Egyptian Space Agency Academy.
 */
function wrapEmailHtml({ title, preheader = '', contentHtml, actionUrl = null, actionText = null }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 24px; text-align: center; border-bottom: 2px solid #3b82f6; }
    .logo { font-size: 20px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; }
    .subtitle { font-size: 13px; color: #93c5fd; margin-top: 4px; }
    .body { padding: 32px 24px; line-height: 1.6; color: #cbd5e1; }
    .title { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; }
    .card { background-color: #1f2937; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .btn { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 20px; text-align: center; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #64748b; background-color: #0f172a; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🛰️ EGYPTIAN SPACE AGENCY</div>
      <div class="subtitle">Academy Training Management Platform</div>
    </div>
    <div class="body">
      <div class="title">${title}</div>
      ${contentHtml}
      ${
        actionUrl && actionText
          ? `<div style="text-align: center;"><a href="${actionUrl}" class="btn">${actionText}</a></div>`
          : ''
      }
    </div>
    <div class="footer">
      This is an official automated notification from the Egyptian Space Agency Academy Training Platform.<br/>
      Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  createNotification,
  sendEmail,
  notifyUser,
  wrapEmailHtml,
};
