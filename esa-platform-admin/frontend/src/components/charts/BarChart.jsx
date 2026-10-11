import React from 'react';
import styles from './charts.module.css';

/**
 * Horizontal Bar Chart for categorical breakdown (e.g. programs, outcome distribution)
 * items: [{ label, value, secondaryLabel, color }]
 */
export default function BarChart({ items = [], title, maxVal, unit = '', color = '#3A6985' }) {
  if (!items || items.length === 0) {
    return (
      <div className={styles.emptyChart}>
        <i className="fa-solid fa-chart-column text-muted mb-2 fs-3"></i>
        <div className="text-muted small">No data available</div>
      </div>
    );
  }

  const calculatedMax = maxVal || Math.max(...items.map((i) => i.value || 0), 1);

  return (
    <div className={styles.barChartWrap}>
      {title && <h6 className={styles.chartTitle}>{title}</h6>}
      <div className={styles.barList}>
        {items.map((item, idx) => {
          const val = item.value || 0;
          const pct = Math.min(Math.round((val / calculatedMax) * 100), 100);
          const barColor = item.color || color;

          return (
            <div key={item.label || idx} className={styles.barItem}>
              <div className={styles.barHeader}>
                <span className={styles.barLabel} title={item.label}>
                  {item.label}
                </span>
                <span className={styles.barValue}>
                  {val.toLocaleString()} {unit}
                  {item.secondaryLabel && <span className={styles.barSecondary}> ({item.secondaryLabel})</span>}
                </span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                  title={`${item.label}: ${val} ${unit}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
