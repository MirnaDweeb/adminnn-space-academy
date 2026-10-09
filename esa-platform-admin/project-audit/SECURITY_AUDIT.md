# Space Academy — Application Security Audit Report

**Target Platform:** Egyptian Space Agency (EgSA) — Space Academy Training Management Platform  
**System Repository:** `esa-platform-admin`  
**Audit Date:** October 2026  
**Auditor:** Senior Application Security Auditor & Full-Stack Architect  
**Classification:** HIGH PRIORITY / STRICT COMPLIANCE  
**Policy Adherence:** No passwords, tokens, API keys, or HMAC secrets are reproduced in this report. Affected files and secret types are identified by reference only.

---

## Executive Security Summary

An exhaustive security audit was conducted across the backend API, database schemas, authentication middleware, payment processing workflows, and frontend client code of the Space Academy platform.

The audit identified **1 CRITICAL**, **2 HIGH**, **3 MEDIUM**, and **2 LOW** severity security vulnerabilities.

### Immediate Action Required
The most urgent vulnerability (**SEC-001**) is an **unauthenticated payment simulator backdoor** (`POST /api/payments/paymob/simulate`) that signs Paymob payment callback payloads using the server's real HMAC secret stored in the server environment. This allows any unauthenticated actor to transition any invoice to `PAID` and confirm course enrollments without paying. 

Furthermore, **SEC-002** exposes a **fail-open vulnerability in the permission middleware**, where users with an empty permissions array bypass permission validation entirely.

---

## Security Invariants Checklist

| Security Invariant | Status | Evidence / Notes |
|---|---|---|
| A Student must not access another student's protected records | **PASS / CONDITIONAL** | `GET /api/applications/mine` scopes strictly by `req.user._id`. However, students currently lack self-service profile access. |
| An Instructor must only access assigned courses & learners | **PASS** | `cohortRoutes.js` and `academicRoutes.js` enforce instructor cohort assignment checks before granting access to learner data. |
| Pre-University Admin must not access or modify University records | **FAIL (SEC-003)** | `divisionScope.js` protects courses and enrollments, but `adminController.js` student profile endpoints lack division boundary checks. |
| A Division Admin must not gain Super Admin privileges | **FAIL (SEC-002)** | Empty `permissions: []` array bypasses `permission.js` validation, granting access to permission-guarded routes. |
| Hiding a frontend menu item must never be treated as authorization | **PASS** | Backend endpoints independently enforce `protect` and `authorize` middleware. |
| Financial & administrative actions must be audited | **PASS** | `auditLogger.js` middleware logs fee waivers, discounts, application reviews, and certificate revocations (614 audit logs recorded). |
| Unauthorized requests must fail safely without leaking sensitive data | **PASS** | Express global error handler (`errorHandler.js`) strips stack traces when `NODE_ENV === 'production'`. |

---

## Detailed Vulnerability Findings

### SEC-001: Unauthenticated Payment Simulator Backdoor (CRITICAL)

* **Severity:** **CRITICAL** (CVSS: 9.8 - `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`)
* **Affected Area:** Payment Processing & Financial Accounting
* **File Paths:**
  * `backend/src/routes/paymentRoutes.js` (line 24)
  * `backend/src/controllers/paymentController.js` (lines 72–105)
  * `backend/src/services/paymobService.js` (lines 142–170)
* **Exact Evidence:**
  In `backend/src/routes/paymentRoutes.js`:
  ```javascript
  // Line 24
  router.post('/paymob/simulate', simulatePayment);
  ```
  Notice that `protect` and `authorize` middleware are completely omitted from this route.
  In `backend/src/controllers/paymentController.js`:
  ```javascript
  exports.simulatePayment = async (req, res, next) => {
    const { transactionNumber, success } = req.body;
    // ...
    const callbackData = paymobService.buildSimulatedCallback(invoice, transactionNumber, isSuccess);
    // paymobService uses process.env.PAYMOB_HMAC_SECRET to calculate a valid SHA-512 HMAC!
    const result = await paymentService.processCallback(callbackData);
    // Updates invoice to PAID, updates enrollment to CONFIRMED!
  };
  ```
  There is no check for `process.env.NODE_ENV === 'production'`.
