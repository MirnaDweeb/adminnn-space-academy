# Egyptian Space Agency — Academy Training Management Platform

**Status:** Initial foundation (Phase 0). Built to be extended phase-by-phase in a follow-up development environment.

This repository contains a real, connected full-stack foundation: a React (Vite) frontend and a Node.js/Express + MongoDB backend, wired together with JWT authentication and server-enforced role/division authorization. There are no mock UIs and no fake API calls — every screen described below calls a real endpoint, and an empty database renders real empty states rather than placeholder data.

---

## 1. Architecture

```
/backend                     Node.js / Express / MongoDB API
  src/
    config/db.js             MongoDB connection
    constants/                roles.js, divisions.js, statuses.js — single source of truth for enums
    models/                   User, StudentProfile, InstructorProfile, AdminScope, Course, Application, Enrollment, AuditLog
    middleware/                auth (JWT), authorize (role), divisionScope (division), errorHandler
    controllers/               authController, adminController, studentController, programController, applicationController
    validators/                 plain-function input validation (no extra framework dependency)
    services/                   auditService (append-only audit writer), statsService (real DB counts)
    routes/                     one file per resource, mounted under /api
    seed/seed.js               DEV-ONLY seed script, isolated from the app
    app.js / server.js         Express app wiring / process entrypoint

/frontend                    React 18 + Vite + Bootstrap 5 + CSS Modules
  src/
    components/common/        StatCard, DataTable, StatusBadge, PageHeader, EmptyState, LoadingState, ErrorState, SearchBar, FilterBar
    components/layout/        Navbar, Sidebar
    layouts/                   AuthLayout, MainLayout, AdminLayout
    routes/                    ProtectedRoute, RoleGuard, DivisionGuard, HomeRedirect
    contexts/AuthContext.jsx   Auth state, backed by real /api/auth calls
    services/api/              apiClient (Axios instance) + one service module per resource
    pages/auth                 LoginPage, RegisterPage
    pages/dashboard            Generic Student/Instructor landing page
    pages/admin                AdminGatewayPage, DivisionOverviewPage, StudentsListPage, StudentDetailPage, ProgramsPage
```

Both apps are independent Node projects (`/backend`, `/frontend`) that talk to each other over HTTP — a genuine two-tier system, not a single bundled app.

---

## 2. Roles & Divisions

Five roles: `SUPER_ADMIN`, `PRE_UNIVERSITY_ADMIN`, `UNIVERSITY_ADMIN`, `INSTRUCTOR`, `STUDENT`.

Two divisions: `PRE_UNIVERSITY`, `UNIVERSITY`.

- **Super Admin** — full access to both divisions, plus the `/admin` gateway.
- **Pre-University Admin / University Admin** — locked to their own division on both the frontend and the backend. This is enforced in `middleware/divisionScope.js`, not just by hiding UI.
- **Instructor / Student** — no admin access; land on a generic dashboard.

---

## 3. Environment Variables

**backend/.env** (copy from `backend/.env.example`):
```
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/esa_academy
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
```

**frontend/.env** (copy from `frontend/.env.example`):
```
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## 4. MongoDB Setup

Any local or hosted MongoDB works.

```bash
# Local install (Ubuntu/Debian example)
sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# or Docker
docker run -d -p 27017:27017 --name esa-mongo mongo:7
```

Point `MONGO_URI` in `backend/.env` at it. No collections need to be created manually — Mongoose creates them on first write.

---

## 5. Backend — Install & Run

```bash
cd backend
cp .env.example .env      # then edit JWT_SECRET and MONGO_URI as needed
npm install
npm run dev                # nodemon, auto-restart
# or: npm start
```

Health check: `GET http://localhost:5000/api/health` → `{ "success": true, "data": { "status": "ok" } }`

### Optional: development seed data

Creates one account per role (clearly isolated in `src/seed/seed.js`, never imported by the running app):

```bash
npm run seed
```

Seeded accounts (all use password `Password123!`):
| Email | Role |
|---|---|
| superadmin@esa.dev | SUPER_ADMIN |
| preuni.admin@esa.dev | PRE_UNIVERSITY_ADMIN |
| uni.admin@esa.dev | UNIVERSITY_ADMIN |
| instructor@esa.dev | INSTRUCTOR |
| student@esa.dev | STUDENT (Pre-University) |

Without seeding, you can register a Student/Instructor via `/register`; admin accounts must currently be created directly in MongoDB (a "create admin" endpoint is a recommended next phase — see §12).

---

## 6. Frontend — Install & Run

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Visit `http://localhost:5173`.

---

