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

1. **SEC-001 (CRITICAL — Payment Simulator Backdoor):**  
   `POST /api/payments/paymob/simulate` in `backend/src/routes/paymentRoutes.js` (line 24) is completely unauthenticated and signs valid Paymob callbacks using the server's private HMAC secret. Any user can forge payments and confirm enrollments.
2. **SEC-002 (HIGH — Permission Middleware Fail-Open):**  
   In `backend/src/middleware/permission.js` (lines 23–28), if a user has `permissions: []` (the default in `User.js`), the check is skipped and `next()` is called, bypassing permission authorization entirely.
3. **SEC-004 (MEDIUM — Instructor Self-Registration):**  
   `authValidators.js` accepts `role: 'INSTRUCTOR'`, allowing anyone on the internet to register as an instructor.
4. **Missing Student Routes (404s):**  
   Links in `StudentAssessmentPage.jsx` pointing to `/programs` and `/applications` 404 because those routes are not yet registered in `frontend/src/App.jsx`.

---

## 4. Outstanding Tasks (Ranked Execution Backlog)

| Task ID | Priority | Area | Task Summary |
|---|---|---|---|
| **SEC-001** | **P0** | Backend Security | Gating/removing unauthenticated `/api/payments/paymob/simulate` |
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

### Task ID: `SEC-001`
* **File to Edit:** `backend/src/routes/paymentRoutes.js` and `backend/src/controllers/paymentController.js`
* **What to Do:**
  1. In `paymentRoutes.js`:
     ```javascript
     // Protect simulate endpoint strictly in non-production environments
     if (process.env.NODE_ENV !== 'production') {
       router.post('/paymob/simulate', protect, authorize('SUPER_ADMIN'), simulatePayment);
     }
     ```
  2. In `paymentController.js`:
     ```javascript
     if (process.env.NODE_ENV === 'production') {
       return res.status(404).json({ success: false, message: 'Endpoint not available in production' });
     }
     ```
* **Verification Command:**
  Send unauthenticated POST request to `http://localhost:5000/api/payments/paymob/simulate` and confirm it returns `401 Unauthorized` or `404 Not Found`.
* **Prerequisites / Dependencies:** None. Ready for immediate implementation.
