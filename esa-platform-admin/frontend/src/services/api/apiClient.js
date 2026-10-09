import axios from 'axios';

// Single Axios instance used by every service module. Never hardcode
// localhost URLs elsewhere in the app — configure via .env instead.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('esa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('esa_token');
      localStorage.removeItem('esa_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    // Normalize into a single shape every caller can rely on.
    const message = error.response?.data?.error?.message || error.message || 'Unexpected error';
    const details = error.response?.data?.error?.details || null;
    return Promise.reject({ message, details, status: error.response?.status });
  }
);

export default apiClient;
