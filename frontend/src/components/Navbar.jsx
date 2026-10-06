import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Navbar.module.css';

export default function Navbar({ onRateClick, onSurveyClick, onReportClick, notificationBell }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { to: '/',      label: 'Home'        },
    { to: '/map',   label: 'Safety Map'  },
    { to: '/route', label: '🛡️ Safe Route' },
    { to: '/how',   label: 'How it Works'},
  ];

  const handleLogout = async () => {
    await logout();
    setUserMenuOpen(false);
    navigate('/');
  };

  // Get initials for avatar
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '';

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
      <Link to="/" className={styles.logo}>
        <span className={styles.logoDot} />
        SheTrust
        <span className={styles.logoCity}>Bengaluru</span>
      </Link>

      <div className={`${styles.links} ${menuOpen ? styles.open : ''}`}>
        {navLinks.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`${styles.link} ${loc.pathname === to ? styles.active : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </Link>
        ))}
        <button
          className={`btn btn-primary btn-sm ${styles.ctaBtn}`}
          onClick={() => { onRateClick?.(); setMenuOpen(false); }}
        >
          📍 Rate a Place
        </button>
        <button
          className={`btn btn-outline btn-sm ${styles.ctaBtn}`}
          onClick={() => { onSurveyClick?.(); setMenuOpen(false); }}
        >
          📋 Survey
        </button>
        <button
          className={`btn btn-outline btn-sm ${styles.ctaBtn}`}
          style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#F87171' }}
          onClick={() => { onReportClick?.(); setMenuOpen(false); }}
        >
          🚨 Report
        </button>
        {notificationBell && <div style={{ marginLeft: 4 }}>{notificationBell}</div>}

        {isAuthenticated ? (
          <div className={styles.userMenu}>
            <button
              className={styles.avatarBtn}
              onClick={() => setUserMenuOpen(o => !o)}
              aria-label="User menu"
            >
              <div className={styles.avatar}>{initials}</div>
              <span className={styles.userName}>{user?.name?.split(' ')[0]}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {userMenuOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownHeader}>
                  <div className={styles.dropdownName}>{user?.name}</div>
                  <div className={styles.dropdownEmail}>{user?.email}</div>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem} onClick={handleLogout}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/auth"
            className={styles.loginBtn}
            onClick={() => setMenuOpen(false)}
          >
            Sign In
          </Link>
        )}
      </div>

      <button
        className={styles.burger}
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle menu"
      >
        <span /><span /><span />
      </button>
    </nav>
  );
}
