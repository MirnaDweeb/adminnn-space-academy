import apiClient from './apiClient';

const authService = {
  register: (payload) => apiClient.post('/auth/register', payload).then((r) => r.data.data),
  login: (payload) => apiClient.post('/auth/login', payload).then((r) => r.data.data),
  getMe: () => apiClient.get('/auth/me').then((r) => r.data.data),
};

export default authService;
