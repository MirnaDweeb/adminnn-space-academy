import apiClient from './apiClient';

const applicationService = {
  createApplication: (programId) =>
    apiClient.post('/applications', { programId }).then((r) => r.data.data),
  listMyApplications: () =>
    apiClient.get('/applications/mine').then((r) => r.data.data),
};

export default applicationService;
