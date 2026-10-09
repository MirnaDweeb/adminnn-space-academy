import apiClient from './apiClient';

const adminService = {
  getGatewayOverview: () => apiClient.get('/admin/gateway').then((r) => r.data.data),
  getDivisionOverview: (division) => apiClient.get(`/admin/${division}/overview`).then((r) => r.data.data),
  listStudents: (division, params = {}) =>
    apiClient
      .get('/admin/students', { params: division && division !== 'own' ? { division, ...params } : params })
      .then((r) => r.data),
  getStudent: (id) => apiClient.get(`/admin/students/${id}`).then((r) => r.data.data),
  listApplications: (division, params = {}) =>
    apiClient
      .get('/admin/applications', { params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params })
      .then((r) => r.data),
  getApplication: (id) =>
    apiClient.get(`/admin/applications/${id}`).then((r) => r.data.data),
  addApplicationNote: (id, note) =>
    apiClient.post(`/admin/applications/${id}/notes`, { note }).then((r) => r.data.data),
  updateApplicationDecision: (id, decision, reason) =>
    apiClient.patch(`/admin/applications/${id}/decision`, { decision, reason }).then((r) => r.data.data),
  evaluateReadiness: (id, payload = {}) =>
    apiClient.post(`/admin/applications/${id}/readiness`, payload).then((r) => r.data.data),
  getReadinessHistory: (id) =>
    apiClient.get(`/admin/applications/${id}/readiness`).then((r) => r.data.data),
  listAdministrators: (params = {}) =>
    apiClient.get('/admin/administrators', { params }).then((r) => r.data),
  getAdministrator: (id) =>
    apiClient.get(`/admin/administrators/${id}`).then((r) => r.data.data),
  getAvailablePermissions: () =>
    apiClient.get('/admin/administrators/permissions').then((r) => r.data.data),
  createAdministrator: (payload) =>
    apiClient.post('/admin/administrators', payload).then((r) => r.data.data),
  updateAdministrator: (id, payload) =>
    apiClient.put(`/admin/administrators/${id}`, payload).then((r) => r.data.data),
  updateAdministratorStatus: (id, isActive) =>
    apiClient.patch(`/admin/administrators/${id}/status`, { isActive }).then((r) => r.data.data),
  updateStudentStatus: (id, isActive, reason) =>
    apiClient.patch(`/admin/students/${id}/status`, { isActive, reason }).then((r) => r.data.data),
  listInstructors: (division, params = {}) =>
    apiClient
      .get('/admin/instructors', { params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params })
      .then((r) => r.data),
  getInstructor: (id) =>
    apiClient.get(`/admin/instructors/${id}`).then((r) => r.data.data),
  createInstructor: (payload) =>
    apiClient.post('/admin/instructors', payload).then((r) => r.data.data),
  updateInstructorStatus: (id, isActive, reason) =>
    apiClient.patch(`/admin/instructors/${id}/status`, { isActive, reason }).then((r) => r.data.data),
  listAuditLogs: (division, params = {}) =>
    apiClient
      .get('/admin/audit-logs', { params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params })
      .then((r) => r.data),
  getAuditLog: (id) =>
    apiClient.get(`/admin/audit-logs/${id}`).then((r) => r.data.data),
  getAuditLogFilters: (division) =>
    apiClient
      .get('/admin/audit-logs/filters', { params: division && division !== 'own' && division !== 'all' ? { division } : {} })
      .then((r) => r.data.data),
  // Phase 9: Enrollment & Capacity
  enrollApplication: (id) =>
    apiClient.post(`/admin/applications/${id}/enroll`).then((r) => r.data.data),
  listProgramEnrollments: (programId, params = {}) =>
    apiClient.get(`/admin/programs/${programId}/enrollments`, { params }).then((r) => r.data),
  getProgramCapacity: (programId) =>
    apiClient.get(`/admin/programs/${programId}/capacity`).then((r) => r.data.data),
  cancelEnrollment: (enrollmentId, reason) =>
    apiClient.patch(`/admin/enrollments/${enrollmentId}/cancel`, { reason }).then((r) => r.data.data),
  // Phase 10: Invoices, Payments & Finance
  generateInvoice: (enrollmentId, payload = {}) =>
    apiClient.post(`/admin/enrollments/${enrollmentId}/invoice`, payload).then((r) => r.data.data),
  getInvoiceForEnrollment: (enrollmentId) =>
    apiClient.get(`/admin/enrollments/${enrollmentId}/invoice`).then((r) => r.data.data),
  recordPayment: (invoiceId, payload) =>
    apiClient.post(`/admin/invoices/${invoiceId}/payments`, payload).then((r) => r.data.data),
  processExpiredInvoices: () =>
    apiClient.post('/admin/invoices/process-expired').then((r) => r.data.data),
  listInvoices: (division, params = {}) =>
    apiClient
      .get('/admin/invoices', { params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params })
      .then((r) => r.data),
  getInvoice: (id) =>
    apiClient.get(`/admin/invoices/${id}`).then((r) => r.data.data),
  // Instructor account lifecycle
  syncInstructorAccess: (id) =>
    apiClient.post(`/admin/instructors/${id}/sync-access`).then((r) => r.data.data),
  syncAllInstructorsAccess: () =>
    apiClient.post('/admin/instructors/sync-access').then((r) => r.data.data),
  // Cohorts & schedule management
  updateCohort: (id, payload) =>
    apiClient.put(`/admin/cohorts/${id}`, payload).then((r) => r.data.data),
  // Program assessment builder & decision support
  listAssessments: (division, params = {}) =>
    apiClient
      .get('/admin/assessments', { params: division && division !== 'all' ? { division, ...params } : params })
      .then((r) => r.data),
  getAssessment: (id) =>
    apiClient.get(`/admin/assessments/${id}`).then((r) => r.data.data),
  createAssessment: (payload) =>
    apiClient.post('/admin/assessments', payload).then((r) => r.data.data),
  updateAssessment: (id, payload) =>
    apiClient.put(`/admin/assessments/${id}`, payload).then((r) => r.data.data),
  toggleAssessmentStatus: (id, isActive) =>
    apiClient.patch(`/admin/assessments/${id}/status`, { isActive }).then((r) => r.data.data),
  deleteAssessment: (id) =>
    apiClient.delete(`/admin/assessments/${id}`).then((r) => r.data.data),
  listAssessmentAttempts: (id) =>
    apiClient.get(`/admin/assessments/${id}/attempts`).then((r) => r.data.data),
  // Safe program deletion / archive
  deleteOrArchiveProgram: (id, reason) =>
    apiClient.delete(`/programs/${id}`, { data: { reason } }).then((r) => r.data.data),
  // Student Overview Dossier & Edit & PDF
  getStudentOverview: (id) =>
    apiClient.get(`/admin/students/${id}/overview`).then((r) => r.data.data),
  updateStudent: (id, payload) =>
    apiClient.put(`/admin/students/${id}`, payload).then((r) => r.data.data),
  downloadStudentReportPdf: async (id) => {
    const response = await apiClient.get(`/admin/students/${id}/report-pdf`, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `student-dossier-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  // Finance updates & accounting adjustments
  updateInvoiceMetadata: (id, payload) =>
    apiClient.patch(`/admin/invoices/${id}`, payload).then((r) => r.data.data),
  adjustPayment: (id, payload) =>
    apiClient.post(`/admin/payments/${id}/adjust`, payload).then((r) => r.data.data),
  // Certificate management enhancements
  restoreCertificate: (id, reason) =>
    apiClient.patch(`/admin/certificates/${id}/restore`, { reason }).then((r) => r.data.data),
  updateCertificateMetadata: (id, payload) =>
    apiClient.patch(`/admin/certificates/${id}`, payload).then((r) => r.data.data),
  // Feedback Center & AI/Thematic summary
  listFeedback: (division, params = {}) =>
    apiClient
      .get('/admin/feedback', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),
  getFeedbackSummary: (division, params = {}) =>
    apiClient
      .get('/admin/feedback/summary', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),
};

export default adminService;
