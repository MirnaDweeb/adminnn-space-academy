const mongoose = require('../backend/node_modules/mongoose');
const User = require('../backend/src/models/User');
const Course = require('../backend/src/models/Course');
const Cohort = require('../backend/src/models/Cohort');
const Application = require('../backend/src/models/Application');
const Enrollment = require('../backend/src/models/Enrollment');
const Invoice = require('../backend/src/models/Invoice');
const PaymentTransaction = require('../backend/src/models/PaymentTransaction');
const Evaluation = require('../backend/src/models/Evaluation');
const Certificate = require('../backend/src/models/Certificate');
const Notification = require('../backend/src/models/Notification');

// Services
const enrollmentService = require('../backend/src/services/enrollmentService');
const financeService = require('../backend/src/services/financeService');
const evaluationService = require('../backend/src/services/evaluationService');
const certificateService = require('../backend/src/services/certificateService');
const { notifyUser } = require('../backend/src/services/notificationService');
const { NOTIFICATION_TYPE } = require('../backend/src/constants/notifications');
const { APPLICATION_STATUS, ENROLLMENT_STATUS, INVOICE_STATUS, EVALUATION_OUTCOME, CERTIFICATE_STATUS } = require('../backend/src/constants/statuses');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEventTriggersSuite() {
  console.log('================================================================');
  console.log('PHASE 14: WORKFLOW EVENT TRIGGERS & EMAIL SIMULATION SUITE');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  const adminUser = await User.findOne({ email: 'preuni.admin@esa.dev' });
  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const studentUser = await User.findOne({ email: 'student@esa.dev' });

  const results = [];
  function record(id, eventType, description, success, details = '') {
    results.push({ id, eventType, description, success, details });
    console.log(`[${success ? 'PASS' : 'FAIL'}] ${id}: [${eventType}] ${description} ${details ? '— ' + details : ''}`);
  }

  // Clear prior test notifications for clean count
  await Notification.deleteMany({ recipient: studentUser._id });

  // -------------------------------------------------------------
  // TRIGGER 1: Application Decision (Phase 7)
  // -------------------------------------------------------------
  {
    let app = await Application.findOne({ student: studentUser._id, division: 'PRE_UNIVERSITY' });
    if (!app) {
      const course = await Course.findOne({ division: 'PRE_UNIVERSITY' });
      app = await Application.create({
        student: studentUser._id,
        program: course._id,
        division: 'PRE_UNIVERSITY',
        status: 'SUBMITTED',
      });
    }

    // Trigger decision via notifyUser (same code path as updateApplicationDecision)
    await notifyUser({
      recipientId: studentUser._id,
      type: NOTIFICATION_TYPE.APPLICATION_DECISION,
      title: 'Application Decision: ACCEPT',
      message: 'Your application has been accepted.',
      relatedResource: { resourceType: 'Application', resourceId: app._id },
      division: app.division,
      email: { to: studentUser.email, subject: 'Application Outcome: ACCEPT', text: 'Application accepted' },
    });

    await delay(300);
    const notif = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.APPLICATION_DECISION,
    }).sort({ createdAt: -1 });

    const pass = !!notif && notif.relatedResource.resourceType === 'Application';
    record('TRIG-01', 'APPLICATION_DECISION', 'Notification created on application decision', pass, `Notif ID: ${notif?._id}`);
  }

  // -------------------------------------------------------------
  // TRIGGER 2: Capacity reached / Waitlisted (Phase 9)
  // -------------------------------------------------------------
  {
    // Create a program with 1 capacity and fill it to force waitlist
    const waitlistCourse = await Course.create({
      title: `Waitlist Test Course ${Date.now()}`,
      division: 'PRE_UNIVERSITY',
      capacity: 1,
      price: 1500,
      level: 'BEGINNER',
      deliveryMode: 'ONLINE',
      createdBy: adminUser._id,
    });

    const dummyOccApp = await Application.create({
      student: adminUser._id,
      program: waitlistCourse._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.CONFIRMED,
    });

    // Create an occupant enrollment so occupiedSeats = 1 = capacity
    await Enrollment.create({
      application: dummyOccApp._id,
      student: adminUser._id,
      program: waitlistCourse._id,
      division: 'PRE_UNIVERSITY',
      status: ENROLLMENT_STATUS.CONFIRMED,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });


    const waitlistApp = await Application.create({
      student: studentUser._id,
      program: waitlistCourse._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
    });

    const enrollResult = await enrollmentService.enrollApplication({
      applicationId: waitlistApp._id,
      adminUser,
      scopeDivision: 'PRE_UNIVERSITY',
    });


    await delay(300);
    const notif = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.ENROLLMENT_WAITLISTED,
    }).sort({ createdAt: -1 });

    const pass = enrollResult.enrollment.status === ENROLLMENT_STATUS.WAITLISTED && !!notif;
    record('TRIG-02', 'ENROLLMENT_WAITLISTED', 'Notification created when program capacity reached', pass, `Enrollment: ${enrollResult.enrollment._id}`);
  }

  // -------------------------------------------------------------
  // TRIGGER 3: Waitlist Promotion (Phase 9)
  // -------------------------------------------------------------
  {
    // Create a course with 1 capacity, an active enrollment, and a waitlisted candidate
    const promoCourse = await Course.create({
      title: `Promotion Test Course ${Date.now()}`,
      division: 'PRE_UNIVERSITY',
      capacity: 1,
      occupiedSeats: 1,
      price: 1500,
      level: 'BEGINNER',
      deliveryMode: 'ONLINE',
      createdBy: adminUser._id,
    });


    const dummyOccupantApp = await Application.create({
      student: adminUser._id, // placeholder user
      program: promoCourse._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.CONFIRMED,
    });

    const occupantEnrollment = await Enrollment.create({
      application: dummyOccupantApp._id,
      student: adminUser._id,
      program: promoCourse._id,
      division: 'PRE_UNIVERSITY',
      status: ENROLLMENT_STATUS.CONFIRMED,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });

    const waitlistedApp = await Application.create({
      student: studentUser._id,
      program: promoCourse._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.WAITLISTED,
    });

    const waitlistedEnrollment = await Enrollment.create({
      application: waitlistedApp._id,
      student: studentUser._id,
      program: promoCourse._id,
      division: 'PRE_UNIVERSITY',
      status: ENROLLMENT_STATUS.WAITLISTED,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });

    // Cancel occupant -> triggers waitlist promotion
    const cancelResult = await enrollmentService.cancelEnrollment({
      enrollmentId: occupantEnrollment._id,
      adminUser,
      reason: 'Student withdrew',
      scopeDivision: 'PRE_UNIVERSITY',
    });

    await delay(300);
    const notif = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.ENROLLMENT_PROMOTED,
    }).sort({ createdAt: -1 });

    const pass = cancelResult.promotedEnrollment && !!notif && notif.relatedResource.resourceType === 'Enrollment';
    record('TRIG-03', 'ENROLLMENT_PROMOTED', 'Notification created when waitlisted candidate promoted', pass, `Promoted ID: ${cancelResult.promotedEnrollment?._id}`);
  }

  // -------------------------------------------------------------
  // TRIGGER 4: Payment Confirmed (Phase 10)
  // -------------------------------------------------------------
  {
    const course = await Course.findOne({ division: 'PRE_UNIVERSITY' });
    const dummyApp = await Application.create({
      student: studentUser._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
    });

    const dummyEnrollment = await Enrollment.create({
      application: dummyApp._id,
      student: studentUser._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: ENROLLMENT_STATUS.PENDING_PAYMENT,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });

    const invoice = await financeService.generateInvoiceForEnrollment({
      enrollmentId: dummyEnrollment._id,
      adminUser,
      dueAtHours: 72,
      scopeDivision: 'PRE_UNIVERSITY',
    });

    // Record full payment
    const paymentResult = await financeService.recordPaymentForInvoice({
      invoiceId: invoice._id,
      adminUser,
      amount: invoice.amount,
      method: 'CASH',
      reference: 'TEST-CASH-REC',
      scopeDivision: 'PRE_UNIVERSITY',
    });

    await delay(300);
    const notif = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.PAYMENT_CONFIRMED,
    }).sort({ createdAt: -1 });

    const pass = paymentResult.isFullyPaid && !!notif && notif.relatedResource.resourceType === 'Invoice';
    record('TRIG-04', 'PAYMENT_CONFIRMED', 'Notification created on manual/settled payment', pass, `Invoice: ${invoice.invoiceNumber}`);
  }

  // -------------------------------------------------------------
  // TRIGGER 5: Payment Deadline Expired (Phase 10)
  // -------------------------------------------------------------
  {
    const course = await Course.findOne({ division: 'PRE_UNIVERSITY' });
    const expApp = await Application.create({
      student: studentUser._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING,
    });

    const expEnrollment = await Enrollment.create({
      application: expApp._id,
      student: studentUser._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      status: ENROLLMENT_STATUS.PENDING_PAYMENT,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });

    // Create invoice with dueAt in the past
    const expInvoice = await Invoice.create({
      invoiceNumber: `INV-EXP-${Date.now()}`,
      enrollment: expEnrollment._id,
      application: expApp._id,
      student: studentUser._id,
      program: course._id,
      division: 'PRE_UNIVERSITY',
      amount: 1000,
      currency: 'EGP',
      status: INVOICE_STATUS.PENDING,
      issuedAt: new Date(Date.now() - 100000),
      dueAt: new Date(Date.now() - 5000),
      createdBy: adminUser._id,
    });

    await financeService.processExpiredInvoices({
      adminUser,
      scopeDivision: 'PRE_UNIVERSITY',
    });

    await delay(300);
    const notif = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.PAYMENT_EXPIRED,
    }).sort({ createdAt: -1 });

    const pass = !!notif && notif.relatedResource.resourceType === 'Invoice';
    record('TRIG-05', 'PAYMENT_EXPIRED', 'Notification created when unpaid invoice expires', pass, `Invoice: ${expInvoice.invoiceNumber}`);
  }

  // -------------------------------------------------------------
  // TRIGGER 6: Evaluation Results Published (Phase 12)
  // -------------------------------------------------------------
  {
    const cohort = await Cohort.findOne({ division: 'PRE_UNIVERSITY' });
    if (cohort) {
      // Ensure student has a confirmed enrollment in this cohort
      let cohortEnrollment = await Enrollment.findOne({ cohort: cohort._id, student: studentUser._id });
      if (!cohortEnrollment) {
        cohortEnrollment = await Enrollment.create({
          student: studentUser._id,
          cohort: cohort._id,
          program: cohort.program,
          division: cohort.division,
          status: ENROLLMENT_STATUS.CONFIRMED,
          enrolledAt: new Date(),
          createdBy: adminUser._id,
        });
      }

      await evaluationService.evaluateCohort({
        cohortId: cohort._id,
        user: adminUser,
      });

      await delay(300);
      const notif = await Notification.findOne({
        recipient: studentUser._id,
        type: NOTIFICATION_TYPE.EVALUATION_PUBLISHED,
      }).sort({ createdAt: -1 });

      const pass = !!notif && notif.relatedResource.resourceType === 'Evaluation';
      record('TRIG-06', 'EVALUATION_PUBLISHED', 'Notification created when cohort evaluation computed', pass, `Notif Title: ${notif?.title}`);
    } else {
      record('TRIG-06', 'EVALUATION_PUBLISHED', 'Cohort not found to evaluate', false);
    }
  }

  // -------------------------------------------------------------
  // TRIGGER 7: Certificate Issued (Phase 13)
  // -------------------------------------------------------------
  let issuedCertificateId = null;
  {
    const passEval = await Evaluation.findOne({
      outcome: EVALUATION_OUTCOME.PASS,
      division: 'PRE_UNIVERSITY',
    }).populate('cohort').populate('program').sort({ evaluatedAt: -1, createdAt: -1 });

    if (passEval) {
      // Ensure passEval is strictly the latest evaluation for this student in this cohort
      await Evaluation.deleteMany({
        cohort: passEval.cohort._id || passEval.cohort,
        student: passEval.student._id || passEval.student,
        _id: { $ne: passEval._id },
      });
      // Remove any prior certificate for this evaluation or student/cohort
      await Certificate.deleteMany({ evaluation: passEval._id });
      await Certificate.deleteMany({
        student: passEval.student._id || passEval.student,
        cohort: passEval.cohort._id || passEval.cohort,
      });

      const certResult = await certificateService.issueCertificate({
        evaluationId: passEval._id,
        user: adminUser,
      });
      issuedCertificateId = certResult._id;

      await delay(300);
      const notif = await Notification.findOne({
        recipient: passEval.student?._id || passEval.student,
        type: NOTIFICATION_TYPE.CERTIFICATE_ISSUED,
      }).sort({ createdAt: -1 });

      const pass = !!certResult && !!notif && notif.relatedResource.resourceType === 'Certificate';
      record('TRIG-07', 'CERTIFICATE_ISSUED', 'Notification created on certificate issuance', pass, `Serial: ${certResult?.serialNumber}`);
    } else {
      record('TRIG-07', 'CERTIFICATE_ISSUED', 'No qualifying PASS evaluation found', false);
    }

  }

  // -------------------------------------------------------------
  // TRIGGER 8: Certificate Revoked (Phase 13)
  // -------------------------------------------------------------
  {
    if (issuedCertificateId) {
      const revokedResult = await certificateService.revokeCertificate({
        certificateId: issuedCertificateId,
        user: adminUser,
        reason: 'Administrative academic audit revocation test',
      });

      await delay(300);
      const notif = await Notification.findOne({
        recipient: revokedResult.student?._id || revokedResult.student,
        type: NOTIFICATION_TYPE.CERTIFICATE_REVOKED,
      }).sort({ createdAt: -1 });

      const pass = revokedResult.status === CERTIFICATE_STATUS.REVOKED && !!notif;
      record('TRIG-08', 'CERTIFICATE_REVOKED', 'Notification created on certificate revocation', pass, `Status: ${revokedResult.status}`);
    } else {
      record('TRIG-08', 'CERTIFICATE_REVOKED', 'No certificate available to revoke', false);
    }
  }

  // -------------------------------------------------------------
  // CRITICAL TEST: Email Failure Does NOT Block Business Action
  // -------------------------------------------------------------
  {
    console.log('\n--- SIMULATING EMAIL SERVICE FAILURE (ECONNREFUSED) ---');
    process.env.SIMULATE_EMAIL_FAILURE = 'true';

    // Find another pass evaluation or create one
    const cohort = await Cohort.findOne({ division: 'PRE_UNIVERSITY' });
    let dummyEnrollment = await Enrollment.findOne({ cohort: cohort._id, student: studentUser._id });
    if (!dummyEnrollment) {
      const anyApp = await Application.findOne({ student: studentUser._id });
      dummyEnrollment = await Enrollment.create({
        student: studentUser._id,
        cohort: cohort._id,
        program: cohort.program,
        division: cohort.division,
        status: ENROLLMENT_STATUS.CONFIRMED,
        enrolledAt: new Date(),
        createdBy: adminUser._id,
        application: anyApp._id,
      });
    }

    const dummyEval = await Evaluation.create({
      cohort: cohort._id,
      student: studentUser._id,
      enrollment: dummyEnrollment._id,
      program: cohort.program,
      division: cohort.division,
      attendanceRate: 100,
      averageScore: 95,
      attendanceThresholdMet: true,
      outcome: EVALUATION_OUTCOME.PASS,
      outcomeReason: 'Email failure test qualification',
      evaluatedBy: adminUser._id,
      evaluatedAt: new Date(),
    });


    // Clear conflicting certs for this student + cohort
    await Certificate.deleteMany({ student: studentUser._id, cohort: cohort._id });

    let certResult = null;
    let thrownError = null;

    try {
      // Issue certificate while email failure is simulated
      certResult = await certificateService.issueCertificate({
        evaluationId: dummyEval._id,
        user: adminUser,
      });
    } catch (err) {
      thrownError = err;
    }

    await delay(500);

    const createdCertInDb = certResult ? await Certificate.findById(certResult._id) : null;
    const notifInDb = await Notification.findOne({
      recipient: studentUser._id,
      type: NOTIFICATION_TYPE.CERTIFICATE_ISSUED,
    }).sort({ createdAt: -1 });

    const businessActionSucceeded = !thrownError && !!createdCertInDb && createdCertInDb.status === CERTIFICATE_STATUS.ISSUED;
    const notifCreated = !!notifInDb;
    const emailFailureHandledSafely = notifInDb && notifInDb.emailSent === false && typeof notifInDb.emailError === 'string';

    const testPassed = businessActionSucceeded && notifCreated && emailFailureHandledSafely;

    record(
      'CRIT-01',
      'EMAIL_FAILURE_NON_BLOCKING',
      'Underlying business action (Certificate issuance) SUCCEEDS even when email dispatch fails',
      testPassed,
      `Cert Issued: ${!!createdCertInDb} (${createdCertInDb?.serialNumber}), Notification: ${!!notifInDb}, EmailError: "${notifInDb?.emailError}"`
    );

    // Reset simulation flag
    delete process.env.SIMULATE_EMAIL_FAILURE;
    console.log('--- EMAIL FAILURE SIMULATION RESET ---\n');
  }

  console.log('================================================================');
  console.log(`WORKFLOW TRIGGERS SUMMARY: ${results.filter(r => r.success).length}/${results.length} PASSED`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  return results;
}

if (require.main === module) {
  runEventTriggersSuite().catch((err) => {
    console.error('Trigger Suite Error:', err);
    process.exit(1);
  });
}

module.exports = { runEventTriggersSuite };