## 7. Authentication

- `POST /api/auth/register` — self-registration for `STUDENT` / `INSTRUCTOR` only. Passwords hashed with bcrypt (12 salt rounds).
- `POST /api/auth/login` — returns a JWT and a safe user object (no password hash ever leaves the server).
- `GET /api/auth/me` — returns the authenticated user, used by the frontend to restore sessions on refresh.
- Frontend stores the JWT in `localStorage` and attaches it via an Axios request interceptor (`services/api/apiClient.js`). A `401` response anywhere triggers an automatic logout + redirect to `/login`.

---

## 8. Authorization (enforced server-side)

- `middleware/auth.js` — verifies the JWT and loads the real user document into `req.user`.
- `middleware/authorize.js` — restricts a route to a list of roles.
- `middleware/divisionScope.js` — resolves `req.scopeDivision`:
  - Super Admin may pass `?division=PRE_UNIVERSITY|UNIVERSITY|all`.
  - A division admin's scope is always their own division, **regardless of any query param or URL segment they send**.
  - `enforceDivisionParam` additionally guards `/admin/:division/...` routes so a division admin cannot view the other division by editing the URL.

This means the negative-authorization behavior required by the spec (403 on cross-division or cross-role access) is real, not simulated. See the Postman tests in §11.

The frontend mirrors this with `ProtectedRoute`, `RoleGuard`, and `DivisionGuard` — but these are UX conveniences only; the backend is the actual boundary.

---

## 9. Admin Gateway

`GET /api/admin/gateway` (Super Admin only) returns real, database-derived counts for both divisions — `studentCount`, `activePrograms`, `pendingApplications` — computed live from `StudentProfile`, `Course`, and `Application`. On an empty database these are legitimately `0`, never fabricated.

The frontend gateway (`/admin`) renders two cards from this endpoint and navigates to `/admin/PRE_UNIVERSITY` or `/admin/UNIVERSITY` on click.

---

## 10. API Overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/register | Public | Register student/instructor |
| POST | /api/auth/login | Public | Login, returns JWT |
| GET | /api/auth/me | Authenticated | Current user |
| GET | /api/admin/gateway | Super Admin | Both-division stats for the gateway |
| GET | /api/admin/:division/overview | Admin (own division) / Super Admin | Single division stats |
| GET | /api/admin/students | Admin | List students (division-scoped) |
| GET | /api/admin/students/:id | Admin | Student detail (division-scoped) |
| GET | /api/admin/applications | Admin | List applications (division-scoped) |
| GET | /api/programs | Authenticated | List programs (division-scoped) |
| GET | /api/programs/:id | Authenticated | Program detail |
| POST | /api/programs | Admin | Create program (own division only) |
| PUT | /api/programs/:id | Admin | Update program (own division only) |
| POST | /api/applications | Student | Submit an application |
| GET | /api/applications/mine | Student | Own applications |
| GET | /api/health | Public | Liveness check |

Every response uses one of two shapes:
```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 } }
{ "success": false, "error": { "message": "...", "details": null } }
```

---

## 11. Postman Testing

Set a collection variable `baseUrl = http://localhost:5000/api` and `token` (filled in after login).

### Register (Student)
```
POST {{baseUrl}}/auth/register
Body (JSON):
{ "fullName": "Nour Ali", "email": "nour@example.com", "password": "Password123!", "role": "STUDENT", "division": "PRE_UNIVERSITY" }
Expected: 201, { success: true, data: { user, token } }
```

### Register — duplicate email (negative)
```
POST {{baseUrl}}/auth/register  (same email again)
Expected: 409 Conflict
```

### Login
```
POST {{baseUrl}}/auth/login
Body: { "email": "nour@example.com", "password": "Password123!" }
Expected: 200, { data: { user, token } }
```

### Login — wrong password (negative)
```
POST {{baseUrl}}/auth/login
Body: { "email": "nour@example.com", "password": "wrong" }
Expected: 401
```

### Get current user
```
GET {{baseUrl}}/auth/me
Headers: Authorization: Bearer {{token}}
Expected: 200, { data: { user } }
```

### Get current user — no token (negative)
```
GET {{baseUrl}}/auth/me
Expected: 401
```

### Student → Admin endpoint (negative — role check)
```
GET {{baseUrl}}/admin/students
Headers: Authorization: Bearer {{studentToken}}
Expected: 403 Forbidden
```

### Super Admin → Gateway
```
GET {{baseUrl}}/admin/gateway
Headers: Authorization: Bearer {{superAdminToken}}
Expected: 200, data.divisions has 2 entries with real counts
```