* **Realistic Exploit Scenario:**
  1. An attacker inspects the frontend network tab or scans the API routes.
  2. The attacker applies for a course and receives an invoice with `transactionNumber: "INV-2026-XXXX"`.
  3. The attacker sends a `POST` request to `https://platform.egsa.gov.eg/api/payments/paymob/simulate` with `{ "transactionNumber": "INV-2026-XXXX", "success": true }`.
  4. The backend generates a cryptographically signed HMAC payload using EgSA's private Paymob HMAC secret and processes it internally as a legitimate gateway payment.
  5. The student is immediately marked `PAID`, enrolled in the space program, and issued seats without any money reaching EgSA's bank account.
* **Remediation:**
  1. Restrict this route strictly to development environments:
     ```javascript
     if (process.env.NODE_ENV !== 'production') {
       router.post('/paymob/simulate', protect, authorize('SUPER_ADMIN'), simulatePayment);
     }
     ```
  2. Ensure the production build strips or 404s on all `/simulate` endpoints.
* **Verification Steps:**
  1. In a staging environment, execute:
     `curl -X POST http://localhost:5000/api/payments/paymob/simulate -H "Content-Type: application/json" -d '{"transactionNumber":"INV-TEST","success":true}'`
  2. Verify that the server returns `404 Not Found` or `401 Unauthorized`.

---

### SEC-002: Permission Middleware Fail-Open Flaw on Empty Permissions Array (HIGH)

* **Severity:** **HIGH** (CVSS: 8.8 - `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H`)
* **Affected Area:** Server-Side Authorization & Privilege Escalation
* **File Paths:**
  * `backend/src/middleware/permission.js` (lines 20–32)
* **Exact Evidence:**
  In `backend/src/middleware/permission.js`:
  ```javascript
  const requirePermission = (...requiredPermissions) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }
      const userPermissions = req.user.permissions || [];
      // VULNERABILITY: If userPermissions is empty, this entire block is skipped!
      if (userPermissions && userPermissions.length > 0) {
        const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
        if (!hasPermission) {
          return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
      }
      // If user has NO permissions (length === 0), it reaches next() and grants access!
      next();
    };
  };
  ```
* **Realistic Exploit Scenario:**
  1. In `User.js`, default permissions for any new user or division admin is `permissions: []`.
  2. A `PRE_UNI_ADMIN` with `permissions: []` attempts an action guarded by `requirePermission('MANAGE_ALL_FINANCES')`.
  3. Because `userPermissions.length === 0`, the loop check is skipped entirely and `next()` is executed.
  4. The division admin performs restricted actions without ever having been granted that specific permission.
* **Remediation:**
  Rewrite the middleware to fail closed:
  ```javascript
  const requirePermission = (...requiredPermissions) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }
      const userPermissions = req.user.permissions || [];
      const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }
      next();
    };
  };
  ```
* **Verification Steps:**
  1. Create a user with `role: 'PRE_UNI_ADMIN'` and `permissions: []`.
  2. Send an authenticated request to an endpoint protected by `requirePermission('FINANCIAL_OVERRIDE')`.
  3. Ensure the server strictly returns `403 Forbidden`.

---

### SEC-003: Cross-Division IDOR in Student Profile Management (HIGH)

* **Severity:** **HIGH** (CVSS: 7.5 - `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`)
* **Affected Area:** Division-Based Access Control (Admin Operations)
* **File Paths:**
  * `backend/src/controllers/adminController.js` (`getStudentProfileById`, `updateStudentProfile`)
  * `backend/src/routes/adminRoutes.js`
