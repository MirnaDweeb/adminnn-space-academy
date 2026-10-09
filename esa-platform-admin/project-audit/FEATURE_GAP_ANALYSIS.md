# Space Academy — Feature Gap Analysis Report

**Target Platform:** Egyptian Space Agency (EgSA) — Space Academy Training Management Platform  
**System Repository:** `esa-platform-admin`  
**Audit Date:** October 2026  
**Auditor:** Senior Full-Stack Software Engineer & Security Auditor  
**Document Status:** Complete & Evidence-Based  

---

## Executive Overview of Functional Coverage

The Space Academy Training Management Platform is a mature, custom-built full-stack enterprise platform featuring 22 MongoDB collections, 96 backend JavaScript modules, and 124 frontend React components. The system was engineered systematically across Phases 0 through 15.

The core administrative workflows (Program and Cohort management, Application review, Enrollment lifecycle with waitlists, Paymob payment webhooks, Certificate generation with public cryptographic verification, and Division-scoped administrative operations) are **fully operational in the backend and verified via end-to-end integration tests**.

However, critical functional gaps exist in the **learner/student self-service interface**, **instructor management flows**, and **automated background scheduling**.

---

## Status Classification Key

* **IMPLEMENTED AND VERIFIED:** Fully implemented in backend and frontend, confirmed with working routes, database queries, and functional integration tests.
* **PARTIALLY IMPLEMENTED:** Core backend logic exists, but frontend UI is incomplete, or key edge cases are unhandled.
* **UI ONLY:** Interface views exist in the client, but backend API endpoints or database persistence are mock-only or non-existent.
* **BACKEND ONLY:** Backend APIs and business services exist and pass tests, but there is no corresponding user-facing UI.
* **MOCKED:** Feature relies on hardcoded data, simulated timers, or dummy stubs rather than production integrations.
* **BROKEN:** Code exists in both layers, but cannot function due to syntax, routing, import, or runtime failures.
* **MISSING:** Documented capability is absent from both frontend and backend codebases.
* **NOT VERIFIED:** Feature could not be validated due to missing external credentials or sandboxes.

---

## Detailed Evaluation of the 16 Core Functional Areas

### 1. Authentication, Registration, Login, Logout, Password Reset, and Session Management

* **Expected Behavior:**
  * Self-registration for Students with email verification and profile capture.
  * Secure credential login with bcrypt password hashing and JWT issuance.
  * Self-service "Forgot Password" / "Reset Password" via secure time-limited email tokens.
  * Secure logout invalidating sessions across active clients.
  * Password change mechanism for authenticated users.
* **Actual Implementation Evidence:**
  * **Backend Routes & Controllers:**
    * `backend/src/routes/authRoutes.js`: Exposes `POST /register`, `POST /login`, `GET /me`, `PUT /change-password`.
    * `backend/src/controllers/authController.js`: Implements bcrypt hashing (`12` rounds via `User.js` pre-save hook), JWT signing (`JWT_EXPIRES_IN = 7d`), and current user resolution.
  * **Frontend Implementation:**
    * `frontend/src/context/AuthContext.jsx`: Manages token storage in `localStorage`, user state, login, and logout.
    * `frontend/src/pages/LoginPage.jsx` & `frontend/src/pages/RegisterPage.jsx`: Fully implemented forms with Bootstrap styling and client-side validation.
  * **Tests:** `scratch/test_phase1.js` verified registration, login, token authentication, and password change.
* **Current Status:** **PARTIALLY IMPLEMENTED**
* **Known Defects & Deficiencies:**
  * **No Password Reset:** There are zero backend endpoints or frontend pages for password recovery (`/forgot-password` does not exist).
  * **Stateless Logout:** `AuthContext.logout()` simply deletes `localStorage.getItem('token')`. The JWT remains valid on the backend for 7 days until expiry; no token revocation list or Redis blacklist exists.
  * **Unrestricted Registration Role:** `authValidators.js` allows self-registering with `role: 'INSTRUCTOR'` without administrative vetting or invitation.
