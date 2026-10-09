import apiClient from './apiClient';

const reportService = {
  getOverview: (division, params = {}) =>
    apiClient
      .get('/admin/reports/overview', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getApplications: (division, params = {}) =>
    apiClient
      .get('/admin/reports/applications', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getEnrollments: (division, params = {}) =>
    apiClient
      .get('/admin/reports/enrollments', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getFinance: (division, params = {}) =>
    apiClient
      .get('/admin/reports/finance', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getEvaluations: (division, params = {}) =>
    apiClient
      .get('/admin/reports/evaluations', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getCertificates: (division, params = {}) =>
    apiClient
      .get('/admin/reports/certificates', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  getNotifications: (division, params = {}) =>
    apiClient
      .get('/admin/reports/notifications', {
        params: division && division !== 'own' && division !== 'all' ? { division, ...params } : params,
      })
      .then((r) => r.data.data),

  downloadExportCsv: async (division, report, params = {}) => {
    const queryParams = {
      report,
      ...(division && division !== 'own' && division !== 'all' ? { division } : {}),
      ...params,
    };
    const response = await apiClient.get('/admin/reports/export', {
      params: queryParams,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const disposition = response.headers['content-disposition'];
    let filename = `esa_report_${report}_${new Date().toISOString().slice(0, 10)}.csv`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },

  downloadExportPdf: async (division, report, params = {}) => {
    const queryParams = {
      report,
      ...(division && division !== 'own' && division !== 'all' ? { division } : {}),
      ...params,
    };
    const response = await apiClient.get('/admin/reports/export-pdf', {
      params: queryParams,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const disposition = response.headers['content-disposition'];
    let filename = `esa_report_${report}_${new Date().toISOString().slice(0, 10)}.pdf`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },
};

export default reportService;