* **Exact Evidence:**
  In `backend/src/controllers/adminController.js`:
  ```javascript
  exports.updateStudentProfile = async (req, res, next) => {
    const { id } = req.params; // studentProfileId
    const profile = await StudentProfile.findById(id).populate('userId');
    if (!profile) return res.status(404)...;
    // MISSING: Check whether profile.userId.division matches req.user.division!
    Object.assign(profile, req.body);
    await profile.save();
    res.json({ success: true, data: profile });
  };
  ```
  `divisionScope.js` is not applied to `StudentProfile` queries in `adminController.js`.
* **Realistic Exploit Scenario:**
  A `PRE_UNI_ADMIN` discovers or enumerates the MongoDB ObjectId of a `UNIVERSITY` student and issues a `PUT /api/admin/students/:id` request. The update succeeds, violating the strict mandate that Pre-University administrators must never inspect or modify University division records.
* **Remediation:**
  In `adminController.js`, verify:
  ```javascript
  if (req.user.role !== 'SUPER_ADMIN') {
    const studentUser = await User.findById(profile.userId);
    if (studentUser && studentUser.division !== req.user.division) {
      return res.status(403).json({ success: false, message: 'Access denied across academic divisions' });
    }
  }
  ```
* **Verification Steps:**
  1. Authenticate as a Pre-University admin.
  2. Issue a `GET` and `PUT` request against a University student's profile ID.
  3. Verify the response is `403 Forbidden`.

---

### SEC-004: Unrestricted Public Registration for Instructor Roles (MEDIUM)

* **Severity:** **MEDIUM** (CVSS: 6.5 - `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N`)
* **Affected Area:** Authentication & User Provisioning
* **File Paths:**
  * `backend/src/validators/authValidators.js`
  * `backend/src/controllers/authController.js` (lines 18–35)
* **Exact Evidence:**
  In `backend/src/validators/authValidators.js`:
  ```javascript
  body('role')
    .optional()
    .isIn(['STUDENT', 'INSTRUCTOR'])
    .withMessage('Role must be either STUDENT or INSTRUCTOR')
  ```
  In `backend/src/controllers/authController.js`:
  ```javascript
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'STUDENT'
  });
  ```
* **Realistic Exploit Scenario:**
  Any public internet user can send `{ "name": "Fake Instructor", "email": "fake@domain.com", "password": "...", "role": "INSTRUCTOR" }` to `POST /api/auth/register`. The account is created immediately with instructor privileges, allowing the user to access `/instructor/cohorts`, view cohort assignments, and access academic grading tools.
* **Remediation:**
  In `authController.register`, force `role = 'STUDENT'`. Instructor accounts must only be created by `SUPER_ADMIN` or invited via administrative user management.
* **Verification Steps:**
  1. Send a registration request with `"role": "INSTRUCTOR"`.
  2. Verify that the role defaults to `STUDENT` or rejects with `400 Bad Request`.

---

### SEC-005: Stateless JWT Without Invalidation or Blacklisting (MEDIUM)

* **Severity:** **MEDIUM** (CVSS: 5.3 - `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N`)
* **Affected Area:** Session Management
* **File Paths:**
  * `backend/src/middleware/auth.js`
  * `backend/src/controllers/authController.js`
  * `frontend/src/context/AuthContext.jsx`
* **Exact Evidence:**
  JWT tokens are configured with `JWT_EXPIRES_IN=7d`.
  When a user logs out in `frontend/src/context/AuthContext.jsx`:
  ```javascript
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };
  ```
  No notification is sent to the backend, and there is no token blacklist. If a token is captured from local storage or network logs, it remains fully functional for 7 days.
* **Remediation:**
  1. Add a `tokenVersion: { type: Number, default: 0 }` to `User.js`.
  2. Embed `tokenVersion` in the JWT payload.
  3. On password change or logout, increment `tokenVersion`.
  4. In `auth.js` (`protect` middleware), reject the token if `payload.tokenVersion !== user.tokenVersion`.
