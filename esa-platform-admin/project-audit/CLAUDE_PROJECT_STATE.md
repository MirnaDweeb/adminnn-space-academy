# Space Academy — Claude Project State & Quick-Start Handover

**Audience:** Claude AI Assistant / Automated Coding Agent  
**Context:** Egyptian Space Agency (EgSA) Space Academy Training Platform (`esa-platform-admin`)  
**Audit Completed:** October 2026  
**Status:** Read-Only Audit Complete. System ready for prioritized implementation.

---

## 1. Confirmed Facts (Ground Truth)

* **Repository Nature:** NOT greenfield. Highly developed full-stack application built across Phases 0–15.
* **Backend Stack:** Node.js v25.8.1, Express 4.19.2, Mongoose 8.5.0, MongoDB database `esa_academy` (22 collections, 60 users, 189 applications, 165 enrollments, 82 courses, 52 invoices, 45 payments, 614 audit logs).
* **Frontend Stack:** React 18.3.1, Vite 5.4.8, Bootstrap 5.3.3, FontAwesome 6.6.0, Axios 1.7.7. Compiles cleanly via `npm run build` in 2.0s with zero errors.
* **Active Dev Servers:**
  * Backend API: Listening at `http://localhost:5000` (Health check returns `200 OK`).
  * Frontend Client: Listening at `http://localhost:5173` (Vite dev server running).
* **Do NOT Kill or Restart Dev Servers:** Both servers are actively running in background terminals.
* **Styling Strategy:** Bootstrap 5.3 + Custom CSS Variables in `frontend/src/styles/variables.css` + CSS Modules. Do NOT migrate to Tailwind.

---

## 2. Completed & Working Features

* [x] **User Authentication:** Login, registration, JWT auth, current user resolution, role authorization.
* [x] **Role & Division Multi-Tenancy:** Super Admin, Pre-University Admin, University Admin. Scoped queries on courses, cohorts, applications, invoices.
* [x] **Course & Cohort Management:** Full administrative CRUD, scheduling, capacity caps, instructor assignments.
* [x] **Readiness Assessment Engine:** Timed quiz execution, dynamic scoring, category breakdown, foundation course recommendations.
* [x] **Enrollment & Waitlist Lifecycle:** 72-hour payment window calculation, FIFO waitlist queueing, manual promotion triggers.
* [x] **Invoicing & Paymob Integration:** Invoice generation, SHA-512 HMAC verification on gateway callbacks, fee waivers, administrative discounts.
* [x] **Certificate Issuance & Verification:** Unique serial generation, SHA-256 verification hash, public verification endpoint `/api/certificates/verify/:certNumber`.
* [x] **Administrative Analytics & Audit Logging:** KPI dashboards, CSV export streaming, automated audit log capture (614 entries recorded).

---

## 3. Critical Blockers & Known Risks (Immediate Fixes Required)

1. **SEC-001 (CRITICAL — Payment Simulator Backdoor) — ✅ IMPLEMENTED_PARTIAL_TESTED:**  
   Implementation complete as of 2026-10-09. See SEC-001 Implementation Summary below.  
2. **SEC-002 (HIGH — Permission Middleware Fail-Open):**  
   In `backend/src/middleware/permission.js` (lines 23–28), if a user has `permissions: []` (the default in `User.js`), the check is skipped and `next()` is called, bypassing permission authorization entirely.
3. **SEC-004 (MEDIUM — Instructor Self-Registration):**  
   `authValidators.js` accepts `role: 'INSTRUCTOR'`, allowing anyone on the internet to register as an instructor.
4. **Missing Student Routes (404s):**  
   Links in `StudentAssessmentPage.jsx` pointing to `/programs` and `/applications` 404 because those routes are not yet registered in `frontend/src/App.jsx`.

---

## 3a. SEC-001 Implementation Summary (2026-10-09)

**Status:** `IMPLEMENTED_PARTIAL_TESTED`  
**Implementation completed by:** Automated agent (SEC-001 task spec).

### Changes Made

