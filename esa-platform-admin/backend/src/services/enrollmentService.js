const Enrollment = require('../models/Enrollment');
const Application = require('../models/Application');
const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./auditService');
const { APPLICATION_STATUS, ENROLLMENT_STATUS } = require('../constants/statuses');
const { notifyUser, wrapEmailHtml } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../constants/notifications');


/**
 * Calculates current capacity statistics for a given program.
 *
 * Invariant: Occupied Capacity = CONFIRMED + PENDING_PAYMENT
 * WAITLISTED and CANCELLED enrollments do NOT consume capacity.
 *
 * @param {string|ObjectId} programId
 * @returns {Promise<Object>} Capacity breakdown
 */
async function getProgramCapacitySummary(programId) {
  const course = await Course.findById(programId);
  if (!course) {
    throw ApiError.notFound('Program not found');
  }

  const query = { program: course._id };

  const [pendingPayment, confirmed, waitlisted, cancelled] = await Promise.all([
    Enrollment.countDocuments({ ...query, status: ENROLLMENT_STATUS.PENDING_PAYMENT }),
    Enrollment.countDocuments({ ...query, status: ENROLLMENT_STATUS.CONFIRMED }),
    Enrollment.countDocuments({ ...query, status: ENROLLMENT_STATUS.WAITLISTED }),
    Enrollment.countDocuments({ ...query, status: ENROLLMENT_STATUS.CANCELLED }),
  ]);

  const occupied = pendingPayment + confirmed;
  const available = Math.max(course.capacity - occupied, 0);

  // Synchronize occupiedSeats counter if needed
  if (course.occupiedSeats !== occupied) {
    await Course.updateOne({ _id: course._id }, { $set: { occupiedSeats: occupied } });
  }

  return {
    programId: course._id,
    programTitle: course.title,
    division: course.division,
    capacity: course.capacity,
    occupied,
    pendingPayment,
    confirmed,
    waitlisted,
    cancelled,
    available,
    isFull: occupied >= course.capacity,
  };
}

/**
 * Concurrency-safe enrollment of an eligible application.
 *
 * Enforces:
 * - Application must be in ELIGIBLE_PAYMENT_PENDING state
 * - Strict duplicate protection (only 1 active enrollment per application)
 * - Atomic capacity reservation via MongoDB single-document conditional update on Course
 *   ($expr: { $lt: ['$occupiedSeats', '$capacity'] }, $inc: { occupiedSeats: 1 })
 * - Rollback via atomic decrement if record creation fails
 * - If seat available: Enrollment -> PENDING_PAYMENT (seat immediately occupied)
 * - If capacity reached: Enrollment -> WAITLISTED, Application -> WAITLISTED
 * - Invariant: CONFIRMED + PENDING_PAYMENT <= Program.capacity
 *
 * @param {Object} params
 * @param {string} params.applicationId
 * @param {Object} params.adminUser
 * @param {string} [params.scopeDivision]
 * @returns {Promise<Object>} Created enrollment, updated application, and capacity summary
 */