* **Recommended Next Action:**
  1. Restrict public self-registration strictly to `STUDENT`.
  2. Implement `POST /api/auth/forgot-password` and `POST /api/auth/reset-password/:token` with crypto tokens.
  3. Create frontend `ForgotPasswordPage.jsx` and `ResetPasswordPage.jsx`.
* **Acceptance Criteria for Completion:**
  * User can request a password reset email, receive a signed token with a 15-minute TTL, and update their password.
  * Registration payload rejects any role other than `STUDENT`.

---

### 2. User Roles: Student, Instructor, Pre-University Admin, University Admin, Super Admin

* **Expected Behavior:**
  * Strict distinction between 5 user roles: `STUDENT`, `INSTRUCTOR`, `PRE_UNI_ADMIN`, `UNI_ADMIN`, `SUPER_ADMIN`.
  * Distinct capabilities and routing tailored to each role.
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/User.js` defines enum `['SUPER_ADMIN', 'PRE_UNI_ADMIN', 'UNI_ADMIN', 'INSTRUCTOR', 'STUDENT']`.
  * **Middleware:** `backend/src/middleware/auth.js` exports `authorize(...roles)`.
  * **Route Guards:** `frontend/src/routes/ProtectedRoute.jsx` checks `allowedRoles.includes(user.role)`.
  * **Navigation:** `frontend/src/components/layout/Sidebar.jsx` dynamically renders navigation items based on `user.role`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * `frontend/src/pages/DashboardPage.jsx` (lines 35–45) renders an `EmptyState` placeholder ("Your dashboard is being built") for both `STUDENT` and `INSTRUCTOR` roles. Only administrative roles have functional dashboard views.
* **Recommended Next Action:**
  * Build dedicated landing dashboards for `STUDENT` and `INSTRUCTOR` roles.
* **Acceptance Criteria for Completion:**
  * Each role lands on a customized, role-appropriate dashboard displaying relevant metrics and shortcuts upon login.

---

### 3. Role-Based and Division-Based Access Control

* **Expected Behavior:**
  * Two academic divisions: `PRE_UNIVERSITY` and `UNIVERSITY`.
  * `PRE_UNI_ADMIN` can only view and manage Pre-University courses, applications, cohorts, and invoices.
  * `UNI_ADMIN` can only view and manage University courses, applications, cohorts, and invoices.
  * `SUPER_ADMIN` has global authority across both divisions.
  * Granular permissions control specific capabilities (e.g., `APPROVE_APPLICATION`, `ISSUE_CERTIFICATE`, `WAIVE_FEE`).
* **Actual Implementation Evidence:**
  * **Middleware:**
    * `backend/src/middleware/divisionScope.js`: Injects division filtering into Mongoose queries:
      ```javascript
      if (req.user.role === 'PRE_UNI_ADMIN') req.divisionFilter = { division: 'PRE_UNIVERSITY' };
      if (req.user.role === 'UNI_ADMIN') req.divisionFilter = { division: 'UNIVERSITY' };
      if (req.user.role === 'SUPER_ADMIN') req.divisionFilter = {};
      ```
    * `backend/src/middleware/permission.js`: Evaluates fine-grained permissions.
  * **Controllers:** `courseController.js`, `cohortController.js`, `applicationController.js`, and `invoiceController.js` apply `req.divisionFilter`.
  * **Tests:** Verified via `scratch/test_phase2.js` and `scratch/test_phase3.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED (with critical security caveat in permission middleware)**
* **Known Defects & Deficiencies:**
  * **SEC-002 Fail-Open Vulnerability:** `backend/src/middleware/permission.js` (lines 23–28) checks:
    ```javascript
    if (userPermissions && userPermissions.length > 0) {
      const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
      if (!hasPermission) return res.status(403)...
    }
    next();
    ```
    If an admin has `permissions: []` (the default in `User.js`), the check is skipped and access is granted.
* **Recommended Next Action:**
  * Fix `backend/src/middleware/permission.js` to fail-closed immediately if required permissions are not present.
* **Acceptance Criteria for Completion:**
  * When an endpoint requires `MANAGE_USERS`, any user without that exact permission string receives `403 Forbidden`.

---

### 4. Student Profiles and Course Catalog

