import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from './NotificationBell';
import styles from './Navbar.module.css';

const DIVISION_OPTIONS = [
  {
    key: 'PRE_UNIVERSITY',
    name: 'Pre-University Administration',
    shortName: 'Pre-University',
    icon: 'fa-school',
    desc: 'K-12 students & youth space tracks',
  },
  {
    key: 'UNIVERSITY',
    name: 'University Administration',
    shortName: 'University',
    icon: 'fa-graduation-cap',
    desc: 'Undergraduate & space engineering tracks',
  },
];

export default function Navbar({
  onToggleMobileMenu,
  isMobileMenuOpen,
  workspaceSwitcher,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Relocated Workspace Switcher dropdown state
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const workspaceRef = useRef(null);

  // Compact Profile Menu state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const profileBtnRef = useRef(null);

  // Close workspace dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (workspaceRef.current && !workspaceRef.current.contains(event.target)) {
        setIsWorkspaceOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    if (isWorkspaceOpen || isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isWorkspaceOpen, isProfileOpen]);

  // Handle escape key to close workspace and profile dropdowns
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isWorkspaceOpen) {
          setIsWorkspaceOpen(false);
        }
        if (isProfileOpen) {
          setIsProfileOpen(false);
          if (profileBtnRef.current) {
            profileBtnRef.current.focus();
          }
        }
      }
    };
    if (isWorkspaceOpen || isProfileOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWorkspaceOpen, isProfileOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentDivisionMeta = workspaceSwitcher
    ? DIVISION_OPTIONS.find((d) => d.key === workspaceSwitcher.activeDivision) || {
        key: workspaceSwitcher.activeDivision,
        name: `${workspaceSwitcher.activeDivision} Administration`,
        shortName: workspaceSwitcher.activeDivision,
        icon: 'fa-building-columns',
        desc: '',
      }
    : null;

  return (
    <header className={styles.navHeader}>
      <nav className={styles.nav} aria-label="Main Navigation">
        <div className={styles.left}>
          {/* Mobile hamburger menu toggle button */}
          {user && onToggleMobileMenu && (
            <button
              type="button"
              className={styles.mobileToggle}
              onClick={onToggleMobileMenu}
              title={isMobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
              aria-label={isMobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
              aria-expanded={isMobileMenuOpen}
            >
              <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true"></i>
            </button>
          )}

          <Link to="/" className={styles.brand} aria-label="Egyptian Space Agency Academy Home">
            <img
              src="/esa-logo.png"
              alt="Egyptian Space Agency Academy Logo"
              className={styles.brandLogoImg}
            />
            <span className={styles.brandText}>
              Egyptian Space Agency
              <small>Academy Training Management Platform</small>
            </span>
          </Link>
        </div>

        {user && (
          <div className={styles.right}>
            {user.role === 'STUDENT' && (
              <div className={styles.navShortcuts}>
                <Link to="/student/cohorts" className="btn btn-sm btn-outline-info text-white border-white-50">
                  <i className="fa-solid fa-graduation-cap me-1" aria-hidden="true"></i>
                  <span className="d-none d-sm-inline">My Classes</span>
                </Link>
                <Link to="/student/invoices" className="btn btn-sm btn-outline-info text-white border-white-50">
                  <i className="fa-solid fa-file-invoice me-1" aria-hidden="true"></i>
                  <span className="d-none d-sm-inline">My Invoices</span>
                </Link>
                <Link to="/student/certificates" className="btn btn-sm btn-outline-info text-white border-white-50">
                  <i className="fa-solid fa-award me-1" aria-hidden="true"></i>
                  <span className="d-none d-sm-inline">My Certificates</span>
                </Link>
              </div>
            )}

            {user.role === 'INSTRUCTOR' && (
              <div className={styles.navShortcuts}>
                <Link to="/instructor/cohorts" className="btn btn-sm btn-outline-info text-white border-white-50">
                  <i className="fa-solid fa-chalkboard-user me-1" aria-hidden="true"></i>
                  <span className="d-none d-sm-inline">My Cohorts</span>
                </Link>
              </div>
            )}

            {/* Division Workspace Indicator (Admin only) */}
            {workspaceSwitcher && (
              <div className={styles.workspaceIndicatorWrap} ref={workspaceRef}>
                {workspaceSwitcher.isGateway ? (
                  <>
                    <span className={styles.workspaceLabel}>Platform Mode</span>
                    <div className={styles.workspaceStaticGateway} title="Administration Gateway: Select division workspace">
                      <i className="fa-solid fa-server" aria-hidden="true"></i>
                      <span className={styles.workspaceName}>Administration Gateway</span>
                    </div>
                  </>
                ) : currentDivisionMeta ? (
                  <>
                    <span className={styles.workspaceLabel}>Active Workspace</span>
                    {workspaceSwitcher.isSuperAdmin ? (
                      <button
                        type="button"
                        id="topbar-division-switcher-btn"
                        className={`${styles.workspaceBtn} ${isWorkspaceOpen ? styles.workspaceBtnActive : ''}`}
                        onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
                        aria-expanded={isWorkspaceOpen}
                        aria-haspopup="true"
                        aria-label={`Current Workspace: ${currentDivisionMeta.name}. Click to switch division.`}
                        title="Switch Academy Division Workspace"
                      >
                        <i className={`fa-solid ${currentDivisionMeta.icon} ${styles.workspaceIcon}`} aria-hidden="true"></i>
                        <span className={styles.workspaceName}>{currentDivisionMeta.name}</span>
                        <i
                          className={`fa-solid fa-chevron-down ${styles.workspaceChevron} ${
                            isWorkspaceOpen ? styles.workspaceChevronOpen : ''
                          }`}
                          aria-hidden="true"
                        ></i>
                      </button>
                    ) : (
                      <div
                        className={styles.workspaceStatic}
                        title={`Assigned Workspace: ${currentDivisionMeta.name}`}
                        aria-label={`Current Workspace: ${currentDivisionMeta.name}`}
                      >
                        <i className={`fa-solid ${currentDivisionMeta.icon} ${styles.workspaceIcon}`} aria-hidden="true"></i>
                        <span className={styles.workspaceName}>{currentDivisionMeta.name}</span>
                      </div>
                    )}

                    {/* Dropdown for Super Admin */}
                    {workspaceSwitcher.isSuperAdmin && isWorkspaceOpen && (
                      <div
                        className={styles.workspaceDropdown}
                        role="menu"
                        aria-label="Select Academy Division"
                      >
                        <div className={styles.dropdownHeader}>Switch Division Workspace</div>
                        {DIVISION_OPTIONS.map((div) => {
                          const isActive = workspaceSwitcher.activeDivision === div.key;
                          return (
                            <button
                              key={div.key}
                              type="button"
                              role="menuitem"
                              id={`btn-topbar-select-${div.key.toLowerCase().replace(/_/g, '-')}`}
                              className={`${styles.dropdownOption} ${isActive ? styles.dropdownOptionActive : ''}`}
                              onClick={() => {
                                workspaceSwitcher.onSelectDivision(div.key);
                                setIsWorkspaceOpen(false);
                              }}
                            >
                              <div className={styles.optionHeader}>
                                <i className={`fa-solid ${div.icon} ${styles.optionIcon} me-2`} aria-hidden="true"></i>
                                <span className={styles.optionTitle}>{div.name}</span>
                                {isActive && (
                                  <i className="fa-solid fa-check ms-auto text-primary" aria-hidden="true"></i>
                                )}
                              </div>
                              <div className={styles.optionDesc}>{div.desc}</div>
                            </button>
                          );
                        })}

                        <div className={styles.dropdownDivider} aria-hidden="true"></div>

                        <button
                          type="button"
                          role="menuitem"
                          className={styles.dropdownOptionGateway}
                          onClick={() => {
                            setIsWorkspaceOpen(false);
                            if (workspaceSwitcher.onExitToGateway) {
                              workspaceSwitcher.onExitToGateway();
                            } else {
                              navigate('/admin');
                            }
                          }}
                        >
                          <div className={styles.optionHeader}>
                            <i className="fa-solid fa-server me-2" aria-hidden="true"></i>
                            <span className={styles.optionTitle}>Administration Gateway</span>
                          </div>
                          <div className={styles.optionDesc}>Exit workspace to division selection</div>
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <div className={styles.bellWrap}>
              <NotificationBell />
            </div>

            {/* Compact Profile Account Menu */}
            <div className={styles.profileMenuWrap} ref={profileMenuRef}>
              <button
                ref={profileBtnRef}
                type="button"
                className={`${styles.profileBtn} ${isProfileOpen ? styles.profileBtnActive : ''}`}
                onClick={() => setIsProfileOpen((prev) => !prev)}
                aria-label="User account menu"
                aria-expanded={isProfileOpen}
                aria-haspopup="true"
                id="btn-user-profile-menu"
                title={`Account: ${user.fullName} (${user.role.replace(/_/g, ' ')})`}
              >
                <div className={styles.profileAvatarIcon}>
                  <i className="fa-solid fa-user" aria-hidden="true" />
                </div>
                <i
                  className={`fa-solid fa-chevron-down ${styles.profileChevron} ${isProfileOpen ? styles.chevronRotated : ''}`}
                  aria-hidden="true"
                />
              </button>

              {isProfileOpen && (
                <div
                  className={styles.profileDropdown}
                  role="menu"
                  aria-label="User Account Menu"
                  id="dropdown-user-profile"
                >
                  <div className={styles.profileMenuHeader}>
                    <div className={styles.profileMenuName}>{user.fullName}</div>
                    <div className={styles.profileMenuRole}>
                      Role: <span className={styles.profileRoleBadge}>{user.role.replace(/_/g, ' ')}</span>
                    </div>
                    {user.email && (
                      <div className={styles.profileMenuEmail}>{user.email}</div>
                    )}
                  </div>

                  <div className={styles.dropdownDivider} aria-hidden="true" />

                  <button
                    type="button"
                    role="menuitem"
                    className={styles.profileLogoutItem}
                    onClick={() => {
                      setIsProfileOpen(false);
                      handleLogout();
                    }}
                    id="btn-profile-logout"
                  >
                    <i className="fa-solid fa-right-from-bracket me-2" aria-hidden="true" />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
