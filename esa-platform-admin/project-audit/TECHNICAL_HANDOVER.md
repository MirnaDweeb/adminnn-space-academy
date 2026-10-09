# Space Academy — Technical Handover Guide

**Target Platform:** Egyptian Space Agency (EgSA) — Space Academy Training Management Platform  
**System Repository:** `esa-platform-admin`  
**Audit Date:** October 2026  
**Auditor:** Senior Full-Stack Architect  
**Audience:** Incoming Lead Engineers, Claude Development Agents, DevOps Engineers  

---

## 1. Verified System Architecture & Technical Stack

```
+-----------------------------------------------------------------------------+
|                                CLIENT LAYER                                 |
|  React 18.3.1 | Vite 5.4.8 | Bootstrap 5.3.3 | FontAwesome 6.6.0 | Axios   |
|  - Custom Design Tokens (variables.css) + CSS Modules                       |
|  - AuthContext (JWT in localStorage) + ToastContext                         |
|  - Responsive Shell (AppLayout, Sidebar, Navbar)                            |
+-----------------------------------------------------------------------------+
                                      |
                                      | HTTP REST (JSON) + Bearer Token
                                      v
+-----------------------------------------------------------------------------+
|                                BACKEND API                                  |
|  Node.js v25.8.1 | Express 4.19.2 | Mongoose 8.5.0                          |
|  - Architecture: Route -> Middleware -> Controller -> Service -> Model      |
|  - Key Middleware: protect (auth), authorize (RBAC), scopeDivision (Tenant),|
|    auditLogger, errorHandler, rateLimiter, helmet                           |
+-----------------------------------------------------------------------------+
               |                                              |
               v                                              v
+-----------------------------+               +-------------------------------+
|      PERSISTENCE LAYER      |               |     EXTERNAL INTEGRATIONS     |
|  MongoDB 6.0+ (Local/Atlas) |               |  - Paymob Gateway (HMAC Webhooks)|
|  - Database: esa_academy    |               |  - Nodemailer (SMTP / Mock)   |
|  - 22 Collections           |               +-------------------------------+
+-----------------------------+
```

---

## 2. Environment Prerequisites & Node Toolchain

* **Node.js Runtime:** `v20.x` or higher (`v25.8.1` confirmed active and verified).
* **Package Manager:** `npm v10.x` or higher (`v11.7.0` confirmed active).
* **Database:** Local MongoDB instance running on `mongodb://127.0.0.1:27017` or MongoDB Atlas URI.
* **Operating System:** Platform agnostic (Windows 11 verified).

---

## 3. Directory Layout & Critical File Map

```
esa-platform-admin/
├── backend/
│   ├── src/
│   │   ├── app.js               # Express application initialization & middleware
│   │   ├── server.js            # HTTP server entry point & MongoDB connection
│   │   ├── controllers/         # Request handling & HTTP response coordination
│   │   │   ├── authController.js
│   │   │   ├── courseController.js
│   │   │   ├── cohortController.js
│   │   │   ├── applicationController.js
│   │   │   ├── enrollmentController.js
│   │   │   ├── invoiceController.js
│   │   │   ├── paymentController.js   # Contains SEC-001 simulation backdoor
│   │   │   └── certificateController.js
│   │   ├── middleware/          # Security & request lifecycle guards
│   │   │   ├── auth.js          # JWT verification & role authorization
│   │   │   ├── divisionScope.js # Tenant division scoping for queries
│   │   │   ├── permission.js    # Fine-grained permission checks (contains SEC-002)
│   │   │   └── auditLogger.js   # Automated administrative audit trail
│   │   ├── models/              # Mongoose schemas (22 database collections)
│   │   ├── routes/              # Express API route declarations
│   │   ├── services/            # Business logic (paymob, waitlist, certs, email)
│   │   └── validators/          # Express-validator schema rules
│   ├── .env                     # Local environment configuration
│   └── package.json             # Backend dependencies & script declarations
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Client router & route protection mapping
│   │   ├── main.jsx             # React DOM root entry point
│   │   ├── components/
│   │   │   ├── common/          # Shared UI (LoadingSpinner, EmptyState, AlertBanner)
│   │   │   ├── layout/          # Application shell (AppLayout, Sidebar, Navbar)
│   │   │   └── [domain]/        # Modals & domain components
│   │   ├── context/             # React Contexts (AuthContext, ToastContext)
│   │   ├── pages/               # Top-level screen views (18 pages)
│   │   ├── services/            # Axios API client wrapper
│   │   └── styles/              # Global CSS & Design Tokens (variables.css)
│   ├── vite.config.js           # Vite build & dev server config
│   └── package.json             # Frontend dependencies & script declarations
│
├── project-audit/               # Handover reports directory (Generated by Auditor)
└── scratch/                     # Test automation verification scripts (Phases 0–15)
```

