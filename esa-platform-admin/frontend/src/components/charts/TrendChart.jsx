import React from 'react';
import styles from './charts.module.css';

/**
 * Timeline / Trend Bar Chart
 * data: [{ date or period, value, label }]
 */
export default function TrendChart({ data = [], title, unit = '', color = '#3A6985', height = 140 }) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.emptyChart} style={{ height }}>
        <i className="fa-solid fa-chart-line text-muted mb-2 fs-3"></i>
        <div className="text-muted small">No trend data available for selected range</div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);

  return (
    <div className={styles.trendWrap}>
      {title && <h6 className={styles.chartTitle}>{title}</h6>}
      <div className={styles.trendPlot} style={{ height }}>
        {data.map((d, idx) => {
          const val = d.value || 0;
          const heightPct = Math.max(Math.round((val / maxVal) * 100), val > 0 ? 6 : 2);
          const displayDate = d.date || d.period || `Day ${idx + 1}`;

          return (
            <div key={displayDate} className={styles.trendColumn}>
              <div className={styles.trendBarContainer}>
                <div
                  className={styles.trendBar}
                  style={{ height: `${heightPct}%`, backgroundColor: color }}
                >
                  <span className={styles.trendTooltip}>
                    {displayDate}: {val.toLocaleString()} {unit}
                  </span>
                </div>
              </div>
              <div className={styles.trendDateLabel} title={displayDate}>
                {displayDate.length > 7 ? displayDate.slice(5) : displayDate}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
