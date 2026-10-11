import { useState, useEffect } from 'react';
import { Outlet, useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../constants/roles';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../constants/divisions';
import styles from './AdminLayout.module.css';

// Shared shell for administrative screens.
// Strictly isolates division workspaces from the top-level Administration Gateway.
export default function AdminLayout() {
  const { user } = useAuth();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const userDivision = ROLE_TO_DIVISION[user?.role] || 'PRE_UNIVERSITY';

  // Check if current route is the top-level Gateway or Platform Administrator management
  const isGatewayPage = location.pathname === '/admin';
  const isAdminManagementPage = location.pathname === '/admin/administrators';

  // Mobile navigation drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Selected division workspace for Super Admin
  const [selectedDivision, setSelectedDivision] = useState(() => {
    if (params.division && (params.division === 'PRE_UNIVERSITY' || params.division === 'UNIVERSITY')) {
      return params.division;
    }
    const saved = localStorage.getItem('esa_active_division');
    if (saved === 'UNIVERSITY' || saved === 'PRE_UNIVERSITY') {
      return saved;
    }
    return 'PRE_UNIVERSITY';
  });

  // Sync selectedDivision whenever URL division parameter changes
  useEffect(() => {
    if (params.division && (params.division === 'PRE_UNIVERSITY' || params.division === 'UNIVERSITY')) {
      setSelectedDivision(params.division);
      localStorage.setItem('esa_active_division', params.division);
    }
  }, [params.division]);

  // Return Super Admin to Administration Gateway
  const handleBackToGateway = () => {
    localStorage.removeItem('esa_active_division');
    navigate('/admin');
  };

  // Handle smooth division switching
  const handleSwitchDivision = (newDivision) => {
    setSelectedDivision(newDivision);
    localStorage.setItem('esa_active_division', newDivision);

    const currentPath = location.pathname;
    const match = currentPath.match(/^\/admin\/(PRE_UNIVERSITY|UNIVERSITY)(\/.*)?$/);
    if (match) {
      const subPath = match[2] || '';
      navigate(`/admin/${newDivision}${subPath}`);
    } else {
      navigate(`/admin/${newDivision}`);
    }
  };

  // Active workspace division to display in sidebar and scope queries
  const activeDivision = params.division || (isSuperAdmin ? selectedDivision : userDivision);

  // Clean, strictly-scoped operational navigation for active division workspace (Super Admin)
  const superAdminSections = [
    {
      title: 'Dashboard',
      collapsible: false,
      defaultOpen: true,
      icon: 'fa-gauge-high',
      items: [
        { to: `/admin/${activeDivision}`, icon: 'fa-chart-line', label: 'Division Dashboard', end: true },
      ],
    },
    {
      title: 'Academic Programs',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-graduation-cap',
      items: [
        { to: `/admin/${activeDivision}/programs`, icon: 'fa-book-open', label: 'Programs & Courses' },
        { to: `/admin/${activeDivision}/cohorts`, icon: 'fa-people-group', label: 'Cohorts & Delivery' },
        { to: `/admin/${activeDivision}/sessions`, icon: 'fa-tower-broadcast', label: 'Live Session Monitoring' },
        { to: `/admin/${activeDivision}/assessments`, icon: 'fa-clipboard-check', label: 'Assessments & Exams' },
      ],
    },
    {
      title: 'Admissions & Applications',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-id-card',
      items: [
        { to: `/admin/${activeDivision}/applications`, icon: 'fa-file-lines', label: 'Student Applications' },
      ],
    },
    {
      title: 'User Management',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-users',
      items: [
        { to: `/admin/${activeDivision}/students`, icon: 'fa-user-graduate', label: 'Students Directory' },
        { to: `/admin/${activeDivision}/instructors`, icon: 'fa-chalkboard-user', label: 'Faculty Instructors' },
      ],
    },
    {
      title: 'Finance & Quality',
      collapsible: true,
      defaultOpen: false,
      icon: 'fa-file-invoice-dollar',
      items: [
        { to: `/admin/${activeDivision}/invoices`, icon: 'fa-receipt', label: 'Invoices & Payments' },
        { to: `/admin/${activeDivision}/certificates`, icon: 'fa-certificate', label: 'Issued Certificates' },
        { to: `/admin/${activeDivision}/feedback`, icon: 'fa-comment-dots', label: 'Student Feedback' },
      ],
    },
    {
      title: 'System & Analytics',
      collapsible: true,
      defaultOpen: false,
      icon: 'fa-sliders',
      items: [
        { to: `/admin/${activeDivision}/notifications`, icon: 'fa-bell', label: 'Broadcast Notifications' },
        { to: `/admin/${activeDivision}/reports`, icon: 'fa-chart-pie', label: 'Reports & Analytics' },
        { to: `/admin/${activeDivision}/audit-logs`, icon: 'fa-shield-halved', label: 'Security Audit Logs' },
      ],
    },
  ];

  // Scoped operational sections for Division Administrators
  const divisionAdminSections = [
    {
      title: 'Dashboard',
      collapsible: false,
      defaultOpen: true,
      icon: 'fa-gauge-high',
      items: [
        { to: `/admin/${activeDivision}`, icon: 'fa-chart-line', label: 'Division Dashboard', end: true },
      ],
    },
    {
      title: 'Academic Programs',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-graduation-cap',
      items: [
        { to: `/admin/${activeDivision}/programs`, icon: 'fa-book-open', label: 'Programs & Courses' },
        { to: `/admin/${activeDivision}/cohorts`, icon: 'fa-people-group', label: 'Cohorts & Delivery' },
        { to: `/admin/${activeDivision}/sessions`, icon: 'fa-tower-broadcast', label: 'Live Session Monitoring' },
        { to: `/admin/${activeDivision}/assessments`, icon: 'fa-clipboard-check', label: 'Assessments & Exams' },
      ],
    },
    {
      title: 'Admissions & Applications',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-id-card',
      items: [
        { to: `/admin/${activeDivision}/applications`, icon: 'fa-file-lines', label: 'Student Applications' },
      ],
    },
    {
      title: 'User Management',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-users',
      items: [
        { to: `/admin/${activeDivision}/students`, icon: 'fa-user-graduate', label: 'Students Directory' },
        { to: `/admin/${activeDivision}/instructors`, icon: 'fa-chalkboard-user', label: 'Faculty Instructors' },
      ],
    },
    {
      title: 'Finance & Quality',
      collapsible: true,
      defaultOpen: false,
      icon: 'fa-file-invoice-dollar',
      items: [
        { to: `/admin/${activeDivision}/invoices`, icon: 'fa-receipt', label: 'Invoices & Payments' },
        { to: `/admin/${activeDivision}/certificates`, icon: 'fa-certificate', label: 'Issued Certificates' },
        { to: `/admin/${activeDivision}/feedback`, icon: 'fa-comment-dots', label: 'Student Feedback' },
      ],
    },
    {
      title: 'System & Analytics',
      collapsible: true,
      defaultOpen: false,
      icon: 'fa-sliders',
      items: [
        { to: `/admin/${activeDivision}/notifications`, icon: 'fa-bell', label: 'Broadcast Notifications' },
        { to: `/admin/${activeDivision}/reports`, icon: 'fa-chart-pie', label: 'Reports & Analytics' },
        { to: `/admin/${activeDivision}/audit-logs`, icon: 'fa-shield-halved', label: 'Security Audit Logs' },
      ],
    },
  ];

  // 1. GATEWAY & ADMIN MANAGEMENT: Minimal, clean full-width layout without operational division sidebar
  if (isGatewayPage || isAdminManagementPage) {
    return (
      <div className="esa-page">
        <Navbar
          onToggleMobileMenu={null}
          isMobileMenuOpen={false}
          workspaceSwitcher={{
            isGateway: true,
            isSuperAdmin,
          }}
        />
        <div className={styles.body}>
          <main className={styles.gatewayMain}>
            <div className={styles.gatewayContainer}>
              <Outlet context={{ isSuperAdmin }} />
            </div>
          </main>
        </div>
      </div>
    );
  }

  // 2. DIVISION WORKSPACE: Isolated workspace layout with scoped sidebar and exit action
  return (
    <div className="esa-page">
      <Navbar
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
        workspaceSwitcher={{
          activeDivision,
          onSelectDivision: handleSwitchDivision,
          onExitToGateway: handleBackToGateway,
          isSuperAdmin,
          isGateway: false,
        }}
      />
      <div className={styles.body}>
        <Sidebar
          sections={isSuperAdmin ? superAdminSections : divisionAdminSections}
          label={`${DIVISION_LABELS[activeDivision] || activeDivision} WORKSPACE`}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          topAction={
            isSuperAdmin ? (
              <div className={styles.sidebarExitWrap}>
                <button
                  type="button"
                  className={styles.sidebarExitBtn}
                  onClick={handleBackToGateway}
                  title="Return to Administration Gateway"
                  aria-label="Back to Administration Gateway"
                >
                  <i className="fa-solid fa-arrow-left me-1.5" aria-hidden="true"></i>
                  <span>Back to Gateway</span>
                </button>
              </div>
            ) : null
          }
        />
        <main className={styles.content}>
          <div className="esa-container">
            {/* Super Admin Workspace Context Bar with prominent return action */}
            {isSuperAdmin && (
              <div className={styles.workspaceContextBar}>
                <div className={styles.workspaceBreadcrumb}>
                  <button
                    type="button"
                    className={`btn btn-link p-0 ${styles.breadcrumbGatewayLink}`}
                    onClick={handleBackToGateway}
                    title="Return to Administration Gateway"
                  >
                    <i className="fa-solid fa-server me-1" aria-hidden="true"></i>
                    <span>Administration Gateway</span>
                  </button>
                  <span className={styles.breadcrumbSeparator}>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </span>
                  <span className={styles.activeWorkspaceTag}>
                    <i
                      className={`fa-solid ${
                        activeDivision === 'PRE_UNIVERSITY'
                          ? `fa-school ${styles.preUniIcon}`
                          : `fa-graduation-cap ${styles.uniIcon}`
                      } me-1.5`}
                      aria-hidden="true"
                    ></i>
                    <span>{DIVISION_LABELS[activeDivision] || activeDivision} Workspace</span>
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.backToGatewayActionBtn}
                  onClick={handleBackToGateway}
                  title="Exit division workspace and return to Administration Gateway"
                  aria-label="Back to Administration Gateway"
                >
                  <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
                  <span>Back to Administration Gateway</span>
                </button>
              </div>
            )}

            <Outlet context={{ division: activeDivision, isSuperAdmin }} />
          </div>
        </main>
      </div>
    </div>
  );
}
