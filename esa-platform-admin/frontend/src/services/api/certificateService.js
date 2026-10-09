import apiClient from './apiClient';

const certificateService = {
  // Admin: Issue certificate for a qualifying PASS evaluation
  async issueCertificate(evaluationId) {
    const res = await apiClient.post(`/admin/evaluations/${evaluationId}/certificate`);
    return res.data;
  },

  // Admin: List certificates with division scoping and filters
  async listCertificates(params = {}) {
    const res = await apiClient.get('/admin/certificates', { params });
    return res.data?.data || res.data;
  },

  // Admin: List evaluations eligible for certificate issuance
  async getEligibleEvaluations(params = {}) {
    const res = await apiClient.get('/admin/certificates/eligible', { params });
    return res.data?.data?.eligible || [];
  },

  // Admin: Get certificate detail
  async getCertificate(id) {
    const res = await apiClient.get(`/admin/certificates/${id}`);
    return res.data?.data?.certificate || res.data?.certificate;
  },

  // Admin: Revoke certificate with reason
  async revokeCertificate(id, data) {
    const res = await apiClient.patch(`/admin/certificates/${id}/revoke`, data);
    return res.data;
  },

  // Admin: Restore mistakenly revoked certificate
  async restoreCertificate(id, data = {}) {
    const res = await apiClient.patch(`/admin/certificates/${id}/restore`, data);
    return res.data;
  },

  // Admin: Update permitted certificate metadata (notes)
  async updateCertificateMetadata(id, data = {}) {
    const res = await apiClient.patch(`/admin/certificates/${id}`, data);
    return res.data;
  },

  // Admin: Download certificate PDF
  async downloadCertificatePdf(id) {
    const res = await apiClient.get(`/admin/certificates/${id}/pdf`, {
      responseType: 'blob',
    });
    return res.data;
  },

  // Public: Verify certificate authenticity (unauthenticated)
  async verifyCertificate(tokenOrSerial) {
    const res = await apiClient.get(`/certificates/verify/${encodeURIComponent(tokenOrSerial)}`);
    return res.data?.data || res.data;
  },

  // Student: Get own certificates list
  async getMyCertificates() {
    const res = await apiClient.get('/students/mine/certificates');
    return res.data?.data?.certificates || [];
  },

  // Student: Download own certificate PDF
  async downloadMyCertificatePdf(id) {
    const res = await apiClient.get(`/students/mine/certificates/${id}/pdf`, {
      responseType: 'blob',
    });
    return res.data;
  },
};

export default certificateService;