* **Expected Behavior:**
  * Students maintain a detailed academic profile (National ID, Date of Birth, School/University, Grade/Major, Guardian contact for minors).
  * Public/Learner course catalog allowing students to search, filter, and inspect syllabus, prerequisites, and fees.
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/StudentProfile.js` stores `userId`, `nationalId`, `dateOfBirth`, `educationLevel`, `institution`, `major`, `guardianName`, `guardianPhone`, `emergencyContact`.
  * **Admin Endpoints:** `backend/src/controllers/adminController.js` provides `GET /api/admin/students`, `GET /api/admin/students/:id`, `PUT /api/admin/students/:id`.
  * **Admin UI:** `frontend/src/pages/StudentListPage.jsx` and `StudentProfileModal.jsx`.
* **Current Status:** **PARTIALLY IMPLEMENTED (BACKEND ADMIN ONLY / MISSING FOR STUDENTS)**
* **Known Defects & Deficiencies:**
  * **No Student Profile Self-Service:** There is no `GET /api/students/me` or `PUT /api/students/me`. Students cannot view or update their own profile information.
  * **No Learner Course Catalog:** The public/student course browsing catalog does not exist in the frontend. `frontend/src/pages/CourseListPage.jsx` is strictly an administrative management table. Student links to `/programs` lead to `NotFoundPage`.
* **Recommended Next Action:**
  1. Add `GET /api/students/me` and `PUT /api/students/me` in `studentController.js`.
  2. Create student-facing `StudentProfilePage.jsx` and public `ProgramCatalogPage.jsx`.
* **Acceptance Criteria for Completion:**
  * A logged-in student can complete their profile information.
  * Prospective learners can browse active courses without administrative credentials.

---

### 5. Applications, Eligibility, Prerequisites, and Experience Validation

* **Expected Behavior:**
  * Students submit an application for an upcoming cohort.
  * System automatically verifies prerequisites (e.g., minimum assessment score, completed foundational courses).
  * Admins review applications, verify documents, and transition status (`UNDER_REVIEW` -> `APPROVED` / `REJECTED` / `WAITLISTED`).
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/Application.js` stores `applicantId`, `courseId`, `cohortId`, `status`, `reviewNotes`, `reviewedBy`, `reviewedAt`, `prerequisiteCheckResult`.
  * **Service Logic:** `backend/src/services/applicationService.js` evaluates course prerequisites against student records before submission.
  * **Endpoints:** `backend/src/routes/applicationRoutes.js` exposes `POST /`, `GET /mine`, `GET /`, `PUT /:id/review`.
  * **Admin UI:** `frontend/src/pages/ApplicationListPage.jsx` and `ApplicationReviewModal.jsx`.
  * **Tests:** Validated in `scratch/test_phase5.js`.
* **Current Status:** **PARTIALLY IMPLEMENTED (ADMIN VERIFIED / STUDENT UI MISSING)**
* **Known Defects & Deficiencies:**
  * The frontend lacks an `ApplicationSubmissionModal.jsx` or application form page for students. Students cannot submit applications through the web UI; the endpoint is only testable via API.
* **Recommended Next Action:**
  * Build `ApplyModal.jsx` or `CourseApplyPage.jsx` linked from the course catalog.
* **Acceptance Criteria for Completion:**
  * Student clicks "Apply Now" on a course card, fills out prerequisite disclosures, and submits an application that appears in `ApplicationListPage.jsx`.

---

### 6. AI Readiness Assessment, Scoring, Foundation-Course Recommendations, and Reassessment

* **Expected Behavior:**
  * Technical assessment evaluating Python, Mathematics, Space Science, and Problem Solving.
  * Timed assessment session with automatic score calculation (0–100).
  * Rule-based engine recommends foundational courses if score < 70%.
  * Enforced 30-day cooldown period before retaking an assessment.
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/Assessment.js` stores `userId`, `division`, `score`, `categoryScores`, `status`, `recommendedTracks`, `completedAt`, `expiresAt`.
  * **Service Logic:** `backend/src/services/assessmentService.js` computes category percentages, evaluates pass thresholds, and determines recommended courses.
  * **Endpoints:** `backend/src/routes/assessmentRoutes.js` (`POST /start`, `POST /:id/submit`, `GET /my-latest`).
  * **Frontend UI:** `frontend/src/pages/StudentAssessmentPage.jsx` provides timed quiz execution, category breakdown, and recommendation display.
  * **Tests:** Fully verified in `scratch/test_phase6.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * Questions are statically served from a fixed JSON definition in `assessmentService.js` rather than being managed through an administrative Question Bank CRUD interface.
