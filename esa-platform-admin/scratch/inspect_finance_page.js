const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  const loginRes = await request(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'preuni.admin@esa.dev', password: 'Password123!' }
  );

  const token = loginRes.data?.data?.token;
  console.log('Login status:', loginRes.status, 'token acquired:', !!token);

  const invRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invoices?division=PRE_UNIVERSITY',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log('Invoices HTTP Status:', invRes.status);
  console.log('Invoices Count:', invRes.data?.data?.invoices?.length);
  if (invRes.data?.data?.invoices?.length > 0) {
    console.log('First 3 invoices:');
    invRes.data.data.invoices.slice(0, 3).forEach((inv) => {
      console.log(` - ID: ${inv._id}, #: ${inv.invoiceNumber}, Amount: ${inv.amount}, Status: ${inv.status}, Program: ${inv.program?.title}`);
    });
  }
}

test();
