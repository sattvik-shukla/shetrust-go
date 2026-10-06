import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { getStoredToken, setStoredToken } from '../utils/api';

const AuthContext = createContext(null);

const USER_KEY = 'shetrust_user';
const AUTH_TOKEN_KEY = 'shetrust_auth_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch current user from /api/auth/me on mount
  useEffect(() => {
    const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!authToken) { setLoading(false); return; }

    api.get('/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(res => {
        setUser(res.data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(async ({ name, email, password }) => {
    setError(null);
    const anonToken = getStoredToken(); // link previous anon ratings
    const res = await api.post('/auth/signup', { name, email, password, anonToken });
    const { token, user: newUser } = res.data;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    const res = await api.post('/auth/login', { email, password });
    const { token, user: loggedUser } = res.data;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(loggedUser));
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const logout = useCallback(async () => {
    const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (authToken) {
      try { await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${authToken}` } }); }
      catch {}
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // Inject auth token into all API calls if logged in
  useEffect(() => {
    const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (authToken && user) {
      // Override the anon token interceptor for authenticated users
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, error, signup, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
