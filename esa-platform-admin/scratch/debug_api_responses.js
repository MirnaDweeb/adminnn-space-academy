const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {},
    };

    if (options.body && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let rawData = [];
      res.on('data', (chunk) => rawData.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(rawData);
        let parsed = null;
        try {
          parsed = JSON.parse(buffer.toString('utf8'));
        } catch (e) {
          parsed = buffer.toString('utf8');
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function debug() {
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@esa.dev', password: 'Password123!' },
  });
  const token = loginRes.data.data.token;
  console.log('Token obtained.');

  // 1. Student detail
  const studentsRes = await request('/admin/students', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('GET /admin/students:', studentsRes.status, 'Total:', studentsRes.data?.data?.pagination?.total);
  const firstStudent = studentsRes.data?.data?.students?.[0];
  console.log('First student:', firstStudent?._id, firstStudent?.fullName);

  if (firstStudent) {
    const sId = firstStudent._id;
    const putRes = await request(`/admin/students/${sId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: { fullName: firstStudent.fullName + ' Test', gpa: '3.9' },
    });
    console.log(`PUT /admin/students/${sId}:`, putRes.status, JSON.stringify(putRes.data));

    const overviewRes = await request(`/admin/students/${sId}/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`GET /admin/students/${sId}/overview:`, overviewRes.status, Object.keys(overviewRes.data || {}));
    if (overviewRes.data?.data) {
      console.log('overview data keys:', Object.keys(overviewRes.data.data));
    }
  }

  // 2. Reports PDF
  const repRes = await request('/reports/export-pdf?division=PRE_UNIVERSITY', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('GET /reports/export-pdf:', repRes.status, repRes.headers['content-type'], JSON.stringify(repRes.data));

  // 3. Feedback
  const fbRes = await request('/admin/feedback', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('GET /admin/feedback:', fbRes.status, JSON.stringify(fbRes.data));

  const fbSumRes = await request('/admin/feedback/summary', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('GET /admin/feedback/summary:', fbSumRes.status, JSON.stringify(fbSumRes.data));

  // 4. Certificates revoke
  const certsRes = await request('/admin/certificates', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cert = certsRes.data?.data?.certificates?.[0];
  console.log('First cert:', cert?._id, cert?.status);
  if (cert) {
    const revRes = await request(`/admin/certificates/${cert._id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { reason: 'Test revoke reason' },
    });
    console.log('Revoke result:', revRes.status, JSON.stringify(revRes.data));
  }

  // 5. Payment adjust
  const invRes = await request('/admin/invoices', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Invoices count:', invRes.data?.data?.invoices?.length);
  const inv = invRes.data?.data?.invoices?.[0];
  if (inv) {
    console.log('First inv:', inv._id, 'transactions count:', inv.transactions?.length);
    if (inv.transactions?.[0]) {
      const txId = inv.transactions[0]._id;
      const adjRes = await request(`/admin/payments/${txId}/adjust`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { adjustedAmount: 50, reason: 'Test adjustment' },
      });
      console.log('Payment adjust result:', adjRes.status, JSON.stringify(adjRes.data));
    }
  }
}

debug().catch(console.error);
