import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: '70vh' }}>
      <i className="fa-solid fa-satellite-dish mb-3" style={{ fontSize: '2.5rem', color: 'var(--esa-text-muted)' }}></i>
      <h1 className="h4 mb-2">Page not found</h1>
      <p className="esa-text-muted mb-3">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn btn-primary btn-sm">Return home</Link>
    </div>
  );
}
