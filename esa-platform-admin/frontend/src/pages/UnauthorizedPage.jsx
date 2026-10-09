import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: '70vh' }}>
      <i className="fa-solid fa-lock mb-3" style={{ fontSize: '2.5rem', color: 'var(--esa-danger)' }}></i>
      <h1 className="h4 mb-2">Access denied</h1>
      <p className="esa-text-muted mb-3">You do not have permission to view this page.</p>
      <Link to="/" className="btn btn-primary btn-sm">Return home</Link>
    </div>
  );
}
