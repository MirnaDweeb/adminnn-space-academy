import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';

import ProtectedRoute from './routes/ProtectedRoute';
import RoleGuard from './routes/RoleGuard';
import DivisionGuard from './routes/DivisionGuard';
import HomeRedirect from './routes/HomeRedirect';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import AdminGatewayPage from './pages/admin/AdminGatewayPage';
import AdminManagementPage from './pages/admin/AdminManagementPage';
import DivisionOverviewPage from './pages/admin/DivisionOverviewPage';
import StudentsListPage from './pages/admin/StudentsListPage';
import StudentDetailPage from './pages/admin/StudentDetailPage';
import ProgramsPage from './pages/admin/ProgramsPage';
import InstructorManagementPage from './pages/admin/InstructorManagementPage';
import ApplicationsPage from './pages/admin/ApplicationsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import FinancePage from './pages/admin/FinancePage';
import CohortsPage from './pages/admin/CohortsPage';
import InstructorCohortsPage from './pages/instructor/InstructorCohortsPage';
import StudentInvoicesPage from './pages/student/StudentInvoicesPage';
import PaymentReturnPage from './pages/student/PaymentReturnPage';
import StudentCohortsPage from './pages/student/StudentCohortsPage';
import StudentCertificatesPage from './pages/student/StudentCertificatesPage';
import CertificatesPage from './pages/admin/CertificatesPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage';
import ReportsPage from './pages/admin/ReportsPage';
import AssessmentsPage from './pages/admin/AssessmentsPage';
import StudentAssessmentPage from './pages/student/StudentAssessmentPage';
import FeedbackPage from './pages/admin/FeedbackPage';
import SessionMonitoringPage from './pages/admin/SessionMonitoringPage';
import ProgramCatalogPage from './pages/student/ProgramCatalogPage';
import StudentApplicationsPage from './pages/student/StudentApplicationsPage';

import PublicVerifyPage from './pages/public/PublicVerifyPage';
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

import { ROLES } from './constants/roles';


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public verification routes (unauthenticated) */}
          <Route path="/verify/:token" element={<PublicVerifyPage />} />
          <Route path="/verify-certificate" element={<PublicVerifyPage />} />
          <Route path="/verify" element={<PublicVerifyPage />} />

          {/* Public auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Authenticated routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Student / Instructor dashboard & User Notifications */}
            <Route element={<MainLayout />}>
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route element={<RoleGuard allowedRoles={[ROLES.STUDENT, ROLES.INSTRUCTOR]} />}>
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route element={<RoleGuard allowedRoles={[ROLES.INSTRUCTOR]} />}>
                <Route path="/instructor/cohorts" element={<InstructorCohortsPage />} />
              </Route>
              <Route element={<RoleGuard allowedRoles={[ROLES.STUDENT]} />}>
                <Route path="/programs" element={<ProgramCatalogPage />} />
                <Route path="/applications" element={<StudentApplicationsPage />} />
                <Route path="/student/cohorts" element={<StudentCohortsPage />} />
                <Route path="/student/certificates" element={<StudentCertificatesPage />} />
                <Route path="/student/invoices" element={<StudentInvoicesPage />} />
                <Route path="/student/payments/return" element={<PaymentReturnPage />} />
                <Route path="/student/assessments/:id" element={<StudentAssessmentPage />} />
              </Route>
            </Route>

            {/* Admin area */}
            <Route
              element={
                <RoleGuard allowedRoles={[ROLES.SUPER_ADMIN, ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN]} />
              }
            >
              <Route element={<AdminLayout />}>
                {/* Super Admin gateway & governance */}
                <Route element={<RoleGuard allowedRoles={[ROLES.SUPER_ADMIN]} />}>
                  <Route path="/admin" element={<AdminGatewayPage />} />
                  <Route path="/admin/administrators" element={<AdminManagementPage />} />
                  {/* Redirect legacy un-scoped admin operational URLs to Gateway */}
                  <Route path="/admin/instructors" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/programs" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/cohorts" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/sessions" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/assessments" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/applications" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/invoices" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/certificates" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/feedback" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/notifications" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/audit-logs" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin/reports" element={<Navigate to="/admin" replace />} />
                </Route>

                {/* Division-scoped administration */}
                <Route path="/admin/:division" element={<DivisionGuard />}>
                  <Route index element={<DivisionOverviewPage />} />
                  <Route path="students" element={<StudentsListPage />} />
                  <Route path="students/:id" element={<StudentDetailPage />} />
                  <Route path="instructors" element={<InstructorManagementPage />} />
                  <Route path="programs" element={<ProgramsPage />} />
                  <Route path="cohorts" element={<CohortsPage />} />
                  <Route path="sessions" element={<SessionMonitoringPage />} />
                  <Route path="assessments" element={<AssessmentsPage />} />
                  <Route path="applications" element={<ApplicationsPage />} />
                  <Route path="invoices" element={<FinancePage />} />
                  <Route path="certificates" element={<CertificatesPage />} />
                  <Route path="feedback" element={<FeedbackPage />} />
                  <Route path="notifications" element={<AdminNotificationsPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                </Route>
              </Route>
            </Route>

          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