async function enrollApplication({ applicationId, adminUser, scopeDivision }) {
  // 1. Fetch application
  const application = await Application.findById(applicationId);
  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  // Division authorization check
  if (scopeDivision && scopeDivision !== 'all' && application.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot enroll an application outside your division');
  }

  // 2. Eligibility verification: application must have reached ELIGIBLE_PAYMENT_PENDING
  if (application.status !== APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING) {
    throw ApiError.badRequest(
      `Application is not eligible for enrollment. Current status is "${application.status}". Application must be accepted and in "${APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING}" status.`
    );
  }

  // 3. Duplicate protection: check if an active enrollment already exists
  const existingActive = await Enrollment.findOne({
    application: application._id,
    status: {
      $in: [
        ENROLLMENT_STATUS.PENDING_PAYMENT,
        ENROLLMENT_STATUS.CONFIRMED,
        ENROLLMENT_STATUS.WAITLISTED,
        ENROLLMENT_STATUS.ACTIVE,
      ],
    },
  });

  if (existingActive) {
    throw ApiError.conflict(
      `An active enrollment already exists for this application with status ${existingActive.status}. Duplicate enrollments are prohibited.`
    );
  }

  // 4. Fetch Course document and synchronize occupiedSeats counter
  const course = await Course.findById(application.program);
  if (!course) {
    throw ApiError.notFound('Program associated with application not found');
  }

  const actualOccupied = await Enrollment.countDocuments({
    program: course._id,
    status: { $in: [ENROLLMENT_STATUS.PENDING_PAYMENT, ENROLLMENT_STATUS.CONFIRMED] },
  });

  if (course.occupiedSeats !== actualOccupied) {
    await Course.updateOne({ _id: course._id }, { $set: { occupiedSeats: actualOccupied } });
  }

  // 5. ATOMIC CAPACITY RESERVATION GUARD
  // MongoDB executes findOneAndUpdate atomically on the document.
  // The condition ($expr: $occupiedSeats < $capacity) is evaluated under document lock.
  // Two simultaneous requests can NEVER both increment beyond capacity.
  const reservedCourse = await Course.findOneAndUpdate(
    {
      _id: course._id,
      $expr: { $lt: ['$occupiedSeats', '$capacity'] },
    },
    {
      $inc: { occupiedSeats: 1 },
    },
    {
      new: true,
    }
  );

  let enrollment;
  let auditAction;
  let auditReason;

  if (reservedCourse) {
    // Seat was successfully and atomically reserved
    try {
      enrollment = await Enrollment.create({
        application: application._id,
        student: application.student,
        program: course._id,
        division: application.division,
        status: ENROLLMENT_STATUS.PENDING_PAYMENT,
        enrolledAt: new Date(),
        createdBy: adminUser._id,
      });
    } catch (createErr) {
      // Rollback reservation counter if record insertion fails
      await Course.updateOne(
        { _id: course._id, occupiedSeats: { $gt: 0 } },
        { $inc: { occupiedSeats: -1 } }
      );
      throw createErr;
    }

    auditAction = 'ENROLLMENT_CREATED';
    auditReason = `Reserved seat created (${reservedCourse.occupiedSeats}/${course.capacity}) - pending payment`;
  } else {
    // Capacity reached: place candidate on FIFO waiting list (does not consume seat)
    enrollment = await Enrollment.create({
      application: application._id,
      student: application.student,
      program: course._id,
      division: application.division,
      status: ENROLLMENT_STATUS.WAITLISTED,
      enrolledAt: new Date(),
      createdBy: adminUser._id,
    });

    application.status = APPLICATION_STATUS.WAITLISTED;
    await application.save();

    auditAction = 'ENROLLMENT_WAITLISTED';
    auditReason = `Program capacity reached (${course.capacity}/${course.capacity}). Application placed on waiting list.`;
  }

  // 6. Record append-only audit entry
  await recordAudit({
    user: adminUser,
    action: auditAction,
    resource: 'Enrollment',
    resourceId: enrollment._id,
    division: enrollment.division,
    before: null,
    after: {
      enrollmentId: enrollment._id,
      status: enrollment.status,
      applicationId: application._id,
      studentId: application.student,
      programId: course._id,
      programTitle: course.title,
      capacity: course.capacity,
      occupiedSeats: reservedCourse ? reservedCourse.occupiedSeats : course.capacity,
    },
    reason: auditReason,
  });

  // Phase 14: Notify student if placed on waitlist (failure-safe, non-blocking)
  if (enrollment.status === ENROLLMENT_STATUS.WAITLISTED) {
    try {
      await notifyUser({
        recipientId: application.student,
        type: NOTIFICATION_TYPE.ENROLLMENT_WAITLISTED,
        title: `Placed on Waitlist - ${course.title}`,
        message: `Program capacity for "${course.title}" has been reached (${course.capacity}/${course.capacity}). You have been placed on the waiting list.`,
        relatedResource: {
          resourceType: 'Enrollment',
          resourceId: enrollment._id,
        },
        division: enrollment.division,
        email: {
          subject: `Waitlist Notice: ${course.title}`,
          text: `Dear Student,\n\nProgram capacity for "${course.title}" has reached its maximum (${course.capacity}/${course.capacity}). You have been placed on the official waiting list.\n\nIf a seat becomes available, you will be notified immediately.\n\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: 'Waitlist Notice',
            contentHtml: `
              <p>Dear Student,</p>
              <p>Program capacity for <strong>${course.title}</strong> has reached its current limit (${course.capacity}/${course.capacity}).</p>
              <div class="card" style="border-left-color: #f59e0b;">
                <p style="margin: 0; color: #fbbf24;"><strong>Status:</strong> Waitlisted</p>
                <p style="margin: 4px 0;"><strong>Program:</strong> ${course.title}</p>
                <p style="margin: 4px 0;">You have been placed on the official FIFO waiting list.</p>
              </div>
              <p>If another student cancels or fails to settle within the payment window, you will be automatically promoted and notified.</p>
            `,
            actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/dashboard`,
            actionText: 'View Application Status',
          }),
        },
      });
    } catch (waitlistNotifErr) {
      console.error('[EnrollmentWaitlist:NotifyError]', waitlistNotifErr.message);
    }
  }

  const capacitySummary = await getProgramCapacitySummary(course._id);


  return {
    enrollment,
    application,
    capacity: capacitySummary,
  };
}

