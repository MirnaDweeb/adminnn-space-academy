# Space Academy — Project Status & Architecture Report

**Project:** Egyptian Space Agency (EgSA) — Academy Training Management Platform  
**System Designation:** Space Academy Platform (`esa-platform-admin`)  
**Audit Date:** October 9, 2026  
**Auditor:** Senior Full-Stack Software Engineer & Lead Application Security Architect  
**Current State:** Advanced Pre-Production Foundation (Phases 0 through 15 implemented across Core Platform, Delivery, Finance, Credentials, and Analytics)

---

## 1. Executive Overview

The **Space Academy Training Management Platform** is a specialized two-tier institutional application developed for the Egyptian Space Agency (EgSA). Its primary purpose is managing educational space science and aerospace engineering training programs across two distinct academic divisions:
1. **Pre-University Division (`PRE_UNIVERSITY`):** Target audience includes preparatory and secondary school students entering introductory space engineering, rocketry, orbital mechanics, and satellite fundamentals.
2. **University Division (`UNIVERSITY`):** Target audience includes undergraduate and graduate engineering and physics students entering advanced satellite assembly, payload design, orbital dynamics, telemetry, and ground station operations.

Contrary to an initial greenfield prototype, the active codebase represents a mature, connected full-stack application with deep backend services and extensive administrative interfaces. The database contains over 20 collections and hundreds of real records verifying historical development across 15 development phases (from base auth and administrative scoping up to Paymob digital payment integrations, PDF credential issuance, and analytics reporting).

However, while backend services and administrative dashboards are feature-rich, critical gaps remain in the student self-service lifecycle (missing student course browsing and application submission interfaces), alongside critical security vulnerabilities in payment testing endpoints and permission evaluation logic.

---

## 2. Actual Technology Stack

The stack was verified by inspecting manifests, configurations, package locks, and runtime processes:

| Tier | Component | Technology & Version | Verification Evidence |
|---|---|---|---|
| **Runtime Environment** | Node.js | v25.8.1 (x64) on Windows | Verified via `node -v` |
| **Backend Framework** | Express | `express@4.19.2` | `backend/package.json`, `backend/src/app.js` |
| **Database & ODM** | MongoDB / Mongoose | `mongoose@8.5.0` (MongoDB local instance `esa_academy`) | `backend/src/config/db.js`, 22 active collections |
| **Authentication** | JWT & Bcrypt | `jsonwebtoken@9.0.2`, `bcrypt@5.1.1` (12 salt rounds) | `backend/src/middleware/auth.js`, `backend/src/controllers/authController.js` |
| **Security Headers & Limits** | Helmet & Rate Limit | `helmet@7.1.0`, `express-rate-limit@7.4.0` | `backend/src/app.js` |
| **Document Generation** | PDFKit | `pdfkit@0.20.2` | `backend/src/utils/pdfGenerator.js`, `reportPdfGenerator.js` |
| **Email Transport** | Nodemailer | `nodemailer@10.0.11` | `backend/src/services/notificationService.js` |
| **Frontend Framework** | React | `react@18.3.1`, `react-dom@18.3.1` | `frontend/package.json` |
| **Build Tool & Bundler** | Vite | `vite@5.4.8`, `@vitejs/plugin-react@4.3.1` | `frontend/vite.config.js`, `frontend/package.json` |
| **Frontend Routing** | React Router DOM | `react-router-dom@6.26.2` | `frontend/src/App.jsx` |
| **UI Components & Icons** | Bootstrap & FontAwesome | `bootstrap@5.3.3`, `@fortawesome/fontawesome-free@6.6.0` | `frontend/src/main.jsx` |
| **HTTP Client** | Axios | `axios@1.7.7` | `frontend/src/services/api/apiClient.js` |
| **Styling Architecture** | CSS Modules & CSS Variables | Vanilla CSS Modules scoped per component | `frontend/src/styles/variables.css`, `*.module.css` |

---

## 3. Repository Architecture & Directory Map

The repository is structured as an decoupled, independent monorepo containing two core applications (`backend/` and `frontend/`) and a verification directory (`scratch/`).

