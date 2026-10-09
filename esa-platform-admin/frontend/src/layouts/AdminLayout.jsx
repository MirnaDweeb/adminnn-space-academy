import { useState, useEffect } from 'react';
import { Outlet, useParams, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../constants/roles';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../constants/divisions';
import styles from './AdminLayout.module.css';

// Shared shell for administrative screens.
// Enforces active division as primary workspace context for Super Admin.
export default function AdminLayout() {
  const { user } = useAuth();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const userDivision = ROLE_TO_DIVISION[user?.role] || 'PRE_UNIVERSITY';

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

  // Handle smooth division switching
  const handleSwitchDivision = (newDivision) => {
    setSelectedDivision(newDivision);
    localStorage.setItem('esa_active_division', newDivision);

    const currentPath = location.pathname;
    const match = currentPath.match(/^\/admin\/(PRE_UNIVERSITY|UNIVERSITY)(\/.*)?$/);
    if (match) {
      // If currently inside a division sub-module (/admin/:division/xyz), navigate to equivalent module in new division
      const subPath = match[2] || '';
      navigate(`/admin/${newDivision}${subPath}`);
    } else {
      // If currently on a global route (/admin, /admin/administrators, etc.), navigate to new division overview
      navigate(`/admin/${newDivision}`);
    }
  };

  // Active workspace division to display in sidebar
  const activeDivision = isSuperAdmin ? selectedDivision : userDivision;

  // Super Admin Navigation Hierarchy
  const superAdminSections = [
    {
      title: 'Global',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-globe',
      items: [
        { to: '/admin', icon: 'fa-gauge', label: 'Dashboard / Gateway', end: true },
        { to: '/admin/reports', icon: 'fa-chart-pie', label: 'Reports & Analytics' },
      ],
    },
    {
      title: 'Administration',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-user-shield',
      items: [
        { to: '/admin/administrators', icon: 'fa-users-gear', label: 'Administrators' },
      ],
    },
    {
      title: 'Academy Division',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-layer-group',
      divisionSwitcher: {
        activeDivision,
        onSelectDivision: handleSwitchDivision,
        isSuperAdmin: true,
      },
      items: [
        { to: `/admin/${activeDivision}`, icon: 'fa-chart-line', label: 'Overview', end: true },
        { to: `/admin/${activeDivision}/students`, icon: 'fa-user-graduate', label: 'Students' },
        { to: `/admin/${activeDivision}/instructors`, icon: 'fa-chalkboard-user', label: 'Instructors' },
        { to: `/admin/${activeDivision}/programs`, icon: 'fa-book-open', label: 'Programs' },
        { to: `/admin/${activeDivision}/cohorts`, icon: 'fa-people-group', label: 'Cohorts & Delivery' },
        { to: `/admin/${activeDivision}/assessments`, icon: 'fa-clipboard-check', label: 'Assessments' },
        { to: `/admin/${activeDivision}/applications`, icon: 'fa-file-lines', label: 'Applications' },
        { to: `/admin/${activeDivision}/cohorts`, icon: 'fa-user-check', label: 'Enrollments' },
        { to: `/admin/${activeDivision}/invoices`, icon: 'fa-file-invoice-dollar', label: 'Invoices & Finance' },
        { to: `/admin/${activeDivision}/certificates`, icon: 'fa-certificate', label: 'Certificates' },
        { to: `/admin/${activeDivision}/feedback`, icon: 'fa-comments', label: 'Student Feedback' },
        { to: `/admin/${activeDivision}/notifications`, icon: 'fa-bell', label: 'Notifications' },
      ],
    },
    {
      title: 'System',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-gears',
      items: [
        { to: '/admin/audit-logs', icon: 'fa-shield-halved', label: 'Audit Logs' },
      ],
    },
  ];

  // Scoped sections for Division Administrators (locked to their division)
  const divisionAdminSections = [
    {
      title: 'Academy Division',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-layer-group',
      divisionSwitcher: {
        activeDivision: userDivision,
        isSuperAdmin: false,
      },
      items: [
        { to: `/admin/${userDivision}`, icon: 'fa-chart-line', label: 'Overview', end: true },
        { to: `/admin/${userDivision}/students`, icon: 'fa-user-graduate', label: 'Students' },
        { to: `/admin/${userDivision}/instructors`, icon: 'fa-chalkboard-user', label: 'Instructors' },
        { to: `/admin/${userDivision}/programs`, icon: 'fa-book-open', label: 'Programs' },
        { to: `/admin/${userDivision}/cohorts`, icon: 'fa-people-group', label: 'Cohorts & Delivery' },
        { to: `/admin/${userDivision}/assessments`, icon: 'fa-clipboard-check', label: 'Assessments' },
        { to: `/admin/${userDivision}/applications`, icon: 'fa-file-lines', label: 'Applications' },
        { to: `/admin/${userDivision}/cohorts`, icon: 'fa-user-check', label: 'Enrollments' },
        { to: `/admin/${userDivision}/invoices`, icon: 'fa-file-invoice-dollar', label: 'Invoices & Finance' },
        { to: `/admin/${userDivision}/certificates`, icon: 'fa-certificate', label: 'Certificates' },
        { to: `/admin/${userDivision}/feedback`, icon: 'fa-comments', label: 'Student Feedback' },
        { to: `/admin/${userDivision}/notifications`, icon: 'fa-bell', label: 'Notifications' },
      ],
    },
    {
      title: 'System',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-gears',
      items: [
        { to: `/admin/${userDivision}/audit-logs`, icon: 'fa-shield-halved', label: 'Audit Logs' },
        { to: `/admin/${userDivision}/reports`, icon: 'fa-chart-pie', label: 'Reports & Analytics' },
      ],
    },
  ];

  return (
    <div className="esa-page">
      <Navbar />
      <div className={styles.body}>
        <Sidebar
          sections={isSuperAdmin ? superAdminSections : divisionAdminSections}
          label={isSuperAdmin ? 'SUPER ADMIN' : `${DIVISION_LABELS[userDivision]} ADMIN`}
        />
        <div className={styles.content}>
          <div className="esa-container">
            <Outlet context={{ division: activeDivision, isSuperAdmin }} />
          </div>
        </div>
      </div>
    </div>
  );
}
