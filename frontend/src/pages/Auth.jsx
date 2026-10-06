import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, isAuthenticated } = useAuth();

  const defaultMode = location.state?.mode || 'login';
  const [mode, setMode] = useState(defaultMode); // 'login' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const nameRef = useRef(null);
  const emailRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setError('');
    setForm({ name: '', email: '', password: '' });
    if (mode === 'signup') nameRef.current?.focus();
    else emailRef.current?.focus();
  }, [mode]);

  const handleChange = e => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'signup') {
      if (!form.name.trim()) return setError('Please enter your name.');
      if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    }
    if (!form.email.trim()) return setError('Please enter your email.');
    if (!form.password) return setError('Please enter your password.');

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signup({ name: form.name, email: form.email, password: form.password });
        setSuccess('Welcome to SheTrust! Redirecting…');
        setTimeout(() => navigate(location.state?.from || '/'), 1000);
      } else {
        await login({ email: form.email, password: form.password });
        navigate(location.state?.from || '/');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div className={styles.page}>
      {/* Animated background */}
      <div className={styles.bg}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.orb3} />
        <div className={styles.gridLines} />
      </div>

      {/* Back to home */}
      <Link to="/" className={styles.backLink}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to SheTrust
      </Link>

      <div className={styles.container}>
        {/* Left panel — brand */}
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <div className={styles.brandDot} />
            <span>SheTrust</span>
          </div>
          <h1 className={styles.brandHeadline}>
            {isLogin ? (
              <>Welcome<br />back, she<br />got this.</>
            ) : (
              <>Join the<br />women who<br />trust each<br />other.</>
            )}
          </h1>
          <p className={styles.brandSub}>
            Rate places. Find safe routes. Build a city that works for women.
          </p>
          <div className={styles.brandStats}>
            <div className={styles.stat}>
              <span className={styles.statNum}>2,400+</span>
              <span className={styles.statLabel}>Locations rated</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statNum}>8,100+</span>
              <span className={styles.statLabel}>Women trusting</span>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className={styles.formWrap}>
          <div className={styles.card}>
            {/* Mode toggle */}
            <div className={styles.toggle}>
              <button
                className={`${styles.toggleBtn} ${isLogin ? styles.toggleActive : ''}`}
                onClick={() => setMode('login')}
                type="button"
              >
                Sign In
              </button>
              <button
                className={`${styles.toggleBtn} ${!isLogin ? styles.toggleActive : ''}`}
                onClick={() => setMode('signup')}
                type="button"
              >
                Create Account
              </button>
            </div>

            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                {isLogin ? 'Sign in to your account' : 'Create your account'}
              </h2>
              <p className={styles.cardSub}>
                {isLogin
                  ? 'Continue contributing to safer cities'
                  : 'Start making Bengaluru safer for everyone'}
              </p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              {/* Name field — signup only */}
              <div className={`${styles.fieldWrap} ${!isLogin ? styles.fieldVisible : styles.fieldHidden}`}>
                <label className={styles.label} htmlFor="name">Full Name</label>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  <input
                    ref={nameRef}
                    id="name"
                    name="name"
                    type="text"
                    className={styles.input}
                    placeholder="Your name"
                    value={form.name}
                    onChange={handleChange}
                    autoComplete="name"
                    tabIndex={!isLogin ? 0 : -1}
                  />
                </div>
              </div>

              {/* Email */}
              <div className={styles.fieldWrap}>
                <label className={styles.label} htmlFor="email">Email Address</label>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 8l10 6 10-6"/>
                  </svg>
                  <input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    className={styles.input}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className={styles.fieldWrap}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="password">Password</label>
                  {isLogin && (
                    <button type="button" className={styles.forgotBtn}>Forgot password?</button>
                  )}
                </div>
                <div className={styles.inputWrap}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    className={styles.input}
                    placeholder={isLogin ? '••••••••' : 'Min. 6 characters'}
                    value={form.password}
                    onChange={handleChange}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPass(v => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {!isLogin && (
                  <div className={styles.strengthBar}>
                    <div
                      className={styles.strengthFill}
                      style={{
                        width: `${Math.min(100, (form.password.length / 12) * 100)}%`,
                        background: form.password.length >= 10
                          ? 'var(--safe)'
                          : form.password.length >= 6
                            ? 'var(--moderate)'
                            : 'var(--rose)'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Error / Success */}
              {error && (
                <div className={styles.errorBox}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}
              {success && (
                <div className={styles.successBox}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  {success}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>

              {/* Terms — signup only */}
              {!isLogin && (
                <p className={styles.terms}>
                  By creating an account, you agree to our{' '}
                  <span className={styles.termsLink}>Terms of Service</span> and{' '}
                  <span className={styles.termsLink}>Privacy Policy</span>.
                </p>
              )}
            </form>

            {/* Divider */}
            <div className={styles.divider}>
              <span className={styles.dividerLine} />
              <span className={styles.dividerText}>
                {isLogin ? 'New to SheTrust?' : 'Already have an account?'}
              </span>
              <span className={styles.dividerLine} />
            </div>

            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => setMode(isLogin ? 'signup' : 'login')}
            >
              {isLogin ? 'Create a free account →' : '← Sign in instead'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