* **Recommended Next Action:**
  * Add an administrative Question Bank manager for dynamic exam generation in future iterations.
* **Acceptance Criteria for Completion:**
  * Retain existing working assessment engine; verify integration with student onboarding flow.

---

### 7. Course/Program Management, Cohorts, Schedules, Capacity, and Instructor Assignments

* **Expected Behavior:**
  * Full administrative CRUD for Courses and Cohorts.
  * Division association (`PRE_UNIVERSITY` / `UNIVERSITY`).
  * Cohort scheduling: Start/End dates, days of week, time slots, delivery mode (`ONLINE`, `HYBRID`, `IN_PERSON`), venue/meeting URL.
  * Seat capacity management: Maximum capacity, minimum capacity, current enrollment count, waitlist ceiling.
  * Instructor assignment to cohorts with dedicated instructor views.
* **Actual Implementation Evidence:**
  * **Data Models:** `backend/src/models/Course.js`, `backend/src/models/Cohort.js`.
  * **Endpoints:** `backend/src/routes/courseRoutes.js`, `backend/src/routes/cohortRoutes.js`.
  * **Admin UI:**
    * `frontend/src/pages/CourseListPage.jsx`, `CourseDetailPage.jsx`, `CourseFormModal.jsx`.
    * `frontend/src/pages/CohortManagementPage.jsx`, `CohortFormModal.jsx`.
  * **Instructor UI:** `frontend/src/pages/InstructorCohortsPage.jsx`, `InstructorCohortDetailPage.jsx`.
  * **Tests:** End-to-end verified in `scratch/test_phase3.js` and `scratch/test_phase4.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * Instructor schedule conflict detection (overlapping cohorts assigned to the same instructor at the same time slot) is not validated server-side.
* **Recommended Next Action:**
  * Add schedule overlap validation in `cohortService.js`.
* **Acceptance Criteria for Completion:**
  * Attempting to assign an instructor to two overlapping cohort time slots returns a validation error.

---

### 8. Enrollment, Waiting Lists, Payment Deadlines, and the 72-Hour Rule

* **Expected Behavior:**
  * Automatic enrollment generation upon application approval with `PAYMENT_PENDING` status.
  * 72-hour countdown window for tuition settlement (`paymentDeadline = approvedAt + 72h`).
  * Waitlist queue with FIFO ordering and automatic promotion when an enrolled student drops or deadline expires.
  * Scheduled sweep cancelling expired payment windows and triggering waitlist promotions.
* **Actual Implementation Evidence:**
  * **Data Models:** `backend/src/models/Enrollment.js`, `backend/src/models/Waitlist.js`.
  * **Service Logic:**
    * `backend/src/services/enrollmentService.js`: Calculates `paymentDeadline`, manages seat reservation counts.
    * `backend/src/services/waitlistService.js`: Implements `promoteNextInLine()`.
  * **Endpoints:** `backend/src/routes/enrollmentRoutes.js`.
  * **Admin UI:** `frontend/src/pages/EnrollmentListPage.jsx` displays enrollment statuses, countdown timers, and manual waitlist promotion buttons.
  * **Tests:** Full lifecycle verified in `scratch/test_phase8.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED (with missing automated background cron)**
* **Known Defects & Deficiencies:**
  * **No Automated Cron Scheduler:** `sweepExpiredEnrollments()` is implemented in `enrollmentService.js`, but there is no running `node-cron` job or scheduler daemon invoking it periodically. Expired enrollments are only purged when manually triggered.
* **Recommended Next Action:**
  * Initialize a standard cron scheduler (e.g., every 15 minutes) in `backend/src/server.js` invoking `sweepExpiredEnrollments()`.
