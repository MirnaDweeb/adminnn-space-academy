import styles from './SearchBar.module.css';

export default function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className={styles.wrap}>
      <i className={`fa-solid fa-magnifying-glass ${styles.icon}`} aria-hidden="true"></i>
      <input
        type="text"
        className={`form-control ${styles.input}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