/**
 * Concurrency-safe cancellation of an enrollment.
 *
 * Enforces:
 * - Only active enrollments (PENDING_PAYMENT, CONFIRMED, or WAITLISTED) can be cancelled
 * - Releases reserved seat if cancelling PENDING_PAYMENT or CONFIRMED
 * - Concurrency-safe FIFO waitlist promotion: atomically promotes oldest WAITLISTED applicant to PENDING_PAYMENT
 * - Audit logging for cancellation and promotion
 *
 * @param {Object} params
 * @param {string} params.enrollmentId
 * @param {Object} params.adminUser
 * @param {string} [params.reason]
 * @param {string} [params.scopeDivision]
 * @returns {Promise<Object>} Cancelled enrollment, promoted waitlist enrollment (if any), and capacity
 */
async function cancelEnrollment({ enrollmentId, adminUser, reason = '', scopeDivision }) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }

  if (scopeDivision && scopeDivision !== 'all' && enrollment.division !== scopeDivision) {
    throw ApiError.forbidden('You cannot cancel an enrollment outside your division');
  }

  if (enrollment.status === ENROLLMENT_STATUS.CANCELLED) {
    throw ApiError.conflict('Enrollment is already cancelled');
  }

  const previousStatus = enrollment.status;
  const wasOccupied = [
    ENROLLMENT_STATUS.PENDING_PAYMENT,
    ENROLLMENT_STATUS.CONFIRMED,
    ENROLLMENT_STATUS.ACTIVE,
  ].includes(previousStatus);

  const course = await Course.findById(enrollment.program);
  if (!course) {
    throw ApiError.notFound('Program not found');
  }

  // 1. Mark enrollment as CANCELLED
  enrollment.status = ENROLLMENT_STATUS.CANCELLED;
  enrollment.cancelledAt = new Date();
  enrollment.cancelReason = reason.trim() || 'Cancelled by administrator';
  await enrollment.save();

  // 2. Update the associated application
  const application = await Application.findById(enrollment.application);
  if (application) {
    application.status = APPLICATION_STATUS.CANCELLED;
    await application.save();
  }

  let promotedEnrollment = null;

  // 3. If an occupied seat was freed, release seat and promote oldest waitlisted candidate (FIFO)
  if (wasOccupied) {
    // Release seat counter
    await Course.updateOne(
      { _id: course._id, occupiedSeats: { $gt: 0 } },
      { $inc: { occupiedSeats: -1 } }
    );

    // ATOMIC FIFO WAITLIST PROMOTION
    // Atomically find the oldest waitlisted enrollment and transition it to PENDING_PAYMENT
    promotedEnrollment = await Enrollment.findOneAndUpdate(
      {
        program: course._id,
        status: ENROLLMENT_STATUS.WAITLISTED,
      },
      {
        $set: {
          status: ENROLLMENT_STATUS.PENDING_PAYMENT,
          enrolledAt: new Date(),
        },
      },
      {
        sort: { createdAt: 1, _id: 1 },
        new: true,
      }
    );

    if (promotedEnrollment) {
      // Re-reserve seat counter for promoted applicant
      await Course.updateOne(
        { _id: course._id },
        { $inc: { occupiedSeats: 1 } }
      );

      // Update promoted candidate's application to ELIGIBLE_PAYMENT_PENDING
      const promotedApplication = await Application.findById(promotedEnrollment.application);
      if (promotedApplication) {
        promotedApplication.status = APPLICATION_STATUS.ELIGIBLE_PAYMENT_PENDING;
        await promotedApplication.save();
      }
    }
  }

  // 4. Record Cancellation Audit Log
  await recordAudit({
    user: adminUser,
    action: 'ENROLLMENT_CANCELLED',
    resource: 'Enrollment',
    resourceId: enrollment._id,
    division: enrollment.division,
    before: { status: previousStatus },
    after: {
      status: enrollment.status,
      cancelledAt: enrollment.cancelledAt,
      cancelReason: enrollment.cancelReason,
    },
    reason: `Enrollment cancelled by ${adminUser.fullName}: ${enrollment.cancelReason}`,
  });

  // 5. Record Waitlist Promotion Audit Log if promotion occurred
  if (promotedEnrollment) {
    await recordAudit({
      user: adminUser,
      action: 'ENROLLMENT_PROMOTED_FROM_WAITLIST',
      resource: 'Enrollment',
      resourceId: promotedEnrollment._id,
      division: promotedEnrollment.division,
      before: { status: ENROLLMENT_STATUS.WAITLISTED },
      after: {
        status: promotedEnrollment.status,
        applicationId: promotedEnrollment.application,
        studentId: promotedEnrollment.student,
        enrolledAt: promotedEnrollment.enrolledAt,
      },
      reason: `FIFO Waitlist promotion: seat opened after cancellation of enrollment ${enrollment._id}`,
    });

    // Phase 14: Notify promoted student (failure-safe, non-blocking)
    try {
      await notifyUser({
        recipientId: promotedEnrollment.student,
        type: NOTIFICATION_TYPE.ENROLLMENT_PROMOTED,
        title: `Waitlist Promotion: Seat Available - ${course.title}`,
        message: `Great news! A seat has opened up for "${course.title}". Your application is now Pending Payment. Please proceed to settle your invoice to secure your seat.`,
        relatedResource: {
          resourceType: 'Enrollment',
          resourceId: promotedEnrollment._id,
        },
        division: promotedEnrollment.division,
        email: {
          subject: `Waitlist Promotion: Seat Available - ${course.title}`,
          text: `Dear Student,\n\nA seat has become available for "${course.title}". You have been promoted from the waitlist to Pending Payment status.\n\nPlease log in to your account and complete your payment to finalize your enrollment.\n\nEgyptian Space Agency Academy`,
          html: wrapEmailHtml({
            title: 'Waitlist Promotion Notice',
            contentHtml: `
              <p>Dear Student,</p>
              <p>Great news! A seat has opened up for <strong>${course.title}</strong>.</p>
              <div class="card" style="border-left-color: #10b981;">
                <p style="margin: 0; color: #34d399;"><strong>Status:</strong> Promoted from Waitlist</p>
                <p style="margin: 4px 0;"><strong>Program:</strong> ${course.title}</p>
                <p style="margin: 4px 0;">Your application has transitioned to <strong>Pending Payment</strong>.</p>
              </div>
              <p>Please log in to your account to review and settle your invoice before the payment window expires.</p>
            `,
            actionUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/student/invoices`,
            actionText: 'View Invoice & Settle Payment',
          }),
        },
      });
    } catch (promotedNotifErr) {
      console.error('[WaitlistPromotion:NotifyError]', promotedNotifErr.message);
    }
  }


  const capacitySummary = await getProgramCapacitySummary(course._id);

  return {
    enrollment,
    promotedEnrollment,
    capacity: capacitySummary,
  };
}

module.exports = {
  getProgramCapacitySummary,
  enrollApplication,
  cancelEnrollment,
};
