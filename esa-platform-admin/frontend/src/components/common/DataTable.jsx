import styles from './DataTable.module.css';
import EmptyState from './EmptyState';

// columns: [{ key, label, render?(row) }]
export default function DataTable({ columns, rows, data, emptyTitle = 'No records found', pagination, onRowClick }) {
  const tableRows = rows || data || [];
  if (!tableRows || tableRows.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <EmptyState title={emptyTitle} />
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={`table ${styles.table}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, idx) => (
            <tr
              key={row._id || row.id || idx}
              className={onRowClick ? styles.clickableRow : undefined}
              onClick={
                onRowClick
                  ? (e) => {
                      if (e.target.closest('button, a, input, select, textarea, label')) return;
                      onRowClick(row);
                    }
                  : undefined
              }
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && (
        <div className={styles.pagination}>
          <span>
            Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total ?? pagination.totalItems ?? tableRows.length} total
          </span>
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
