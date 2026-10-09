import styles from './FilterBar.module.css';

// filters: [{ name, value, onChange, options: [{value,label}] }]
export default function FilterBar({ filters = [] }) {
  return (
    <div className={styles.wrap}>
      {filters.map((f) => (
        <select
          key={f.name}
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          aria-label={f.name}
        >
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
