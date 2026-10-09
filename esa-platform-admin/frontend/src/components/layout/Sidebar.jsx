import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

// sections: [{ title, collapsible: true|false, defaultOpen: true|false, icon: string, divisionSwitcher?: {...}, items: [{ to, icon, label, end }] }]
// or fallback items: [{ to, icon, label, end }]
export default function Sidebar({ items, sections, label }) {
  // Track open state for collapsible sections
  const [openSections, setOpenSections] = useState(() => {
    if (!sections) return {};
    const initial = {};
    sections.forEach((sec) => {
      initial[sec.title] = sec.defaultOpen !== false;
    });
    return initial;
  });

  // Track collapsed sidebar rail mode (expanded by default)
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);

  // Track division switcher dropdown open state
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (switcherRef.current && !switcherRef.current.contains(event.target)) {
        setIsSwitcherOpen(false);
      }
    };
    if (isSwitcherOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSwitcherOpen]);

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  if (sections && sections.length > 0) {
    return (
      <aside
        className={`${styles.sidebar} ${isRailCollapsed ? styles.sidebarRail : ''}`}
        aria-label="Sidebar Navigation"
      >
        {/* Top Header / Rail Toggle */}
        <div className={styles.topBar}>
          {!isRailCollapsed && label && (
            <div className={styles.sectionLabel}>{label}</div>
          )}
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

        <div className={styles.sectionsContainer}>
          {sections.map((section) => {
            const isOpen = openSections[section.title] !== false;
            const isCollapsible = section.collapsible !== false;

            return (
              <div key={section.title} className={styles.sectionGroup}>
                {/* Section Header */}
                {!isRailCollapsed && isCollapsible ? (
                  <button
                    type="button"
                    className={styles.sectionHeader}
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={isOpen}
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
                ) : !isRailCollapsed ? (
                  <div className={styles.sectionLabel}>
                    {section.icon && <i className={`fa-solid ${section.icon} me-1`} aria-hidden="true"></i>}
                    {section.title}
                  </div>
                ) : (
                  <div className={styles.railDivider} title={section.title} />
                )}

                {/* Division Switcher Card (if present on section) */}
                {section.divisionSwitcher && (
                  <div
                    ref={switcherRef}
                    className={`${styles.divisionSwitcherWrap} ${
                      isRailCollapsed ? styles.divisionSwitcherRail : ''
                    }`}
                  >
                    {section.divisionSwitcher.isSuperAdmin ? (
                      // Interactive dropdown switcher for Super Admin
                      <>
                        <button
                          type="button"
                          id="btn-division-switcher"
                          className={`${styles.divisionSwitcherBtn} ${
                            isSwitcherOpen ? styles.divisionSwitcherBtnActive : ''
                          }`}
                          onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                          aria-expanded={isSwitcherOpen}
                          title={
                            isRailCollapsed
                              ? `Current Division: ${
                                  section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                    ? 'Pre-University'
                                    : 'University'
                                } (Click to switch)`
                              : undefined
                          }
                        >
                          <div className={styles.switcherLeft}>
                            <span className={styles.switcherStatusDot} aria-hidden="true"></span>
                            <i
                              className={`fa-solid ${
                                section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                  ? 'fa-school'
                                  : 'fa-graduation-cap'
                              } ${
                                section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                  ? styles.iconPreUni
                                  : styles.iconUni
                              } ${styles.switcherIcon}`}
                              aria-hidden="true"
                            ></i>
                            {!isRailCollapsed && (
                              <div className={styles.switcherView}>
                                <div className={styles.switcherTitle}>
                                  {section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                    ? 'PRE-UNIVERSITY'
                                    : 'UNIVERSITY'}
                                </div>
                                <div className={styles.switcherSubtitle}>Current workspace</div>
                              </div>
                            )}
                          </div>
                          {!isRailCollapsed && (
                            <i
                              className={`fa-solid fa-chevron-down ${styles.switcherChevron} ${
                                isSwitcherOpen ? styles.switcherChevronOpen : ''
                              }`}
                              aria-hidden="true"
                            ></i>
                          )}
                        </button>

                        {/* Dropdown Options */}
                        {isSwitcherOpen && (
                          <div
                            className={styles.switcherDropdown}
                            role="menu"
                            aria-label="Select Academy Division"
                          >
                            <div className={styles.dropdownHeader}>Select Academy Division</div>
                            <button
                              type="button"
                              role="menuitem"
                              id="btn-select-division-pre-uni"
                              className={`${styles.switcherOption} ${
                                section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                  ? styles.switcherOptionActive
                                  : ''
                              }`}
                              onClick={() => {
                                section.divisionSwitcher.onSelectDivision('PRE_UNIVERSITY');
                                setIsSwitcherOpen(false);
                              }}
                            >
                              <div className={styles.optionHeader}>
                                <i className="fa-solid fa-school text-info me-2" aria-hidden="true"></i>
                                <span className={styles.optionName}>PRE-UNIVERSITY</span>
                                {section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY' && (
                                  <i className="fa-solid fa-check ms-auto text-info" aria-hidden="true"></i>
                                )}
                              </div>
                              <div className={styles.optionDesc}>Students & youth programs</div>
                            </button>

                            <div className={styles.switcherDivider} />

                            <button
                              type="button"
                              role="menuitem"
                              id="btn-select-division-uni"
                              className={`${styles.switcherOption} ${
                                section.divisionSwitcher.activeDivision === 'UNIVERSITY'
                                  ? styles.switcherOptionActive
                                  : ''
                              }`}
                              onClick={() => {
                                section.divisionSwitcher.onSelectDivision('UNIVERSITY');
                                setIsSwitcherOpen(false);
                              }}
                            >
                              <div className={styles.optionHeader}>
                                <i className="fa-solid fa-graduation-cap text-warning me-2" aria-hidden="true"></i>
                                <span className={styles.optionName}>UNIVERSITY</span>
                                {section.divisionSwitcher.activeDivision === 'UNIVERSITY' && (
                                  <i className="fa-solid fa-check ms-auto text-info" aria-hidden="true"></i>
                                )}
                              </div>
                              <div className={styles.optionDesc}>University training programs</div>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      // Locked static badge for Division Admins
                      <div
                        className={styles.divisionStaticBadge}
                        title={`Assigned Workspace: ${
                          section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                            ? 'Pre-University'
                            : 'University'
                        }`}
                      >
                        <div className={styles.switcherLeft}>
                          <span className={styles.switcherStatusDot} aria-hidden="true"></span>
                          <i
                            className={`fa-solid ${
                              section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                ? 'fa-school text-info'
                                : 'fa-graduation-cap text-warning'
                            } ${styles.switcherIcon}`}
                            aria-hidden="true"
                          ></i>
                          {!isRailCollapsed && (
                            <div className={styles.switcherView}>
                              <div className={styles.switcherTitle}>
                                {section.divisionSwitcher.activeDivision === 'PRE_UNIVERSITY'
                                  ? 'PRE-UNIVERSITY'
                                  : 'UNIVERSITY'}
                              </div>
                              <div className={styles.switcherSubtitle}>Assigned workspace</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Section Body with CSS transition */}
                <div
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
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  // Fallback for simple items array
  return (
    <aside className={styles.sidebar}>
      {label && <div className={styles.sectionLabel}>{label}</div>}
      {items &&
        items.map((item) => (
          <NavLink
            key={`${item.label}-${item.to}`}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
            <span>{item.label}</span>
          </NavLink>
        ))}
    </aside>
  );
}
