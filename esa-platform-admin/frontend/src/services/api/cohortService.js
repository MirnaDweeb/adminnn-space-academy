import apiClient from './apiClient';

const cohortService = {
  // --- Admin Methods ---
  async createCohort(data) {
    const res = await apiClient.post('/admin/cohorts', data);
    return res.data?.data;
  },

  async listCohorts(params = {}) {
    const res = await apiClient.get('/admin/cohorts', { params });
    return res.data?.data;
  },

  async getCohort(id) {
    const res = await apiClient.get(`/admin/cohorts/${id}`);
    return res.data?.data;
  },

  async createAssignment(cohortId, data) {
    const res = await apiClient.post(`/admin/cohorts/${cohortId}/assignments`, data);
    return res.data?.data;
  },

  async listAssignments(cohortId) {
    const res = await apiClient.get(`/admin/cohorts/${cohortId}/assignments`);
    return res.data?.data;
  },

  // --- Phase 12: Evaluations & Learning Outcomes (Admin) ---
  async evaluateCohort(cohortId) {
    const res = await apiClient.post(`/admin/cohorts/${cohortId}/evaluate`);
    return res.data?.data;
  },

  async getCohortEvaluations(cohortId, studentId = null) {
    const params = studentId ? { studentId } : {};
    const res = await apiClient.get(`/admin/cohorts/${cohortId}/evaluations`, { params });
    return res.data?.data;
  },

  // --- Instructor Methods ---
  async listInstructorCohorts(params = {}) {
    const res = await apiClient.get('/instructor/cohorts', { params });
    return res.data?.data;
  },

  async getInstructorCohort(id) {
    const res = await apiClient.get(`/instructor/cohorts/${id}`);
    return res.data?.data;
  },

  async getInstructorCohortEvaluations(cohortId, studentId = null) {
    const params = studentId ? { studentId } : {};
    const res = await apiClient.get(`/instructor/cohorts/${cohortId}/evaluations`, { params });
    return res.data?.data;
  },

  async recordAttendance(cohortId, { sessionId, attendanceRecords }) {
    const res = await apiClient.post(`/instructor/cohorts/${cohortId}/attendance`, {
      sessionId,
      attendanceRecords,
    });
    return res.data?.data;
  },

  async getAttendance(cohortId, sessionId = null) {
    const params = sessionId ? { sessionId } : {};
    const res = await apiClient.get(`/instructor/cohorts/${cohortId}/attendance`, { params });
    return res.data?.data;
  },

  async createInstructorAssignment(cohortId, data) {
    const res = await apiClient.post(`/instructor/cohorts/${cohortId}/assignments`, data);
    return res.data?.data;
  },

  async recordGrades(assignmentId, { grades }) {
    const res = await apiClient.post(`/instructor/assignments/${assignmentId}/grades`, { grades });
    return res.data?.data;
  },

  async getGrades(assignmentId) {
    const res = await apiClient.get(`/instructor/assignments/${assignmentId}/grades`);
    return res.data?.data;
  },

  // Session Live Lifecycle (Instructor)
  async startSession(cohortId, sessionId) {
    const res = await apiClient.post(`/instructor/cohorts/${cohortId}/sessions/${sessionId}/start`);
    return res.data?.data;
  },

  async endSession(cohortId, sessionId) {
    const res = await apiClient.post(`/instructor/cohorts/${cohortId}/sessions/${sessionId}/end`);
    return res.data?.data;
  },

  async updateSession(cohortId, sessionId, data) {
    const res = await apiClient.patch(`/instructor/cohorts/${cohortId}/sessions/${sessionId}`, data);
    return res.data?.data;
  },

  // --- Student Methods ---
  async getStudentCohorts() {
    const res = await apiClient.get('/students/mine/cohorts');
    return res.data?.data;
  },

  async getMyEvaluations() {
    const res = await apiClient.get('/student/mine/evaluations');
    return res.data?.data;
  },

  async submitFeedback(payload) {
    const res = await apiClient.post('/student/mine/feedback', payload);
    return res.data?.data;
  },
};

export default cohortService;