### Create Program (Pre-University Admin, own division)
```
POST {{baseUrl}}/programs
Headers: Authorization: Bearer {{preUniAdminToken}}
Body: { "title": "Intro to Rocketry", "division": "PRE_UNIVERSITY", "level": "BEGINNER", "capacity": 30, "price": 500, "deliveryMode": "ONSITE", "status": "ACTIVE" }
Expected: 201
```

### Create Program — wrong division (negative — division scope)
```
POST {{baseUrl}}/programs
Headers: Authorization: Bearer {{preUniAdminToken}}
Body: { "title": "Orbital Mechanics", "division": "UNIVERSITY", ... }
Expected: 403 Forbidden
```

### List Programs (division-scoped)
```
GET {{baseUrl}}/programs
Headers: Authorization: Bearer {{preUniAdminToken}}
Expected: 200, only PRE_UNIVERSITY programs returned even without a query param
```

### Get Students — Pre-University Admin
```
GET {{baseUrl}}/admin/students
Headers: Authorization: Bearer {{preUniAdminToken}}
Expected: 200, only Pre-University students
```

### Pre-University Admin → University division overview (negative — cross-division)
```
GET {{baseUrl}}/admin/UNIVERSITY/overview
Headers: Authorization: Bearer {{preUniAdminToken}}
Expected: 403 Forbidden
```

### University Admin → Pre-University data (negative — cross-division, reverse)
```
GET {{baseUrl}}/admin/PRE_UNIVERSITY/overview
Headers: Authorization: Bearer {{uniAdminToken}}
Expected: 403 Forbidden
```

### Super Admin → both divisions
```
GET {{baseUrl}}/admin/PRE_UNIVERSITY/overview   → 200
GET {{baseUrl}}/admin/UNIVERSITY/overview       → 200
Headers: Authorization: Bearer {{superAdminToken}}
```

### Get single student
```
GET {{baseUrl}}/admin/students/:id
Headers: Authorization: Bearer {{preUniAdminToken}}
Expected: 200 if the student is in the admin's division, 403 if not, 404 if the id doesn't exist
```

---

## 12. Browser Testing

1. Start MongoDB (`mongod` or Docker container).
2. `cd backend && npm run dev` (and optionally `npm run seed`).
3. `cd frontend && npm run dev`.
4. Visit `http://localhost:5173/register`, create a Student account — or `/login` with a seeded account.
5. Log in as `superadmin@esa.dev`. You should land on `/admin`.
6. Verify two cards: **Pre-University Administration** and **University Administration**, each with student count / active programs / pending applications (all `0` on a fresh database).
7. Click **Enter Administration** on Pre-University → you land on `/admin/PRE_UNIVERSITY`, sidebar shows Overview / Students / Programs.
8. In the browser address bar, manually navigate to `/admin/UNIVERSITY` while still logged in as the *Pre-University Admin* (log out of Super Admin, log in as `preuni.admin@esa.dev`) → you should be redirected to `/unauthorized`, and the underlying API call would return 403.
9. Log in as `uni.admin@esa.dev` → confirm only University data is reachable, and `/admin/PRE_UNIVERSITY` redirects to `/unauthorized`.
10. Log back in as Super Admin → confirm both `/admin/PRE_UNIVERSITY` and `/admin/UNIVERSITY` are reachable.
11. As any admin, open **Students** — with an empty database this shows "No students found", not fake rows.
12. Log in as `student@esa.dev` → you land on `/dashboard`, and manually navigating to `/admin` redirects to `/unauthorized`.

---

## 13. Known Limitations (intentional — foundation phase)

- No admissions/eligibility engine, payments, certificates, notifications, attendance, or reporting yet — statuses and models exist so these can be added without reshaping the schema.
- There is no UI yet for a Super Admin to provision new admin accounts; use the seed script or insert directly into MongoDB for now.
- `Enrollment` model exists but nothing writes to it yet (created once an application reaches `CONFIRMED` in a future phase).
- No automated test suite (unit/integration) is included yet.
- No pagination caching / optimistic UI; every list re-fetches on filter change.

## 14. Recommended Next Phase

1. Super-Admin "Create Admin Account" flow (assigns `AdminScope` + `User.division`).
2. Eligibility/admissions engine building on the existing `Application` status enum.
3. Payment window (72-hour rule) + Invoice/Payment models.
4. Attendance and Enrollment lifecycle wiring.
5. Notification service (email/SMS) hooked into `AuditLog`-worthy events.
6. Expand `AuditLog` usage to every mutating admin action (currently wired for program create/update and user register; extend to student edits, decisions, etc.).
