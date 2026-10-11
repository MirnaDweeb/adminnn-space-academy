import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../constants/roles';
import styles from './MainLayout.module.css';

// Authenticated layout for Student / Instructor dashboards with unified sidebar navigation.
export default function MainLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const isStudent = user?.role === ROLES.STUDENT;
  const isInstructor = user?.role === ROLES.INSTRUCTOR;

  const studentSections = [
    {
      title: 'Student Portal',
      collapsible: false,
      icon: 'fa-gauge-high',
      items: [
        { to: '/dashboard', icon: 'fa-gauge-high', label: 'Overview Dashboard', end: true },
      ],
    },
    {
      title: 'Programs & Admissions',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-compass',
      items: [
        { to: '/programs', icon: 'fa-satellite-dish', label: 'Program Catalog' },
        { to: '/applications', icon: 'fa-file-lines', label: 'My Applications' },
      ],
    },
    {
      title: 'Academics & Learning',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-graduation-cap',
      items: [
        { to: '/student/cohorts', icon: 'fa-book-open', label: 'My Cohorts & Classes' },
        { to: '/student/certificates', icon: 'fa-award', label: 'My Certificates' },
      ],
    },
    {
      title: 'Financial Records',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-file-invoice-dollar',
      items: [
        { to: '/student/invoices', icon: 'fa-receipt', label: 'My Invoices & Payments' },
      ],
    },
    {
      title: 'Communications',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-bell',
      items: [
        { to: '/notifications', icon: 'fa-bell', label: 'Notifications & Alerts' },
      ],
    },
  ];

  const instructorSections = [
    {
      title: 'Instructor Portal',
      collapsible: false,
      icon: 'fa-gauge-high',
      items: [
        { to: '/dashboard', icon: 'fa-gauge-high', label: 'Overview Dashboard', end: true },
      ],
    },
    {
      title: 'Teaching & Delivery',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-chalkboard-user',
      items: [
        { to: '/instructor/cohorts', icon: 'fa-people-group', label: 'My Assigned Cohorts' },
      ],
    },
    {
      title: 'Communications',
      collapsible: true,
      defaultOpen: true,
      icon: 'fa-bell',
      items: [
        { to: '/notifications', icon: 'fa-bell', label: 'Notifications & Alerts' },
      ],
    },
  ];

  const sections = isStudent ? studentSections : isInstructor ? instructorSections : [];
  const label = isStudent ? 'STUDENT PORTAL' : isInstructor ? 'INSTRUCTOR PORTAL' : 'USER PORTAL';

  return (
    <div className="esa-page">
      <Navbar
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
      />
      <div className={styles.body}>
        {sections.length > 0 && (
          <Sidebar
            sections={sections}
            label={label}
            isMobileOpen={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
          />
        )}
        <main className={styles.content}>
          <div className="esa-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