* **Verification Steps:**
  1. Log in, extract JWT.
  2. Change password or trigger logout.
  3. Attempt API request with the original JWT. Verify it receives `401 Unauthorized`.

---

### SEC-006: Plaintext Storage of Sensitive National Identification Numbers (MEDIUM)

* **Severity:** **MEDIUM** (CVSS: 5.0 - `AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:N/A:N`)
* **Affected Area:** Personally Identifiable Information (PII) Data Protection
* **File Paths:**
  * `backend/src/models/StudentProfile.js`
* **Exact Evidence:**
  In `StudentProfile.js`:
  ```javascript
  nationalId: {
    type: String,
    required: true,
    trim: true
  }
  ```
  Egyptian National IDs (14 digits containing birth date, governorate of origin, and gender) are stored in plaintext. If database backups are inadvertently exposed, student PII is immediately compromised.
* **Remediation:**
  1. Encrypt `nationalId` at rest using AES-256-GCM.
  2. Provide a helper method `getMaskedNationalId()` (`XXXXXXXXXXX1234`) for frontend display.
* **Verification Steps:**
  1. Query MongoDB directly: `db.studentprofiles.findOne()`.
  2. Verify `nationalId` displays as encrypted ciphertext, not raw digits.

---

### SEC-007: Vulnerable Transitive Node Dependencies (LOW / INFORMATIONAL)

* **Severity:** **LOW / INFORMATIONAL**
* **Affected Area:** Build Pipeline & Third-Party Libraries
* **File Paths:**
  * `backend/package.json`
  * `frontend/package.json`
* **Exact Evidence:**
  Running `npm audit` on the existing workspace produced:
  * Backend: 1 Critical, 4 High vulnerabilities (primarily in transitive `tar` and `braces` versions used by dev tools).
  * Frontend: 2 High, 3 Moderate vulnerabilities (in `vite`, `esbuild`, `react-router-dom`).
* **Remediation:**
  Run `npm audit fix` during the next scheduled dependency update window and verify test suite stability.

---

### SEC-008: Missing Strict Content Security Policy (CSP) & Permissive CORS (LOW)

* **Severity:** **LOW**
* **Affected Area:** Transport & Browser Headers
* **File Paths:**
  * `backend/src/app.js` (lines 19–32)
* **Exact Evidence:**
  Helmet is enabled, but default CSP allows arbitrary inline script execution unless specifically configured. CORS configuration allows `localhost:5173` and `localhost:3000` without checking `process.env.NODE_ENV === 'production'`.
* **Remediation:**
  Configure strict CORS origins matching only official EgSA domain names when in production.

---

## Vulnerability Remediation Priority Matrix

| ID | Title | Severity | Priority | Effort | Target Phase |
|---|---|---|---|---|---|
| **SEC-001** | Unauthenticated Payment Simulator Backdoor | CRITICAL | **P0** | 1 hour | Immediate (Before Deploy) |
| **SEC-002** | Permission Middleware Fail-Open Flaw | HIGH | **P0** | 1 hour | Immediate (Before Deploy) |
| **SEC-003** | Cross-Division IDOR in Student Profiles | HIGH | **P1** | 2 hours | Next Development Sprint |
| **SEC-004** | Unrestricted Self-Registration for Instructors | MEDIUM | **P1** | 1 hour | Next Development Sprint |
| **SEC-005** | Stateless JWT Without Invalidation | MEDIUM | **P2** | 4 hours | Hardening Sprint |
| **SEC-006** | Plaintext National ID Storage | MEDIUM | **P2** | 4 hours | Hardening Sprint |
| **SEC-007** | Dependency Vulnerabilities | LOW | **P3** | 2 hours | Maintenance Sprint |
| **SEC-008** | CSP & CORS Hardening | LOW | **P3** | 2 hours | Maintenance Sprint |
