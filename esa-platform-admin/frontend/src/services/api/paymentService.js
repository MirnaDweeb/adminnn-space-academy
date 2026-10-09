import apiClient from './apiClient';

const paymentService = {
  // Initiates online Paymob checkout for an enrollment invoice
  initiateOnlinePayment: (enrollmentId) =>
    apiClient.post(`/payments/enrollments/${enrollmentId}/pay`).then((r) => r.data.data),

  // Fetches current payment & verification status for an enrollment
  getPaymentStatus: (enrollmentId) =>
    apiClient.get(`/payments/enrollments/${enrollmentId}/status`).then((r) => r.data.data),

  // Fetches all invoices & payment transaction history for current logged-in student
  getStudentInvoices: () =>
    apiClient.get('/students/mine/invoices').then((r) => r.data.data?.invoices || r.data.data || []),

  // Development sandbox simulation trigger
  simulateSandboxPayment: (payload) =>
    apiClient.post('/payments/paymob/simulate', payload).then((r) => r.data.data),
};

export default paymentService;
