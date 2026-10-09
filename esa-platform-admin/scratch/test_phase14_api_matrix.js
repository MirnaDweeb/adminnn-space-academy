const http = require('http');
const mongoose = require('../backend/node_modules/mongoose');
const User = require('../backend/src/models/User');
const Notification = require('../backend/src/models/Notification');
const OfficialEmailConfiguration = require('../backend/src/models/OfficialEmailConfiguration');

const BASE_URL = 'http://127.0.0.1:5000/api';

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

async function login(email, password = 'Password123!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || !res.data?.data?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function runApiMatrix() {
  console.log('================================================================');
  console.log('PHASE 14: NOTIFICATIONS & OFFICIAL EMAIL API TEST MATRIX');
  console.log('================================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');

  const superAdminToken = await login('superadmin@esa.dev');
  const preUniAdminToken = await login('preuni.admin@esa.dev');
  const uniAdminToken = await login('uni.admin@esa.dev');
  const studentToken = await login('student@esa.dev');

  const bcrypt = require('../backend/node_modules/bcrypt');
  const studentUser = await User.findOne({ email: 'student@esa.dev' });
  let otherStudentUser = await User.findOne({ role: 'STUDENT', _id: { $ne: studentUser._id } });
  if (!otherStudentUser) {
    otherStudentUser = await User.create({
      fullName: 'Other Student User',
      email: 'other.student@esa.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      role: 'STUDENT',
    });
  }


  // Seed two distinct notifications for testing
  const studentNotif = await Notification.create({
    recipient: studentUser._id,
    type: 'APPLICATION_DECISION',
    title: 'Test Notification for Student',
    message: 'This is a test notification message for student.',
    division: 'PRE_UNIVERSITY',
    read: false,
  });

  const otherNotif = await Notification.create({
    recipient: otherStudentUser._id,
    type: 'PAYMENT_CONFIRMED',
    title: 'Test Notification for Other Student',
    message: 'This is a test notification for other student.',
    division: 'UNIVERSITY',
    read: false,
  });

  const results = [];
  function record(id, name, endpoint, expected, actual, passed, details = '') {
    results.push({ id, name, endpoint, expected, actual, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id}: ${name} -> Expected ${expected}, got ${actual} ${details ? '(' + details + ')' : ''}`);
  }

  // 1. Unauthenticated /api/notifications/mine
  {
    const res = await request('/notifications/mine');
    record('API-01', 'Unauthenticated own notifications access', 'GET /api/notifications/mine', 401, res.status, res.status === 401);
  }

  // 2. Authenticated student /api/notifications/mine
  {
    const res = await request('/notifications/mine', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const valid = res.status === 200 && Array.isArray(res.data?.data?.notifications) && typeof res.data?.data?.unreadCount === 'number';
    record('API-02', 'Authenticated student own notifications access', 'GET /api/notifications/mine', 200, res.status, valid, `unread: ${res.data?.data?.unreadCount}`);
  }

  // 3. Unauthenticated PATCH /api/notifications/:id/read
  {
    const res = await request(`/notifications/${studentNotif._id}/read`, {
      method: 'PATCH',
    });
    record('API-03', 'Unauthenticated mark notification as read', 'PATCH /api/notifications/:id/read', 401, res.status, res.status === 401);
  }

  // 4. Cross-user mark as read blocked (Student tries to mark Other Student's notification)
  {
    const res = await request(`/notifications/${otherNotif._id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    record('API-04', 'Cross-user mark as read blocked (Owner isolation)', 'PATCH /api/notifications/:id/read', 403, res.status, res.status === 403, res.data?.error?.message);
  }

  // 5. Valid Owner mark as read
  {
    const res = await request(`/notifications/${studentNotif._id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const updated = await Notification.findById(studentNotif._id);
    const valid = res.status === 200 && updated.read === true && updated.readAt !== null;
    record('API-05', 'Owner mark notification as read succeeds', 'PATCH /api/notifications/:id/read', 200, res.status, valid, `read: ${updated.read}, readAt: ${updated.readAt}`);
  }

  // 6. Owner mark all as read
  {
    // Create an unread one
    await Notification.create({
      recipient: studentUser._id,
      type: 'PAYMENT_EXPIRED',
      title: 'Unread Notice',
      message: 'Unread test message',
      read: false,
    });

    const res = await request('/notifications/mark-all-read', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const remainingUnread = await Notification.countDocuments({ recipient: studentUser._id, read: false });
    const valid = res.status === 200 && remainingUnread === 0;
    record('API-06', 'Owner mark all notifications as read', 'PATCH /api/notifications/mark-all-read', 200, res.status, valid, `remaining unread: ${remainingUnread}`);
  }

  // 7. Admin notifications log - Unauthenticated (401)
  {
    const res = await request('/admin/notifications');
    record('API-07', 'Unauthenticated admin notifications log', 'GET /api/admin/notifications', 401, res.status, res.status === 401);
  }

  // 8. Admin notifications log - Student role blocked (403)
  {
    const res = await request('/admin/notifications', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    record('API-08', 'Student role blocked from admin notifications log', 'GET /api/admin/notifications', 403, res.status, res.status === 403);
  }

  // 9. Admin notifications log - Super Admin unrestricted / cross-division (200)
  {
    const res = await request('/admin/notifications', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const valid = res.status === 200 && Array.isArray(res.data?.data?.notifications);
    record('API-09', 'Super Admin cross-division notification log access', 'GET /api/admin/notifications', 200, res.status, valid, `count: ${res.data?.data?.notifications?.length}`);
  }

  // 10. Admin notifications log - Pre-University Admin own division (200)
  {
    const res = await request('/admin/notifications?division=PRE_UNIVERSITY', {
      headers: { Authorization: `Bearer ${preUniAdminToken}` },
    });
    const allPreUni = (res.data?.data?.notifications || []).every(
      (n) => !n.division || n.division === 'PRE_UNIVERSITY'
    );
    const valid = res.status === 200 && allPreUni;
    record('API-10', 'Pre-University Admin view own division notifications', 'GET /api/admin/notifications?division=PRE_UNIVERSITY', 200, res.status, valid, `scoped: ${allPreUni}`);
  }

  // 11. Admin notifications log - Pre-University Admin cross-division blocked (403)
  {
    const res = await request('/admin/notifications?division=UNIVERSITY', {
      headers: { Authorization: `Bearer ${preUniAdminToken}` },
    });
    record('API-11', 'Pre-University Admin cross-division request blocked', 'GET /api/admin/notifications?division=UNIVERSITY', 403, res.status, res.status === 403, res.data?.error?.message);
  }

  // 12. Email config GET - Super Admin (200)
  {
    const res = await request('/admin/notifications/email-config', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const valid = res.status === 200 && typeof res.data?.data?.config?.globalEmailEnabled === 'boolean';
    record('API-12', 'Super Admin view official email configuration', 'GET /api/admin/notifications/email-config', 200, res.status, valid, `sender: ${res.data?.data?.config?.senderEmail}`);
  }

  // 13. Email config GET - Division Admin blocked (403)
  {
    const res = await request('/admin/notifications/email-config', {
      headers: { Authorization: `Bearer ${preUniAdminToken}` },
    });
    record('API-13', 'Division Admin blocked from email config management', 'GET /api/admin/notifications/email-config', 403, res.status, res.status === 403);
  }

  // 14. Email config PATCH - Super Admin updates config (200)
  {
    const res = await request('/admin/notifications/email-config', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      body: {
        senderName: 'Egyptian Space Agency - Official Academy Portal',
        globalEmailEnabled: true,
      },
    });
    const valid = res.status === 200 && res.data?.data?.config?.senderName === 'Egyptian Space Agency - Official Academy Portal';
    record('API-14', 'Super Admin update official email configuration', 'PATCH /api/admin/notifications/email-config', 200, res.status, valid);
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  return results;
}

if (require.main === module) {
  runApiMatrix().catch((err) => {
    console.error('API Matrix Error:', err);
    process.exit(1);
  });
}

module.exports = { runApiMatrix };