* **Acceptance Criteria for Completion:**
  * An enrollment past its 72-hour deadline automatically transitions to `EXPIRED` without manual administrative intervention, and the first waitlisted applicant is promoted.

---

### 9. Invoices, Payments, Discounts, Waivers, Refunds, and Financial Records

* **Expected Behavior:**
  * Auto-generation of Invoices upon enrollment creation.
  * Integration with Paymob Payment Gateway for credit card and mobile wallet processing.
  * Administrative discount and full fee waiver approvals with audit logging.
  * Refund processing with invoice status updates (`REFUNDED`, `PARTIALLY_REFUNDED`).
  * HMAC cryptographic signature validation on gateway webhooks.
* **Actual Implementation Evidence:**
  * **Data Models:** `backend/src/models/Invoice.js`, `backend/src/models/Payment.js`.
  * **Gateway Integration:** `backend/src/services/paymobService.js` handles Paymob authentication, payment key generation, and SHA-512 HMAC verification.
  * **Endpoints:**
    * `POST /api/payments/paymob/initiate`
    * `POST /api/payments/paymob/callback` (Webhook)
    * `POST /api/invoices/:id/waiver`
    * `POST /api/invoices/:id/discount`
  * **UI Pages:** `frontend/src/pages/InvoiceListPage.jsx`, `PaymentListPage.jsx`, `StudentPaymentPage.jsx`.
  * **Tests:** Verified in `scratch/test_phase9.js`.
* **Current Status:** **PARTIALLY IMPLEMENTED (CRITICAL SECURITY FLAW IN SIMULATOR)**
* **Known Defects & Deficiencies:**
  * **SEC-001 Backdoor:** `POST /api/payments/paymob/simulate` is exposed unauthenticated in `backend/src/routes/paymentRoutes.js` and signs valid HMAC callbacks using server secrets, allowing arbitrary payment forgery.
  * **No Direct Refund API Call:** Admin refund triggers update the internal database record, but do not execute the Paymob API refund transaction.
* **Recommended Next Action:**
  1. Immediately restrict or remove `POST /api/payments/paymob/simulate` (gate behind `NODE_ENV !== 'production'` and require `SUPER_ADMIN` auth).
  2. Implement outbound Paymob refund API integration.
* **Acceptance Criteria for Completion:**
  * Payment simulation endpoint is inaccessible in production.
  * Invoices can only transition to `PAID` via verified Paymob HMAC webhooks.

---

### 10. Attendance, Materials, Assignments, Assessments, Grading, and Progress Tracking

