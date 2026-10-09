import apiClient from './apiClient';

const programService = {
  list: (params = {}) => apiClient.get('/programs', { params }).then((r) => r.data),
  getById: (id) => apiClient.get(`/programs/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/programs', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.put(`/programs/${id}`, payload).then((r) => r.data.data),
  updateStatus: (id, status, reason) =>
    apiClient.patch(`/programs/${id}/status`, { status, reason }).then((r) => r.data.data),
};

export default programService;
