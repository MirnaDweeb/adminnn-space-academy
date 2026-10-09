import { Link, useParams } from 'react-router-dom';
import { DIVISION_LABELS } from '../../constants/divisions';
import styles from './PageHeader.module.css';

export default function PageHeader({ title, subtitle, actions, breadcrumbs, division: propDivision }) {
  const params = useParams();

  // Determine division context from prop or URL
  const currentDivision = propDivision || params.division;

  // Auto-generate breadcrumbs if not explicitly provided and we are in a division context
  const effectiveBreadcrumbs =
    breadcrumbs !== undefined
      ? breadcrumbs
      : currentDivision
      ? [
          { label: 'Academy', to: '/admin' },
          { label: DIVISION_LABELS[currentDivision] || currentDivision, to: `/admin/${currentDivision}` },
          { label: title },
        ]
      : null;

  return (
    <div className={styles.header}>
      <div className={styles.titleArea}>
        {effectiveBreadcrumbs && effectiveBreadcrumbs.length > 0 && (
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            {effectiveBreadcrumbs.map((crumb, idx) => {
              const isLast = idx === effectiveBreadcrumbs.length - 1;
              return (
                <span key={idx} className={styles.crumbItem}>
                  {idx > 0 && (
                    <i className={`fa-solid fa-chevron-right ${styles.crumbSeparator}`} aria-hidden="true"></i>
                  )}
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={styles.crumbCurrent} aria-current={isLast ? 'page' : undefined}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        )}

        <div className={styles.titleRow}>
          {currentDivision && (
            <span
              className={`${styles.divisionBadge} ${
                currentDivision === 'PRE_UNIVERSITY' ? styles.badgePreUni : styles.badgeUni
              }`}
            >
              <i
                className={`fa-solid ${
                  currentDivision === 'PRE_UNIVERSITY' ? 'fa-school' : 'fa-graduation-cap'
                } me-1`}
                aria-hidden="true"
              ></i>
              {currentDivision === 'PRE_UNIVERSITY' ? 'PRE-UNIVERSITY' : 'UNIVERSITY'}
            </span>
          )}
          <h1 className={styles.title}>{title}</h1>
        </div>

        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
