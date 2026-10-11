require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const mongoose = require('../backend/node_modules/mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/esa_academy';
  await mongoose.connect(uri);
  const User = require('../backend/src/models/User');
  const admins = await User.find({
    role: { $in: ['PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN', 'SUPER_ADMIN'] }
  });
  console.log(admins.map(a => ({
    email: a.email,
    role: a.role,
    division: a.division,
    permissionsCount: a.permissions ? a.permissions.length : 0,
    permissions: a.permissions
  })));
  await mongoose.disconnect();
}

main().catch(console.error);
