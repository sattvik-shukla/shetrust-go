import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Token management ─────────────────────────────────────────────────
const TOKEN_KEY = 'shetrust_anon_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setStoredToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

// Attach saved anon token to every request
api.interceptors.request.use(config => {
  const token = getStoredToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// If server issues a new token, save it
api.interceptors.response.use(
  response => {
    const newToken = response.headers['x-auth-token'];
    if (newToken) setStoredToken(newToken);
    return response;
  },
  error => Promise.reject(error)
);

// ── Location endpoints ───────────────────────────────────────────────
export const locationsApi = {
  getAll: (params = {}) => api.get('/locations', { params }),

  getHeatmap: (slot = 'evening') =>
    api.get('/locations/heatmap', { params: { slot, city: 'Bengaluru' } }),

  getById: (id) => api.get(`/locations/${id}`),

  search: (query) => api.get(`/locations/search/${encodeURIComponent(query)}`),

  create: (data) => api.post('/locations', data),
};

// ── Ratings endpoints ────────────────────────────────────────────────
export const ratingsApi = {
  submit: (data) => api.post('/ratings', data),

  getForLocation: (locationId, slot) =>
    api.get(`/ratings/location/${locationId}`, { params: slot ? { slot } : {} }),

  getMyRatings: () => api.get('/ratings/my'),
};

// ── Survey endpoints ─────────────────────────────────────────────────
export const surveyApi = {
  submit: (data) => api.post('/survey', data),

  getStats: () => api.get('/survey/stats'),

  getWeights: () => api.get('/survey/weights'),
};

// ── Health ───────────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get('/health'),
};

export default api;
