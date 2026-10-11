import { useState, useEffect, useId } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';

// sections: [{
//   title: string,
//   collapsible?: boolean,
//   defaultOpen?: boolean,
//   icon?: string,
//   items?: [{ to, icon, label, end }]
// }]
export default function Sidebar({ items, sections, label, isMobileOpen, onCloseMobile, topAction }) {
  const location = useLocation();
  const idPrefix = useId();

  // Track open/collapsed state for collapsible sections
  const [openSections, setOpenSections] = useState(() => {
    if (!sections) return {};
    const initial = {};
    sections.forEach((sec) => {
      initial[sec.title] = sec.defaultOpen !== false;
    });
    return initial;
  });

  // Track collapsed sidebar rail mode on desktop (expanded by default)
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);

  // Handle escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Prevent background body scrolling when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobileOpen]);

  // Automatically expand the relevant parent group when navigating to a nested page
  useEffect(() => {
    if (!sections || sections.length === 0) return;

    sections.forEach((section) => {
      if (!section.items || section.items.length === 0) return;

      const hasActiveChild = section.items.some((item) => {
        if (item.end) {
          return location.pathname === item.to;
        }
        return location.pathname === item.to || location.pathname.startsWith(item.to + '/');
      });

      if (hasActiveChild) {
        setOpenSections((prev) => ({
          ...prev,
          [section.title]: true,
        }));
      }
    });
  }, [location.pathname, sections]);

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const handleLinkClick = () => {
    // Automatically close mobile drawer when user selects a destination
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  };

  // If sections are provided (hierarchical navigation)
  if (sections && sections.length > 0) {
    return (
      <>
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div
            className={styles.mobileBackdrop}
            onClick={onCloseMobile}
            aria-hidden="true"
          />
        )}

        <aside
          className={`${styles.sidebar} ${isRailCollapsed ? styles.sidebarRail : ''} ${
            isMobileOpen ? styles.sidebarMobileOpen : ''
          }`}
          aria-label="Navigation Sidebar"
        >
          {/* Top Header / Rail & Mobile Toggles */}
          <div className={styles.topBar}>
            {!isRailCollapsed && label && (
              <div className={styles.sectionLabel}>
                <span className={styles.labelPulseDot} aria-hidden="true"></span>
                <span>{label}</span>
              </div>
            )}

            {/* Mobile close button (visible only in mobile drawer mode) */}
            {isMobileOpen && (
              <button
                type="button"
                className={styles.mobileCloseBtn}
                onClick={onCloseMobile}
                title="Close Navigation"
                aria-label="Close Navigation Menu"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            )}

            {/* Desktop Rail Toggle (hidden on mobile) */}
            <button
              type="button"
              className={styles.railToggleBtn}
              onClick={() => setIsRailCollapsed(!isRailCollapsed)}
              title={isRailCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={isRailCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <i
                className={`fa-solid ${isRailCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`}
                aria-hidden="true"
              ></i>
            </button>
          </div>

          {!isRailCollapsed && topAction}

          <div className={styles.sectionsContainer}>
            {sections.map((section, sIdx) => {
              const isOpen = openSections[section.title] !== false;
              const isCollapsible = section.collapsible !== false && section.items && section.items.length > 0;
              const sectionId = `${idPrefix}-sec-${sIdx}`;

              // Check if any child item is active to highlight parent section
              const containsActive = section.items?.some((item) => {
                if (item.end) return location.pathname === item.to;
                return location.pathname === item.to || location.pathname.startsWith(item.to + '/');
              });

              return (
                <div key={section.title} className={styles.sectionGroup}>
                  {/* Section Header */}
                  {!isRailCollapsed && isCollapsible ? (
                    <button
                      type="button"
                      id={`btn-${sectionId}`}
                      className={`${styles.sectionHeader} ${containsActive ? styles.sectionHeaderHasActive : ''}`}
                      onClick={() => toggleSection(section.title)}
                      aria-expanded={isOpen}
                      aria-controls={sectionId}
                    >
                      <span className={styles.sectionTitleWrap}>
                        {section.icon && (
                          <i className={`fa-solid ${section.icon} ${styles.headerIcon}`} aria-hidden="true"></i>
                        )}
                        <span>{section.title}</span>
                      </span>
                      <i
                        className={`fa-solid fa-chevron-down ${styles.chevron} ${
                          isOpen ? styles.chevronOpen : styles.chevronClosed
                        }`}
                        aria-hidden="true"
                      ></i>
                    </button>
                  ) : !isRailCollapsed && section.title ? (
                    <div className={styles.sectionLabelStatic}>
                      {section.icon && <i className={`fa-solid ${section.icon} me-1.5`} aria-hidden="true"></i>}
                      {section.title}
                    </div>
                  ) : (
                    <div className={styles.railDivider} title={section.title} />
                  )}

                  {/* Section Body with CSS transition */}
                  {section.items && section.items.length > 0 && (
                    <div
                      id={sectionId}
                      role="region"
                      aria-labelledby={`btn-${sectionId}`}
                      className={`${styles.sectionBody} ${
                        !isOpen && !isRailCollapsed ? styles.sectionBodyCollapsed : ''
                      }`}
                    >
                      <div className={styles.sectionInner}>
                        {section.items.map((item) => (
                          <NavLink
                            key={`${section.title}-${item.label}-${item.to}`}
                            to={item.to}
                            end={item.end}
                            title={isRailCollapsed ? item.label : undefined}
                            onClick={handleLinkClick}
                            className={({ isActive }) =>
                              `${styles.link} ${isCollapsible ? styles.subLink : ''} ${
                                isActive ? styles.linkActive : ''
                              } ${isRailCollapsed ? styles.linkRail : ''}`
                            }
                          >
                            <span className={styles.linkIconWrap}>
                              <i className={`fa-solid ${item.icon} ${styles.linkIcon}`} aria-hidden="true"></i>
                            </span>
                            {!isRailCollapsed && <span className={styles.linkLabel}>{item.label}</span>}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </>
    );
  }

  // Fallback for simple items array
  return (
    <>
      {isMobileOpen && (
        <div className={styles.mobileBackdrop} onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={`${styles.sidebar} ${isMobileOpen ? styles.sidebarMobileOpen : ''}`}
        aria-label="Navigation Sidebar"
      >
        <div className={styles.topBar}>
          {label && <div className={styles.sectionLabel}>{label}</div>}
          {isMobileOpen && (
            <button
              type="button"
              className={styles.mobileCloseBtn}
              onClick={onCloseMobile}
              aria-label="Close Navigation"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          )}
        </div>
        <div className={styles.sectionsContainer}>
          {items &&
            items.map((item) => (
              <NavLink
                key={`${item.label}-${item.to}`}
                to={item.to}
                end={item.end}
                onClick={handleLinkClick}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
              >
                <span className={styles.linkIconWrap}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
        </div>
      </aside>
    </>
  );
}