---

## 4. Configuration Requirements (.env Specification)

The application requires a `.env` file inside `backend/`. 

> [!NOTE]
> Values are documented here by format and description only. Never commit production secrets to Git.

| Variable Name | Required | Example Format | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` | HTTP port for the Express API |
| `NODE_ENV` | **Required** | `development` / `production` | Controls stack traces & security guards |
| `MONGODB_URI` | **Required** | `mongodb://127.0.0.1:27017/esa_academy` | Database connection string |
| `JWT_SECRET` | **Required** | `[High-entropy 64-char string]` | Secret key used for signing session JWTs |
| `JWT_EXPIRES_IN`| Optional | `7d` | Token expiration period |
| `PAYMOB_API_KEY`| Optional | `[Paymob Sandbox/Live API Key]` | Paymob gateway authentication |
| `PAYMOB_HMAC_SECRET`| **Required** | `[Paymob HMAC Hex Key]` | SHA-512 webhook signature verification |
| `PAYMOB_INTEGRATION_ID_CARD`| Optional | `1234567` | Paymob card payment channel ID |
| `SMTP_HOST` | Optional | `smtp.example.com` | Outgoing email server (Mock mode if omitted)|
| `SMTP_PORT` | Optional | `587` | Outgoing SMTP port |
| `SMTP_USER` | Optional | `noreply@egsa.gov.eg` | SMTP authentication username |
| `SMTP_PASS` | Optional | `[Password]` | SMTP authentication password |
| `EMAIL_FROM`| Optional | `"EgSA Space Academy" <noreply@egsa.gov.eg>` | Outgoing email sender string |

---

## 5. Verified Development & Operational Commands

### Starting the Backend Server
```bash
cd backend
# Development mode with nodemon auto-restart:
npm run dev

# Production daemon mode:
npm start
```
* **Health Check Verification:**
  `curl http://localhost:5000/api/health`
  Returns: `{"status":"ok","database":"connected","uptime":...}`

### Starting the Frontend Development Server
```bash
cd frontend
# Vite hot-reloading dev server:
npm run dev
```
* **Local Web Interface:** Runs at `http://localhost:5173`.

### Validating the Frontend Production Bundle
```bash
cd frontend
# Validates TypeScript/JSX and compiles distribution bundle to /dist:
npm run build
```
* Confirmed: Compiles cleanly in ~2.0 seconds with zero compilation errors.

---

## 6. Current Blockers & Critical Operational Warnings

1. **CRITICAL WARNING (SEC-001):**  
   Do NOT deploy `backend/src/routes/paymentRoutes.js` to a public environment until `router.post('/paymob/simulate')` is either removed or gated behind `NODE_ENV !== 'production'` and restricted to `SUPER_ADMIN`. Leaving this endpoint accessible allows arbitrary invoice payments without real transactions.
2. **AUTHORIZATION WARNING (SEC-002):**  
   `backend/src/middleware/permission.js` fails open if `req.user.permissions` is empty. Apply the one-line fix outlined in `DEVELOPMENT_BACKLOG.md` before provisioning division administrators.
3. **MISSING LEARNER CATALOG ROUTE:**  
   The student portal currently lacks `/programs` and `/applications` routes in `frontend/src/App.jsx`. Navigating to these URLs results in `NotFoundPage`.

---

## 7. Recommended Safe Next Steps for Claude & Incoming Engineers

1. **Step 1:** Open `backend/src/routes/paymentRoutes.js` and wrap `/paymob/simulate` with `if (process.env.NODE_ENV !== 'production')` and `protect, authorize('SUPER_ADMIN')`.
2. **Step 2:** Open `backend/src/middleware/permission.js` and invert the check so it fails closed when `userPermissions` does not contain the required capability.
3. **Step 3:** Open `backend/src/controllers/authController.js` and enforce `role = 'STUDENT'` on registration.
4. **Step 4:** Implement `ProgramCatalogPage.jsx` and `ApplyModal.jsx` in the frontend, linking them in `App.jsx` to complete the student application flow.
5. **Step 5:** Add `node-cron` in `server.js` to run `sweepExpiredEnrollments()` every 15 minutes.