| File | Change Summary |
|---|---|
| `backend/src/routes/paymentRoutes.js` | Removed `if(NODE_ENV !== 'production')` guard. Route always registered. Added `protect` + `authorize(STUDENT, SUPER_ADMIN)` so unauthenticated → 401, wrong-role → 403. |
| `backend/src/controllers/paymentController.js` | Full defense-in-depth rewrite of `simulateSandboxPayment`: production+IS_SIMULATION guard (404), required transactionNumber (400), load transaction, STUDENT ownership check via Invoice→Enrollment chain (403), status/provider/recordingType guard (400), server-side amountCents derivation from Invoice (ignores client value), PAYMENT_SIMULATED audit log. |
| `backend/src/services/paymobService.js` | Added `assertPaymobConfig()` fail-fast function. Mock fallbacks now conditional on `NODE_ENV !== 'production'`. `IS_SIMULATION` is always `false` in production. |
| `backend/src/server.js` | Calls `assertPaymobConfig()` before `connectDB()`/`app.listen()`. |
| `frontend/src/pages/student/StudentInvoicesPage.jsx` | Removed `amountCents` from simulate payload. Added graceful 404/403 error path ("Sandbox payments are not available in this environment"). |
| `backend/tests/sec001.paymentSimulator.test.js` | New integration test covering AC-1–7, 9–10. Spawns production child process for AC-6/8. |
| `backend/package.json` | Added `"test:sec001": "node tests/sec001.paymentSimulator.test.js"` script. |

### New Production Config Assertion

`paymobService.assertPaymobConfig()` (called at startup) throws a **non-secret** fatal error if, in `NODE_ENV=production`:
- Any of `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID` is missing.
- `PAYMOB_API_KEY` starts with `mock`.
- `PAYMOB_SANDBOX_SIMULATION=true`.

### Test Evidence (run: `npm run test:sec001` from `backend/`)

```
AC-1: Unauthenticated POST /paymob/simulate → 401              ✅ PASS
AC-5: INSTRUCTOR role → 403                                     ✅ PASS
SETUP: Create pending transaction for student@esa.dev          ❌ SKIP (no eligible invoice in current DB state)
  ↳ AC-2, AC-3, AC-4, AC-7, AC-10 could not run (need seeded enrollment)
AC-9: Forged callback with invalid HMAC → 401                  ✅ PASS
AC-8: Production server refuses to start (missing Paymob cfg)  ✅ PASS
AC-6: Implied pass (server refused to start in prod)           ✅ PASS
```

**Manual verification:**
- `curl` (PowerShell `Invoke-WebRequest`) to unauthenticated `/paymob/simulate` → `{"success":false,"error":{"message":"Authentication token missing"}}` (401). ✅
- `npm run build` (frontend) → zero errors, built in 3.06s. ✅
- `node -c` syntax check on all 5 changed backend files → all PASS. ✅

**Unverified (data-dependency):** AC-2, AC-3, AC-4, AC-7, AC-10 require a live PENDING PAYMOB ONLINE PaymentTransaction owned by `student@esa.dev`. No such transaction exists in the current DB. To verify: complete a checkout initiation flow via the sandbox UI as `student@esa.dev`, then re-run the test.

---

## 4. Outstanding Tasks (Ranked Execution Backlog)

| Task ID | Priority | Area | Task Summary |
|---|---|---|---|
| **SEC-002** | **P0** | Backend Auth | Fixing fail-open logic in `backend/src/middleware/permission.js` |
| **SEC-004** | **P1** | Backend Auth | Restricting `POST /api/auth/register` to `STUDENT` only |
| **FUNC-001** | **P1** | Full-Stack | Adding `GET/PUT /api/students/me` and student `/profile` UI |
| **FUNC-002** | **P1** | Frontend | Building `ProgramCatalogPage.jsx` and `ApplyModal.jsx` |
| **FUNC-004** | **P2** | Backend DevOps | Adding `node-cron` daemon for 72-hour enrollment expiration sweep |
| **FUNC-003** | **P2** | Full-Stack | Adding secure token-based Password Reset flow |
| **UI-001** | **P3** | Frontend UI | Adding `.table-responsive` wrappers to administrative data tables |
| **UI-002** | **P3** | Frontend UI | Building dedicated Student and Instructor dashboard homepages |

---

## 5. Exact Next Recommended Task (Ready for Execution)

### Task ID: `SEC-002`
* **File to Edit:** `backend/src/middleware/permission.js`
* **What to Do:** Fix the fail-open branch where `permissions: []` bypasses authorization entirely. Should default-deny instead.
* **Verification Command:** Attempt an action requiring a permission with a user whose `permissions` array is empty — confirm it returns 403.
* **Prerequisites / Dependencies:** None. Ready for immediate implementation.