```
esa-platform-admin/
├── README.md                           # Foundation specification and developer run instructions
├── backend/                            # RESTful API Service (Express + MongoDB)
│   ├── .env.example                    # Sample environment variables
│   ├── .env                            # Active environment configuration (contains DB & Paymob keys)
│   ├── package.json                    # Backend dependencies and scripts
│   ├── nodemon.json                    # Development process watcher configuration
│   └── src/
│       ├── app.js                      # Express app factory (middleware, CORS, Helmet, routing)
│       ├── server.js                   # Node HTTP server entrypoint & graceful shutdown
│       ├── config/
│       │   └── db.js                   # Mongoose connection logic
│       ├── constants/
│       │   ├── roles.js                # Roles: SUPER_ADMIN, PRE_UNIVERSITY_ADMIN, UNIVERSITY_ADMIN, INSTRUCTOR, STUDENT
│       │   ├── divisions.js            # Divisions: PRE_UNIVERSITY, UNIVERSITY
│       │   ├── statuses.js             # Enums: Application, Program, Enrollment, Invoice, Payment, Cohort, Attendance
│       │   ├── permissions.js          # Granular permissions: STUDENTS_VIEW, FINANCE_MANAGE, etc.
│       │   ├── evaluations.js          # Evaluation outcome enums (PASS, FAIL, INCOMPLETE)
│       │   └── notifications.js        # Notification event type constants
│       ├── models/                     # 23 Mongoose Data Schemas
│       │   ├── User.js                 # Authentication identity & permissions
│       │   ├── AdminScope.js           # Multi-division scope mappings
│       │   ├── StudentProfile.js       # Student academic & biographical data
│       │   ├── InstructorProfile.js    # Instructor specializations & divisional assignments
│       │   ├── Course.js               # Training Programs (referred to as Course in DB)
│       │   ├── Application.js          # Admissions applications & review workflow
│       │   ├── ProgramAssessment.js    # Timed quiz assessment builder for programs
│       │   ├── AssessmentAttempt.js    # Student quiz attempts & scores
│       │   ├── ReadinessResult.js      # Deterministic AI readiness scores & recommendations
│       │   ├── Enrollment.js           # Seat reservations, confirmed spots, waitlist queues
│       │   ├── Cohort.js               # Scheduled class batches, session dates & instructors
│       │   ├── Attendance.js           # Session attendance logs per learner
│       │   ├── Assignment.js           # Course deliverables & milestones
│       │   ├── Assessment.js           # Deliverable grading & feedback corrections
│       │   ├── Evaluation.js           # Final cohort evaluation (attendance % + grades %)
│       │   ├── Certificate.js          # Issued verifiable credentials & revocation history
│       │   ├── Invoice.js              # Tuition invoices with 72-hour deadlines
│       │   ├── PaymentTransaction.js   # Immutable accounting ledger (manual & Paymob)
│       │   ├── Feedback.js             # Student post-training feedback & sentiment
│       │   ├── Notification.js         # In-app notification queue
│       │   └── OfficialEmailConfiguration.js # Institutional SMTP sender configuration
│       ├── middleware/
│       │   ├── auth.js                 # JWT extraction and validation (`protect`)
│       │   ├── authorize.js            # Role-based restriction (`authorize`)
│       │   ├── divisionScope.js        # Division tenant boundary resolution (`resolveDivisionScope`)
│       │   ├── permission.js           # Fine-grained capability checks (`requirePermission`)
│       │   └── errorHandler.js         # Centralized error mapping & serialization
│       ├── controllers/                # 18 Resource Controllers handling HTTP requests
│       ├── services/                   # 16 Domain Business Logic Services
│       │   ├── readinessService.js     # Deterministic rule-based applicant evaluation
│       │   ├── cohortService.js        # Class scheduling, attendance, assignments, and grading
│       │   ├── enrollmentService.js    # Concurrency-safe atomic seat reservation & waitlist
│       │   ├── financeService.js       # Invoicing, deadline sweeps, and payment ledger
│       │   ├── onlinePaymentService.js # Paymob checkout session & HMAC callback verification
│       │   ├── paymobService.js        # Paymob API client & mock HMAC builder
│       │   ├── certificateService.js   # Credential issuance, validation, and revocation
│       │   ├── notificationService.js  # In-app notices & Nodemailer email templates
│       │   ├── reportService.js        # 59KB analytical aggregation & reporting engine
│       │   ├── statsService.js         # Real database counters for dashboard gateways
│       │   └── auditService.js         # Append-only audit logging writer
│       ├── validators/                 # Plain-function payload validation schemas
│       ├── utils/
│       │   ├── ApiError.js             # Standardized operational error class
│       │   ├── ApiResponse.js          # Standardized response envelopes
│       │   ├── pdfGenerator.js         # Certificate PDF generator (PDFKit)
│       │   ├── reportPdfGenerator.js   # Analytical report PDF generator
│       │   └── studentReportPdfGenerator.js # Comprehensive Student Dossier PDF generator
│       └── seed/
│           └── seed.js                 # Development seeding & schema repair utility
│
├── frontend/                           # Single-Page Application (React 18 + Vite)
│   ├── .env.example
│   ├── .env                            # VITE_API_BASE_URL=http://localhost:5000/api
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx                    # React root mounting, Bootstrap & FontAwesome imports
│       ├── App.jsx                     # Top-level router definition and layout hierarchies
│       ├── styles/
│       │   ├── variables.css           # Design tokens (aerospace palette, typography, shadows)
│       │   └── global.css              # Reset, scrollbar styling, utility classes
│       ├── contexts/
│       │   └── AuthContext.jsx         # React Context for session bootstrap, login, logout
│       ├── hooks/
│       │   └── useAuth.js              # Hook for AuthContext access
│       ├── routes/
│       │   ├── ProtectedRoute.jsx      # Unauthenticated barrier redirecting to /login
│       │   ├── RoleGuard.jsx           # Role restriction guard redirecting to /unauthorized
│       │   ├── DivisionGuard.jsx       # Cross-division URL tampering guard
│       │   └── HomeRedirect.jsx        # Role-aware entry router
│       ├── layouts/
│       │   ├── AuthLayout.jsx          # Centered card layout for Login / Register
│       │   ├── MainLayout.jsx          # Basic topbar shell for Student / Instructor
│       │   └── AdminLayout.jsx         # Workspace shell with dynamic collapsible Sidebar
│       ├── components/
│       │   ├── common/                 # StatCard, DataTable, StatusBadge, PageHeader, Modal,
│       │   │                           # ConfirmModal, EmptyState, LoadingState, ErrorState
│       │   ├── layout/                 # Navbar, Sidebar, NotificationBell
│       │   └── charts/                 # Custom SVG DonutChart, BarChart, TrendChart
│       ├── services/api/               # Axios API client & 8 dedicated resource services
│       └── pages/
│           ├── auth/                   # LoginPage, RegisterPage
│           ├── dashboard/              # DashboardPage (Generic landing)
│           ├── admin/                  # 14 Full Admin Pages (Applications, Cohorts, Finance,
│           │                           # Programs, Students, Certificates, Reports, etc.)
│           ├── student/                # StudentInvoicesPage, StudentCohortsPage,
│           │                           # StudentCertificatesPage, StudentAssessmentPage, PaymentReturnPage
│           ├── instructor/             # InstructorCohortsPage (Attendance, Grading, Roster)
│           └── public/                 # PublicVerifyPage (Unauthenticated certificate validator)
│
└── scratch/                            # Test scripts, database verification dumps, UI captures
```

