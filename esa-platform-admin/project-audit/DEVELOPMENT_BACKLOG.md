# Space Academy — Prioritized Development Backlog

**Target Platform:** Egyptian Space Agency (EgSA) — Space Academy Training Management Platform  
**System Repository:** `esa-platform-admin`  
**Audit Date:** October 2026  
**Auditor:** Senior Full-Stack Architect & Engineering Lead  
**Planning Purpose:** Actionable, evidence-based roadmap for Claude and engineering teams to execute without guesswork or regressions.

---

## Executive Backlog Summary

This backlog translates all audit findings into structured, atomic engineering tasks grouped by priority:
* **P0 — Critical Security Vulnerabilities & Release Blockers** (Must be fixed immediately)
* **P1 — Core Security, Division Authorization & Learner Self-Service Gaps** (Essential for system usability)
* **P2 — Business Workflows, Automation & Academic Management** (Core platform lifecycle)
* **P3 — UI/UX Polish, Accessibility & Responsive Layouts** (Design system integrity)
* **P4 — Testing Infrastructure, DevOps & Performance** (Long-term maintainability)

---

## Top 3 Recommended Next Tasks (Immediate Execution Sequence)

The first three tasks must be executed in this exact order to eliminate financial/security vulnerabilities before expanding user features:

1. **Task 1: `SEC-001` — Restrict or Remove Unauthenticated Payment Simulator Backdoor**  
   * **Why first:** High critical financial vulnerability. Anyone on the internet can currently forge invoice payments and confirm enrollments using EgSA's real server HMAC secret.
   * **Dependencies:** None. Can be fixed in 1 hour.
2. **Task 2: `SEC-002` — Fix Fail-Open Authorization Flaw in Permission Middleware**  
   * **Why second:** Prevents administrative privilege escalation across all routes protected by fine-grained permissions.
   * **Dependencies:** None.
3. **Task 3: `FUNC-002` — Build Student Course Catalog & Application Submission Workflow**  
   * **Why third:** Currently, students cannot view courses or submit applications through the web interface (routes 404), blocking user onboarding.
   * **Dependencies:** Backend `POST /api/applications` is already implemented and verified; only the frontend UI and route linking are needed.

---

## Detailed Task Specifications

### Priority P0: Critical Security & Release Blockers

#### [P0] SEC-001: Restrict/Remove Unauthenticated Payment Simulator Backdoor
* **Description:** The route `POST /api/payments/paymob/simulate` is unauthenticated and signs simulated callbacks with the server's real `PAYMOB_HMAC_SECRET`, allowing payment bypass.
* **Priority & Rationale:** **P0 (CRITICAL)**. Total financial integrity risk.
* **Affected Files:**
  * `backend/src/routes/paymentRoutes.js` (line 24)
  * `backend/src/controllers/paymentController.js` (lines 72–105)
* **Dependencies & Prerequisites:** None.
* **Recommended Implementation Approach:**
  * Wrap route registration with environment and authorization checks:
    ```javascript
    if (process.env.NODE_ENV !== 'production') {
      router.post('/paymob/simulate', protect, authorize('SUPER_ADMIN'), simulatePayment);
    }
    ```
  * In `paymentController.js`, add an explicit guard returning `404 Not Found` if `process.env.NODE_ENV === 'production'`.
* **Risks & Regressions:** Ensure automated testing scripts in development mode (`scratch/test_phase9.js`) pass test admin JWT tokens when invoking the simulator.
* **Acceptance Criteria:**
  * In non-production environments, calling `/paymob/simulate` without a valid `SUPER_ADMIN` token returns `401 Unauthorized` or `403 Forbidden`.
  * In production mode (`NODE_ENV=production`), the endpoint returns `404 Not Found`.
* **Required Tests:** Integration test verifying that unauthenticated calls fail with 401/404.
* **Definition of Done:** Backdoor neutralized in staging and production builds.

---

#### [P0] SEC-002: Fix Fail-Open Authorization Flaw in Permission Middleware
* **Description:** In `backend/src/middleware/permission.js`, when a user has an empty permissions array (`permissions: []`), the check block is bypassed and `next()` is called, granting unauthorized access.
* **Priority & Rationale:** **P0 (HIGH)**. Privilege escalation vulnerability.
* **Affected Files:**
  * `backend/src/middleware/permission.js` (lines 20–32)
* **Dependencies & Prerequisites:** None.
* **Recommended Implementation Approach:**
  * Refactor `requirePermission` to fail closed:
    ```javascript
    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
    ```
