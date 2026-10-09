const mongoose = require('../backend/node_modules/mongoose');
const Notification = require('../backend/src/models/Notification');
const OfficialEmailConfiguration = require('../backend/src/models/OfficialEmailConfiguration');
const User = require('../backend/src/models/User');

async function dumpDbEvidence() {
  console.log('================================================================');
  console.log('PHASE 14: DATABASE EVIDENCE DUMP');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  // 1. Indexes verification
  const indexes = await Notification.collection.indexes();
  console.log('--- 1. NOTIFICATION COLLECTION INDEXES ---');
  console.log(JSON.stringify(indexes, null, 2));

  // 2. Official Email Configuration document
  const emailConfig = await OfficialEmailConfiguration.findOne();
  console.log('\n--- 2. OFFICIAL EMAIL CONFIGURATION DOCUMENT ---');
  console.log(JSON.stringify(emailConfig, null, 2));

  // 3. Evidence of each notification event type
  const types = [
    'APPLICATION_DECISION',
    'PAYMENT_CONFIRMED',
    'PAYMENT_EXPIRED',
    'ENROLLMENT_WAITLISTED',
    'ENROLLMENT_PROMOTED',
    'EVALUATION_PUBLISHED',
    'CERTIFICATE_ISSUED',
    'CERTIFICATE_REVOKED',
  ];

  console.log('\n--- 3. SAMPLE NOTIFICATION DOCUMENTS PER EVENT TYPE ---');
  for (const type of types) {
    const doc = await Notification.findOne({ type })
      .populate('recipient', 'fullName email role division')
      .sort({ createdAt: -1 });

    if (doc) {
      console.log(`\n[EVENT: ${type}]`);
      console.log(JSON.stringify(doc, null, 2));
    } else {
      console.log(`\n[EVENT: ${type}] - No document found`);
    }
  }

  // 4. Read vs Unread State Evidence
  const unreadDoc = await Notification.findOne({ read: false });
  const readDoc = await Notification.findOne({ read: true });

  console.log('\n--- 4. READ VS UNREAD STATE TRANSITION EVIDENCE ---');
  console.log('UNREAD DOCUMENT:');
  console.log(JSON.stringify({
    _id: unreadDoc?._id,
    type: unreadDoc?.type,
    read: unreadDoc?.read,
    readAt: unreadDoc?.readAt,
    title: unreadDoc?.title,
  }, null, 2));

  console.log('\nREAD DOCUMENT:');
  console.log(JSON.stringify({
    _id: readDoc?._id,
    type: readDoc?.type,
    read: readDoc?.read,
    readAt: readDoc?.readAt,
    title: readDoc?.title,
  }, null, 2));

  // 5. Email failure vs success evidence
  const emailFailedDoc = await Notification.findOne({ emailError: { $ne: null } });
  const emailSuccessDoc = await Notification.findOne({ emailSent: true });

  console.log('\n--- 5. EMAIL DISPATCH STATUS EVIDENCE ---');
  console.log('EMAIL SENT SUCCESS:');
  console.log(JSON.stringify({
    _id: emailSuccessDoc?._id,
    type: emailSuccessDoc?.type,
    emailSent: emailSuccessDoc?.emailSent,
    emailError: emailSuccessDoc?.emailError,
  }, null, 2));

  console.log('\nEMAIL FAILED (NON-BLOCKING RECORD):');
  console.log(JSON.stringify({
    _id: emailFailedDoc?._id,
    type: emailFailedDoc?.type,
    emailSent: emailFailedDoc?.emailSent,
    emailError: emailFailedDoc?.emailError,
  }, null, 2));

  await mongoose.disconnect();
}

dumpDbEvidence().catch((err) => {
  console.error('DB Dump Error:', err);
  process.exit(1);
});
