import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './AuthForm.module.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'STUDENT',
    division: 'PRE_UNIVERSITY',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (payload.role !== 'STUDENT') delete payload.division;
      await register(payload);
      navigate(form.role === 'STUDENT' || form.role === 'INSTRUCTOR' ? '/dashboard' : '/admin', { replace: true });
    } catch (err) {
      setError(err.details ? err.details.join(', ') : err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.title}>Create an account</div>
      <div className={styles.subtitle}>Register as a student or instructor</div>

      {error && <div className={`alert alert-danger ${styles.alert}`}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className="form-label">Full name</label>
          <input type="text" name="fullName" className="form-control" value={form.fullName} onChange={handleChange} required />
        </div>
        <div className={styles.field}>
          <label className="form-label">Email address</label>
          <input type="email" name="email" className="form-control" value={form.email} onChange={handleChange} required />
        </div>
        <div className={styles.field}>
          <label className="form-label">Password</label>
          <input type="password" name="password" className="form-control" value={form.password} onChange={handleChange} minLength={8} required />
        </div>
        <div className={styles.field}>
          <label className="form-label">Account type</label>
          <select name="role" className="form-select" value={form.role} onChange={handleChange}>
            <option value="STUDENT">Student</option>
            <option value="INSTRUCTOR">Instructor</option>
          </select>
        </div>
        {form.role === 'STUDENT' && (
          <div className={styles.field}>
            <label className="form-label">Division</label>
            <select name="division" className="form-select" value={form.division} onChange={handleChange}>
              <option value="PRE_UNIVERSITY">Pre-University</option>
              <option value="UNIVERSITY">University</option>
            </select>
          </div>
        )}
        <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className={styles.footerLink}>
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </>
  );
}