* **Risks & Regressions:** Low. Super admins are already exempted at line 14 (`if (req.user.role === 'SUPER_ADMIN') return next();`).
* **Acceptance Criteria:**
  * A user with `role: 'PRE_UNI_ADMIN'` and `permissions: []` receiving a request requiring `APPROVE_WAIVER` gets `403 Forbidden`.
* **Required Tests:** Unit/Integration test asserting 403 on users with empty or mismatched permissions.
* **Definition of Done:** Middleware fails closed on all permission requirements.

---

### Priority P1: Core Authorization & Learner Self-Service

#### [P1] SEC-003: Fix Cross-Division IDOR in Student Profile Management
* **Description:** In `adminController.js`, student profile endpoints do not verify division boundaries. A Pre-University Admin can view and edit University student records by ID.
* **Priority & Rationale:** **P1 (HIGH)**. Violates division isolation invariant.
* **Affected Files:**
  * `backend/src/controllers/adminController.js` (`getStudentProfileById`, `updateStudentProfile`)
* **Dependencies & Prerequisites:** None.
* **Recommended Implementation Approach:**
  * Populate `userId` on the `StudentProfile` and verify that `userId.division === req.user.division` unless the requester is `SUPER_ADMIN`.
* **Risks & Regressions:** None.
* **Acceptance Criteria:**
  * Attempting to query or update a University student profile using Pre-University admin credentials returns `403 Forbidden`.
* **Required Tests:** Cross-division admin IDOR integration test.
* **Definition of Done:** Division boundaries enforced on all student profile endpoints.

---

#### [P1] SEC-004: Restrict Public User Registration Role Strictly to Student
* **Description:** `authValidators.js` and `authController.js` currently accept `role: 'INSTRUCTOR'` during public self-registration.
* **Priority & Rationale:** **P1 (MEDIUM)**. Prevents unvetted users from acquiring instructor privileges.
* **Affected Files:**
  * `backend/src/validators/authValidators.js`
  * `backend/src/controllers/authController.js` (lines 18–35)
* **Dependencies & Prerequisites:** None.
* **Recommended Implementation Approach:**
  * In `authController.register`, hardcode `role = 'STUDENT'`.
  * Instructors must be provisioned by administrators via an administrative user management view.
* **Risks & Regressions:** Ensure test seed scripts register instructors using administrative endpoints or direct seeding.
* **Acceptance Criteria:**
  * Sending `role: 'INSTRUCTOR'` to `POST /api/auth/register` assigns `role: 'STUDENT'` or returns `400 Bad Request`.
* **Required Tests:** Registration validation test asserting role cannot be escalated during signup.
* **Definition of Done:** Public registration is locked to the Student role.

---

#### [P1] FUNC-001: Implement Student Self-Service Profile API & Client Page
* **Description:** Students have no API endpoint or UI to view or edit their own profile information (institution, guardian details, emergency contact).
* **Priority & Rationale:** **P1 (HIGH)**. Prerequisite for complete learner applications.
* **Affected Files:**
  * `backend/src/routes/studentRoutes.js` (New or updated)
  * `backend/src/controllers/studentController.js` (`getMyProfile`, `updateMyProfile`)
  * `frontend/src/pages/StudentProfilePage.jsx` (New)
  * `frontend/src/App.jsx` (Add `/profile` route)
* **Dependencies & Prerequisites:** Auth middleware `protect` is functional.
* **Recommended Implementation Approach:**
  * Create `GET /api/students/me` and `PUT /api/students/me` scoped to `req.user._id`.
  * Build a clean responsive profile form in the frontend with guardian details for minors.
* **Risks & Regressions:** None.
* **Acceptance Criteria:**
  * Logged-in student visits `/profile`, populates academic data, clicks "Save Profile", and data persists in MongoDB.
* **Required Tests:** End-to-end test verifying student profile read/update.
* **Definition of Done:** Self-service profile editing fully operational.

---

#### [P1] FUNC-002: Build Learner Course Catalog & Application Submission Workflow
* **Description:** Prospective learners currently have no UI page to browse course offerings or submit applications. Navigation links to `/programs` lead to 404.
* **Priority & Rationale:** **P1 (HIGH)**. Core business funnel blocker.
* **Affected Files:**
  * `frontend/src/pages/ProgramCatalogPage.jsx` (New)
  * `frontend/src/components/applications/ApplyModal.jsx` (New)
  * `frontend/src/pages/StudentApplicationsPage.jsx` (New)
  * `frontend/src/App.jsx` (Register `/programs` and `/applications`)