---

## 4. Current Operational Status & Working Modules

### Confirmed Working & Verified Features

1. **Authentication & Multi-Tenant Scoping:**
   - Public registration for Student and Instructor roles with bcrypt-12 password hashing.
   - JWT authentication verified on all protected API endpoints.
   - Strict division isolation enforced via `resolveDivisionScope` and `enforceDivisionParam` middleware. Division administrators cannot access or modify records of the opposing division.
2. **Super Admin Gateway & Administrator Provisioning:**
   - Live dashboard cards displaying verified database aggregates for both Pre-University and University divisions.
   - Administrator management module allowing Super Admins to create division admins, toggle active status, and assign granular functional permissions.
3. **Training Program Management:**
   - Full CRUD lifecycle for programs (title, description, price, capacity, delivery mode, prerequisites, target majors).
   - Program archiving with dependency protections.
4. **Admissions & Review Decision Workflow:**
   - Multi-status admissions lifecycle (`SUBMITTED`, `MANUAL_REVIEW`, `NEEDS_INFORMATION`, `ELIGIBLE_PAYMENT_PENDING`, `WAITLISTED`, `CONFIRMED`, `CANCELLED`).
   - Granular review notes, decision rationale logging, and audit history tracking.
5. **AI Readiness & Assessment Engine:**
   - Deterministic rule-based evaluation assessing division alignment gates, profile completeness gates, and academic criteria.
   - Interactive Program Assessment Builder allowing creation of timed quizzes with automated score thresholds.
   - Student quiz portal providing immediate scoring and evaluation tier placement.
6. **Enrollment, Concurrency & Waitlist FIFO Queue:**
   - Atomic seat reservation guard using MongoDB conditional updates (`$expr: { $lt: ['$occupiedSeats', '$capacity'] }`).
   - Automated waitlist assignment when program reaches capacity.
   - Automatic FIFO waitlist promotion when an active reservation is cancelled or expires.