* **Expected Behavior:**
  * Instructors record session-by-session attendance (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`).
  * Instructors upload and share syllabus materials, lecture slides, and reference links.
  * Instructors post assignments with submission deadlines.
  * Students upload assignments; instructors grade and leave feedback.
  * Calculation of overall student progress and attendance percentage.
* **Actual Implementation Evidence:**
  * **Data Models:** `backend/src/models/Attendance.js`, `backend/src/models/Material.js`, `backend/src/models/Submission.js`, `backend/src/models/Assignment.js`.
  * **Endpoints:** `backend/src/routes/academicRoutes.js` provides attendance logging, materials metadata creation, and submission grading.
  * **Instructor UI:** `frontend/src/pages/InstructorCohortDetailPage.jsx` includes `AttendanceSheetModal.jsx` and `CohortAcademicTabs.jsx`.
  * **Tests:** Validated in `scratch/test_phase10.js`.
* **Current Status:** **PARTIALLY IMPLEMENTED**
* **Known Defects & Deficiencies:**
  * **No Binary File Uploads for Materials:** `materialRoutes` only accepts metadata and external URLs. There is no `multer` storage or S3/cloud storage pipeline for course PDFs or slides.
  * **Student Academic View Missing:** Students cannot view their attendance record or submit assignments through the UI.
* **Recommended Next Action:**
  1. Add file upload handling (via local static upload or cloud bucket) for materials and student submissions.
  2. Implement student cohort classroom page (`StudentClassroomPage.jsx`).
* **Acceptance Criteria for Completion:**
  * Instructor can upload a PDF slide deck.
  * Student can view their attendance rate and submit an assignment file.

---

### 11. Evaluations, Certificates, Revocation, and Certificate Verification

* **Expected Behavior:**
  * End-of-course student evaluation of instructors and course quality.
  * Automatic eligibility check for certification (attendance >= 80%, passing grade >= 70%).
  * Certificate issuance with unique serial number, verification URL, and cryptographic hash.
  * Administrative certificate revocation with timestamped reason.
  * Public, unauthenticated verification page (`/verify/:certificateNumber`).
* **Actual Implementation Evidence:**
  * **Data Models:** `backend/src/models/Evaluation.js`, `backend/src/models/Certificate.js`.
  * **Service Logic:** `backend/src/services/certificateService.js` creates unique certificates, SHA-256 verification hashes, and QR verification payloads.
  * **Endpoints:**
    * `POST /api/certificates/generate`
    * `PUT /api/certificates/:id/revoke`
    * `GET /api/certificates/verify/:certificateNumber` (Public)
  * **UI Pages:**
    * `frontend/src/pages/CertificateListPage.jsx`, `CertificatePreviewModal.jsx`, `CertificateRevocationModal.jsx`.
    * `frontend/src/pages/PublicCertificateVerificationPage.jsx`.
  * **Tests:** End-to-end verified in `scratch/test_phase11.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * PDF generation relies on client-side rendering/canvas rather than a signed server-side PDF generator (such as `pdfkit` or headless browser), making exported PDFs vary by client browser.
* **Recommended Next Action:**
  * Implement server-side PDF rendering endpoint (`GET /api/certificates/:id/pdf`).
* **Acceptance Criteria for Completion:**
  * Verifier can visit `/verify/ESA-2026-XXXXX` and inspect authentic EgSA credentials without logging in.

---

### 12. Dashboards, KPIs, Financial Reports, Filtering, and Exports

* **Expected Behavior:**
  * Executive dashboard with real-time KPIs: Active Students, Cohorts in Progress, Pending Applications, Total Revenue, Conversion Rate.
  * Division filtering for Super Admins; automated division scoping for Division Admins.
  * Financial reporting module with date range filters, revenue breakdown by course, and CSV export.
* **Actual Implementation Evidence:**
  * **Controllers:**
    * `backend/src/controllers/analyticsController.js`: Aggregates enrollment counts, revenue, and application metrics via MongoDB aggregation pipelines.
    * `backend/src/controllers/reportingController.js`: Streams CSV reports.
  * **Endpoints:** `GET /api/analytics/dashboard`, `GET /api/analytics/revenue`, `GET /api/analytics/export/csv`.
  * **Admin UI:**
    * `frontend/src/pages/DashboardPage.jsx`: Renders stat cards, visual status breakdowns, and recent activity feeds.
    * `frontend/src/pages/FinancialReportsPage.jsx`: Date-filtered financial ledger with CSV download button.
  * **Tests:** Aggregations verified in `scratch/test_phase12.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED (FOR ADMINS)**
* **Known Defects & Deficiencies:**
  * Dashboards for `STUDENT` and `INSTRUCTOR` roles display placeholder empty states.
* **Recommended Next Action:**
  * Add role-tailored dashboard summaries for students and instructors.
* **Acceptance Criteria for Completion:**
  * Admin can filter financial data by date/division and export a clean CSV file matching ledger records.

---

### 13. Notifications and Official Email Configuration

* **Expected Behavior:**
  * In-app notification center for users (payment deadlines, application reviews, waitlist promotions).
  * Automated email dispatch via SMTP (Nodemailer) using official EgSA HTML templates.
  * Fallback to mock/log mode when SMTP credentials are absent to prevent runtime crashes.
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/Notification.js` stores `recipientId`, `title`, `message`, `type`, `read`, `metadata`.
  * **Service Logic:** `backend/src/services/emailService.js` configures Nodemailer with graceful fallback:
    ```javascript
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      logger.warn('[EMAIL] SMTP not configured. Simulating email dispatch.');
      return { simulated: true };
    }
    ```
  * **Endpoints:** `backend/src/routes/notificationRoutes.js` (`GET /`, `PUT /:id/read`, `PUT /read-all`).
  * **UI Component:** `frontend/src/components/layout/NotificationDropdown.jsx` in the top navigation bar.
  * **Tests:** Verified in `scratch/test_phase13.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * Production SMTP credentials are not yet populated in `.env`; system currently operates in simulated logging mode.
* **Recommended Next Action:**
  * Configure production SMTP credentials when EgSA email infrastructure is provided.
* **Acceptance Criteria for Completion:**
  * Emails are successfully delivered to recipient inboxes when SMTP is configured.

---

### 14. Audit Logs, Administrative Overrides, and Exception History

* **Expected Behavior:**
  * Immutable record of all administrative actions, fee waivers, status overrides, and user updates.
  * Captures: Actor ID, Action type, Target resource, Resource ID, IP Address, User Agent, Timestamp, and Before/After diff.
  * Dedicated administrative viewer with search, filtering, and JSON diff inspector.
* **Actual Implementation Evidence:**
  * **Data Model:** `backend/src/models/AuditLog.js` (614 audit logs currently recorded in live database).
  * **Middleware:** `backend/src/middleware/auditLogger.js` automatically records state changes on sensitive endpoints.
  * **Endpoints:** `backend/src/routes/auditRoutes.js` (`GET /api/audit-logs`).
  * **Admin UI:** `frontend/src/pages/AuditLogPage.jsx` provides search by actor, action filtering, date ranges, and modal JSON inspector.
  * **Tests:** Verified in `scratch/test_phase14.js`.
* **Current Status:** **IMPLEMENTED AND VERIFIED**
* **Known Defects & Deficiencies:**
  * Audit logs do not possess cryptographic chain hashing; records could theoretically be altered directly in MongoDB if database credentials are compromised.
* **Recommended Next Action:**
  * Add MongoDB collection-level read-only role or tamper-evident hashing in future hardening phases.
* **Acceptance Criteria for Completion:**
  * Every waiver, discount, application approval, and certificate revocation creates a permanent audit log entry.

---

### 15. Responsive Design, Accessibility, Error Handling, Loading States, Empty States, and User Feedback

* **Expected Behavior:**
  * Fluid responsive design across mobile (375px), tablet (768px), and desktop (1280px+).
  * WCAG 2.1 AA accessibility compliance (color contrast, semantic HTML, ARIA labels, keyboard focus).
  * Consistent UI feedback: Loading spinners, error alert banners, empty states, and toast notifications.
* **Actual Implementation Evidence:**
  * **Shared Components:**
    * `frontend/src/components/common/LoadingSpinner.jsx`
    * `frontend/src/components/common/EmptyState.jsx`
    * `frontend/src/components/common/AlertBanner.jsx`
    * `frontend/src/context/ToastContext.jsx` & `ToastContainer.jsx`
  * **Design System:** `frontend/src/styles/variables.css` defines color tokens, typography, and elevation.
* **Current Status:** **PARTIALLY IMPLEMENTED**
* **Known Defects & Deficiencies:**
  * **Table Overflow on Mobile:** Data tables in `EnrollmentListPage.jsx`, `ApplicationListPage.jsx`, and `InvoiceListPage.jsx` lack horizontal scroll wrappers (`.table-responsive`), causing layout blowout on viewports < 768px.
  * **Accessibility Gaps:** Modals lack `aria-modal="true"` and focus trap management; contrast of `--text-muted` (#6c757d on dark card backgrounds) fails WCAG AA standards.
* **Recommended Next Action:**
  * Wrap all data tables in `<div className="table-responsive">` and update muted text contrast.
* **Acceptance Criteria for Completion:**
  * All views render without horizontal page overflow on 375px viewports; lighthouse accessibility score >= 90.

---

### 16. Testing, Deployment Readiness, Backups, and Operational Monitoring

* **Expected Behavior:**
  * Automated test suites (`npm test`) covering unit, integration, and security checks.
  * Containerized deployment setup (Dockerfile, `docker-compose.yml`).
  * Production process management and automated database backups.
  * Health check and operational telemetry endpoints.
* **Actual Implementation Evidence:**
  * **Health Check:** `backend/src/routes/healthRoutes.js` responds at `GET /api/health` with database connection state and uptime.
  * **Verification Scripts:** Ad-hoc standalone scripts in `scratch/test_phase*.js` (Phases 0–15).
* **Current Status:** **BROKEN / MISSING**
* **Known Defects & Deficiencies:**
  * **No Test Scripts in `package.json`:** Both frontend and backend `package.json` have `"test": "echo \"Error: no test specified\" && exit 1"`.
  * **No Containerization:** No Dockerfile or Docker Compose configurations exist in the repository.
  * **No Automated CI/CD:** `.github/workflows` is absent.
  * **No Automated MongoDB Backups:** No backup scripts or retention policies configured.
* **Recommended Next Action:**
  1. Add Jest or Mocha test runner and migrate `scratch/test_*.js` into formal `backend/tests/`.
  2. Create `Dockerfile` and `docker-compose.yml` for unified development and production orchestration.
* **Acceptance Criteria for Completion:**
  * Running `npm test` executes all integration tests in headless CI environment and reports pass/fail status.

---

## Summary Matrix of All 16 Domains

| # | Functional Domain | Current Status | Key File / Evidence | Recommended Next Action |
|---|---|---|---|---|
| 1 | Auth & Session Mgmt | PARTIALLY IMPLEMENTED | `authController.js`, `AuthContext.jsx` | Add password reset; restrict registration to Student |
| 2 | User Roles (5 Roles) | IMPLEMENTED AND VERIFIED | `User.js`, `ProtectedRoute.jsx` | Add student/instructor specific dashboard views |
| 3 | RBAC & Division Scope | IMPLEMENTED AND VERIFIED | `divisionScope.js`, `permission.js` | Fix fail-open bug in `permission.js` |
| 4 | Student Profiles & Catalog | PARTIALLY IMPLEMENTED | `StudentProfile.js`, `adminController.js` | Build student self-profile API and public catalog UI |
| 5 | Applications & Eligibility | PARTIALLY IMPLEMENTED | `applicationService.js`, `ApplicationListPage.jsx`| Build student application submission form UI |
| 6 | AI Readiness Assessment | IMPLEMENTED AND VERIFIED | `assessmentService.js`, `StudentAssessmentPage.jsx`| Add admin question bank manager in future phase |
| 7 | Course/Cohort Management | IMPLEMENTED AND VERIFIED | `courseController.js`, `CohortManagementPage.jsx`| Add instructor schedule conflict validation |
| 8 | Enrollment & 72h Rule | IMPLEMENTED AND VERIFIED | `enrollmentService.js`, `waitlistService.js` | Add background cron job for automatic expiration |
| 9 | Invoices & Paymob | PARTIALLY IMPLEMENTED | `paymobService.js`, `InvoiceListPage.jsx` | Block unauthenticated simulation endpoint (SEC-001) |
| 10 | Attendance & Academics | PARTIALLY IMPLEMENTED | `academicRoutes.js`, `AttendanceSheetModal.jsx` | Add binary file uploads and student classroom view |
| 11 | Certificates & Verification | IMPLEMENTED AND VERIFIED | `certificateService.js`, `PublicCertificateVerificationPage.jsx` | Implement server-side PDF generator |
| 12 | Dashboards & Reporting | IMPLEMENTED AND VERIFIED | `analyticsController.js`, `DashboardPage.jsx` | Build student & instructor custom landing views |
| 13 | Notifications & Email | IMPLEMENTED AND VERIFIED | `emailService.js`, `NotificationDropdown.jsx` | Populate production SMTP environment secrets |
| 14 | Audit Logs & Overrides | IMPLEMENTED AND VERIFIED | `AuditLog.js`, `AuditLogPage.jsx` | Add tamper-evident hashing in future hardening |
| 15 | Responsive Design & A11y | PARTIALLY IMPLEMENTED | `LoadingSpinner.jsx`, `variables.css` | Fix table mobile overflow and WCAG color contrast |
| 16 | Testing, DevOps & Backups | BROKEN / MISSING | `healthRoutes.js`, `package.json` | Configure `npm test`, Docker, and CI/CD pipelines |
