require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
const mongoose = require('../backend/node_modules/mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/esa_academy';
  await mongoose.connect(uri);
  const User = require('../backend/src/models/User');
  const { ALL_PERMISSIONS } = require('../backend/src/constants/permissions');

  // Update only legacy division admins that have empty permissions array
  const result = await User.updateMany(
    {
      role: { $in: ['PRE_UNIVERSITY_ADMIN', 'UNIVERSITY_ADMIN'] },
      $or: [
        { permissions: { $size: 0 } },
        { permissions: { $exists: false } }
      ]
    },
    { $set: { permissions: ALL_PERMISSIONS } }
  );

  console.log(`Updated ${result.modifiedCount} legacy admin accounts with ALL_PERMISSIONS.`);
  await mongoose.disconnect();
}

main().catch(console.error);
