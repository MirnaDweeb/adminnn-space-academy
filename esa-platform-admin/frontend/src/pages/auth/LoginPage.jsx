import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './AuthForm.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form);
      const defaultPath =
        user.role === 'SUPER_ADMIN'
          ? '/admin'
          : user.role === 'PRE_UNIVERSITY_ADMIN'
          ? '/admin/PRE_UNIVERSITY'
          : user.role === 'UNIVERSITY_ADMIN'
          ? '/admin/UNIVERSITY'
          : '/dashboard';
      const redirectTo = location.state?.from?.pathname || defaultPath;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.title}>Sign in</div>
      <div className={styles.subtitle}>Access your Academy account</div>

      {error && <div className={`alert alert-danger ${styles.alert}`}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className="form-label">Email address</label>
          <input
            type="email"
            name="email"
            className="form-control"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className={styles.field}>
          <label className="form-label">Password</label>
          <input
            type="password"
            name="password"
            className="form-control"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className={styles.footerLink}>
        Don't have an account? <Link to="/register">Create one</Link>
      </div>
    </>
  );
}
