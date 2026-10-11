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
      const payload = {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: 'STUDENT',
        division: form.division,
      };
      await register(payload);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.details ? err.details.join(', ') : err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.title}>Create an account</div>
      <div className={styles.subtitle}>Register as a student in the Space Academy</div>

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
          <label className="form-label">Academic Division</label>
          <select name="division" className="form-select" value={form.division} onChange={handleChange}>
            <option value="PRE_UNIVERSITY">Pre-University Division (School / Prep / Secondary)</option>
            <option value="UNIVERSITY">University Division (Undergraduate / Graduate)</option>
          </select>
        </div>
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