7. **Invoicing, Payment Ledger & 72-Hour Rule:**
   - Automated invoice generation with 72-hour countdown payment deadlines.
   - Deadline sweep engine that identifies expired invoices, revokes seat reservations, and promotes waitlisted applicants.
   - Immutable payment ledger supporting manual transactions (cash, bank transfer) and adjustments.
   - Paymob online payment checkout generation and HMAC SHA-512 callback verification.
8. **Cohort Delivery, Attendance & Deliverable Grading:**
   - Class cohort scheduling with session planning and instructor assignments.
   - Session-by-session student attendance recording (Present, Absent, Late, Excused) with correction auditing.
   - Deliverable assignment creation and student grade submission with audit logs.
9. **Evaluations, Credentialing & Public Verification:**
   - Automated cohort completion evaluations based on attendance (≥80%) and grades (≥60%).
   - Tamper-evident certificate issuance for passing students with unique serial numbers (`CERT-PRE/UNI-YEAR-SEQ`).
   - High-fidelity PDF certificate generation using PDFKit.
   - Certificate revocation and restoration with mandatory reason tracking.
   - Public unauthenticated credential verification portal (`/verify/:token`).
10. **Reports, Analytical Dashboards & Notifications:**
    - Analytical report suite across 7 domains with custom SVG charts.
    - PDF and CSV reporting exports.
    - Real-time in-app notification bell with unread badges and mark-all-read capabilities.
    - Official email service using Nodemailer with institutional HTML templates and admin sender configuration.
11. **Comprehensive Audit Trail:**
    - Append-only audit logger capturing actor, action, resource, division, timestamp, before/after states, and reasons across all mutating operations.
    - Searchable audit viewer with JSON diff inspection.

---

## 5. Confirmed Broken Features & Implementation Gaps

| Area | Nature of Problem | Concrete Evidence | Impact |
|---|---|---|---|
| **Student Course Catalog** | Missing UI | `StudentAssessmentPage.jsx` lines 150–155 navigates to `/programs`, which is not registered for students in `App.jsx`. | Students cannot browse available training programs to choose what to enroll in. |
| **Student Application Submission** | Missing UI | Backend has `POST /api/applications`, but no frontend form or component exists to submit an application. | Students cannot apply for courses through the web interface. |
| **Student Profile Self-Service** | Missing API & UI | No `PUT /api/students/profile` endpoint exists; `StudentProfile` can only be edited by Admins via `PUT /api/admin/students/:id`. | Students cannot enter their institutional details, major, GPA, or contact info; readiness checks fail profile completeness gates. |
| **Payment Bypass Backdoor** | Critical Security Vulnerability | `POST /api/payments/paymob/simulate` in `backend/src/routes/paymentRoutes.js` is unauthenticated and lacks environment guards. | Anyone can forge a payment simulation request and mark any enrollment as paid for free. |
| **Permission Fail-Open Flaw** | High Security Flaw | `backend/src/middleware/permission.js` lines 23–28: if `user.permissions` is an empty array `[]`, it passes all permission checks. | Administrators created with no permissions accidentally receive full authority across all endpoints. |
| **Password Recovery** | Missing Feature | No endpoints for `/forgot-password` or `/reset-password` exist in `authRoutes.js` or `authController.js`. | Users with forgotten passwords cannot recover accounts without direct MongoDB modification. |
| **Student / Instructor Landing** | Incomplete UI | `/dashboard` renders an `EmptyState` placeholder: "Your dashboard is being built". | Logged-in learners and instructors see an empty screen rather than their active coursework or quick actions. |
| **Testing Infrastructure** | Missing Tooling | `package.json` in both frontend and backend has no test scripts (`npm test` is absent). | No automated CI/CD unit or regression test suite exists in standard npm lifecycle commands. |

---

## 6. Runtime Verification Summary

- **Local Backend API:** Verified running on `http://localhost:5000`. Liveness endpoint `GET /api/health` returned `200 OK` (`{ success: true, data: { status: 'ok' } }`).
- **Local Frontend App:** Verified running on `http://localhost:5173`. Main document returned HTTP `200 OK`.
- **Production Bundle Build:** Tested non-destructively via `npm run build` in `frontend/`. Completed successfully in 2.02 seconds, transforming 200 modules into a single production bundle (701 KB JS / 379 KB CSS).
- **Backend Code Syntax:** Verified all 96 backend JavaScript files using `node -c`. 100% passed syntax compilation with 0 syntax errors.