* **Dependencies & Prerequisites:** Backend `GET /api/courses` and `POST /api/applications` are already operational.
* **Recommended Implementation Approach:**
  * Create `ProgramCatalogPage.jsx` with course cards, prerequisite badges, division filters, and an "Apply" button.
  * Clicking "Apply" opens `ApplyModal.jsx`, displays active cohorts, validates readiness assessment prerequisite, and calls `POST /api/applications`.
* **Risks & Regressions:** Ensure non-logged-in users clicking "Apply" are redirected to `/login?redirect=/programs`.
* **Acceptance Criteria:**
  * Student can browse available courses, select an active cohort, submit an application, and view it in `StudentApplicationsPage.jsx`.
* **Required Tests:** Frontend application submission flow integration test.
* **Definition of Done:** Complete learner application flow functioning in UI.

---

### Priority P2: Business Workflows, Automation & Academic Management

#### [P2] FUNC-003: Implement Password Reset Workflow with Secure Tokens
* **Description:** Add self-service "Forgot Password" and "Reset Password" workflows using cryptographically secure time-limited tokens.
* **Priority & Rationale:** **P2 (MEDIUM)**. Essential account recovery capability.
* **Affected Files:**
  * `backend/src/models/User.js` (Add `resetPasswordToken`, `resetPasswordExpire`)
  * `backend/src/controllers/authController.js` (`forgotPassword`, `resetPassword`)
  * `backend/src/routes/authRoutes.js`
  * `frontend/src/pages/ForgotPasswordPage.jsx` & `ResetPasswordPage.jsx`
* **Dependencies & Prerequisites:** Nodemailer service is operational.
* **Recommended Implementation Approach:**
  * Generate `crypto.randomBytes(32).toString('hex')`, hash with SHA-256 for database storage, set 15-minute expiration, and send email link.
* **Acceptance Criteria:**
  * User requests reset email, clicks link, inputs new password, and can log in with new password.
* **Definition of Done:** Password reset flow verified with mock/real email dispatch.

---

#### [P2] FUNC-004: Automate 72-Hour Enrollment Expiration & Waitlist Sweep via Background Cron
* **Description:** `sweepExpiredEnrollments()` currently exists in `enrollmentService.js` but is never executed automatically.
* **Priority & Rationale:** **P2 (HIGH)**. Business logic invariant: unreserved seats must be released to waitlisted students automatically.
* **Affected Files:**
  * `backend/src/server.js`
  * `backend/src/cron/enrollmentSweep.js` (New)
* **Dependencies & Prerequisites:** `enrollmentService.js` and `waitlistService.js` are verified.
* **Recommended Implementation Approach:**
  * Install `node-cron` or configure `setInterval` in `server.js` running every 15 minutes:
    ```javascript
    cron.schedule('*/15 * * * *', async () => {
      logger.info('[CRON] Sweeping expired enrollments...');
      await enrollmentService.sweepExpiredEnrollments();
    });
    ```
* **Acceptance Criteria:**
  * An enrollment with `paymentDeadline < Date.now()` is cancelled automatically within 15 minutes, and the next waitlist candidate is promoted to `PAYMENT_PENDING`.
* **Definition of Done:** Automated daemon sweeps verified in test suite.

---

#### [P2] FUNC-005: Implement Student Classroom & Attendance/Assignment View
* **Description:** Students cannot view their cohort schedule, attendance record, or instructor materials.
* **Priority & Rationale:** **P2 (MEDIUM)**. Academic experience gap.
* **Affected Files:**
  * `frontend/src/pages/StudentClassroomPage.jsx` (New)
  * `frontend/src/App.jsx` (Add route `/my-courses/:cohortId`)
* **Acceptance Criteria:**
  * Enrolled student can see session dates, attendance percentage, downloadable course links, and grades.
* **Definition of Done:** Student cohort classroom accessible for confirmed enrollments.

---

### Priority P3: UI/UX Polish, Accessibility & Responsive Layouts

#### [P3] UI-001: Fix Data Table Mobile Overflow and Responsive Wrappers
* **Description:** Multi-column administrative tables break the viewport width on mobile devices (< 768px).
* **Priority & Rationale:** **P3 (MEDIUM)**. Mobile usability on tablets and smartphones.
* **Affected Files:**
  * `frontend/src/pages/EnrollmentListPage.jsx`
  * `frontend/src/pages/ApplicationListPage.jsx`
  * `frontend/src/pages/InvoiceListPage.jsx`
  * `frontend/src/pages/StudentListPage.jsx`
  * `frontend/src/pages/CertificateListPage.jsx`
