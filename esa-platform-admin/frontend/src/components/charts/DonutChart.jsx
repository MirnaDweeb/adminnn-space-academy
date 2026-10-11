import React from 'react';
import styles from './charts.module.css';

/**
 * Lightweight SVG Donut Chart
 * items: [{ label, value, color }]
 */
export default function DonutChart({ items = [], title, size = 180, strokeWidth = 24, centerLabel, centerValue }) {
  const validItems = items.filter((it) => it.value > 0);
  const total = validItems.reduce((sum, it) => sum + it.value, 0);

  if (total === 0) {
    return (
      <div className={styles.emptyChart}>
        <i className="fa-solid fa-chart-pie text-muted mb-2 fs-3"></i>
        <div className="text-muted small">No data available</div>
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  const defaultColors = [
    '#3A6985', // Deep Cosmos Blue
    '#1E7C85', // Deep Teal-Green
    '#D4B87C', // Gold-Tan
    '#4E83A4', // Cosmos Supporting Tint
    '#2A95A0', // Teal-Green Supporting Tint
    '#996814', // Accessible Warm Gold
    '#254558', // Deep Cosmos Navy
    '#135056', // Deep Teal
  ];

  return (
    <div className={styles.donutWrap}>
      {title && <h6 className={styles.chartTitle}>{title}</h6>}
      <div className={styles.donutInner}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donutSvg}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--esa-border, #e2e8f0)"
            strokeWidth={strokeWidth}
          />
          {validItems.map((item, idx) => {
            const percent = item.value / total;
            const strokeDasharray = `${percent * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedPercent * circumference;
            accumulatedPercent += percent;
            const color = item.color || defaultColors[idx % defaultColors.length];

            return (
              <circle
                key={item.label || idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className={styles.donutSegment}
              >
                <title>{`${item.label}: ${item.value} (${Math.round(percent * 100)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        {(centerValue !== undefined || centerLabel) && (
          <div className={styles.donutCenter}>
            <div className={styles.donutCenterValue}>{centerValue ?? total}</div>
            {centerLabel && <div className={styles.donutCenterLabel}>{centerLabel}</div>}
          </div>
        )}
      </div>

      <div className={styles.donutLegend}>
        {items.map((item, idx) => {
          const color = item.color || defaultColors[idx % defaultColors.length];
          const pct = total > 0 && item.value > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.label || idx} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: color }} />
              <span className={styles.legendLabel}>{item.label}</span>
              <span className={styles.legendValue}>
                {item.value} <span className={styles.legendPct}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