* **Recommended Implementation Approach:**
  * Wrap every `<table>` inside `<div className="table-responsive">`.
* **Acceptance Criteria:**
  * No horizontal scrollbar appears on the root page body when viewed at 375px width; table scrolls internally.
* **Definition of Done:** All 5 administrative list pages verified responsive.

---

#### [P3] UI-002: Build Custom Landing Dashboards for Student and Instructor Roles
* **Description:** Replace the generic `EmptyState` placeholder on `/dashboard` with role-specific views.
* **Priority & Rationale:** **P3 (MEDIUM)**. Professional user experience for non-admins.
* **Affected Files:**
  * `frontend/src/pages/DashboardPage.jsx`
  * `frontend/src/components/dashboard/StudentDashboardView.jsx` (New)
  * `frontend/src/components/dashboard/InstructorDashboardView.jsx` (New)
* **Acceptance Criteria:**
  * Student sees: Readiness score, enrolled cohort status, upcoming deadlines, certificate shortcuts.
  * Instructor sees: Assigned active cohorts, student headcount, today's schedule, pending grades.
* **Definition of Done:** Both views integrated into `DashboardPage.jsx` and tested under appropriate role sessions.

---

#### [P3] UI-003: Accessible Modal Dialog Primitive with Focus Management
* **Description:** Custom modal dialogs lack ARIA attributes and focus trapping.
* **Priority & Rationale:** **P3 (LOW)**. WCAG compliance.
* **Affected Files:**
  * `frontend/src/components/common/BaseModal.jsx` (New)
  * Modal components across `frontend/src/components/`
* **Acceptance Criteria:**
  * Modal traps focus; pressing `Escape` closes modal; screen reader announces dialog title.
* **Definition of Done:** Shared modal component deployed across application forms.

---

#### [P3] UI-004: WCAG Color Contrast Tokens and Unlabeled Icon Buttons
* **Description:** Darken muted text token and add `aria-label` to table action buttons.
* **Priority & Rationale:** **P3 (LOW)**.
* **Affected Files:**
  * `frontend/src/styles/variables.css`
  * Table components in `frontend/src/pages/`
* **Acceptance Criteria:**
  * `--text-muted` contrast ratio >= 4.5:1 against card backgrounds; all icon buttons have accessible labels.
* **Definition of Done:** Lighthouse accessibility score >= 90.

---

### Priority P4: DevOps, Automated Testing & Performance

#### [P4] TEST-001: Establish Automated Test Runner (`npm test`)
* **Description:** Add formal test runner (Jest or Mocha) and consolidate `scratch/test_phase*.js` into headless CI tests.
* **Priority & Rationale:** **P4 (MEDIUM)**. Regression prevention during rapid iteration.
* **Affected Files:**
  * `backend/package.json`
  * `backend/tests/` (Directory)
* **Acceptance Criteria:**
  * Running `npm test` runs auth, division scope, enrollment, and payment tests in headless environment and exits 0 on success.
* **Definition of Done:** `npm test` works out-of-the-box in clean workspace.

---

#### [P4] DEVOPS-001: Containerize Platform with Docker and Docker Compose
* **Description:** Add production-ready `Dockerfile` for backend and frontend, and a multi-container `docker-compose.yml` including MongoDB.
* **Priority & Rationale:** **P4 (LOW)**. Standardized deployment.
* **Affected Files:**
  * `backend/Dockerfile`
  * `frontend/Dockerfile`
  * `docker-compose.yml`
* **Acceptance Criteria:**
  * Running `docker compose up --build` brings up backend, frontend, and MongoDB with seeded data.
* **Definition of Done:** Containerized stack verified.

---

#### [P4] PERF-001: Frontend Bundle Optimization and Dynamic Route Splitting
* **Description:** Leverage `React.lazy` and `Suspense` in `App.jsx` to break up the 701 KB JavaScript bundle into lazy-loaded route chunks.
* **Priority & Rationale:** **P4 (LOW)**. Improves initial page load performance on mobile networks.
* **Affected Files:**
  * `frontend/src/App.jsx`
  * `frontend/vite.config.js`
* **Acceptance Criteria:**
  * Initial bundle size drops below 250 KB; individual route chunks load on demand.
* **Definition of Done:** Vite production build generates chunked assets.
