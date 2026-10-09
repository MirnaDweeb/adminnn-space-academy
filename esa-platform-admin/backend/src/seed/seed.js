require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const InstructorProfile = require('../models/InstructorProfile');
const AdminScope = require('../models/AdminScope');
const { ROLES } = require('../constants/roles');
const { DIVISIONS } = require('../constants/divisions');

const SEED_PASSWORD = 'Password123!';

const seedUsers = [
  { fullName: 'Super Admin', email: 'superadmin@esa.dev', role: ROLES.SUPER_ADMIN, division: null },
  { fullName: 'Pre-University Admin', email: 'preuni.admin@esa.dev', role: ROLES.PRE_UNIVERSITY_ADMIN, division: DIVISIONS.PRE_UNIVERSITY },
  { fullName: 'University Admin', email: 'uni.admin@esa.dev', role: ROLES.UNIVERSITY_ADMIN, division: DIVISIONS.UNIVERSITY },
  { fullName: 'Sample Instructor', email: 'instructor@esa.dev', role: ROLES.INSTRUCTOR, division: DIVISIONS.PRE_UNIVERSITY },
  { fullName: 'Sample University Instructor', email: 'uni.instructor@esa.dev', role: ROLES.INSTRUCTOR, division: DIVISIONS.UNIVERSITY },
  { fullName: 'Sample Student', email: 'student@esa.dev', role: ROLES.STUDENT, division: DIVISIONS.PRE_UNIVERSITY },
  { fullName: 'Sample University Student', email: 'uni.student@esa.dev', role: ROLES.STUDENT, division: DIVISIONS.UNIVERSITY },
];

async function run() {
  await connectDB();
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  for (const def of seedUsers) {
    const existing = await User.findOne({ email: def.email });
    if (existing) {
      console.log(`[seed] skip (exists): ${def.email}`);

      // Repair Issue 1: Ensure existing instructors have a valid InstructorProfile consistent with division
      if (def.role === ROLES.INSTRUCTOR) {
        if (!existing.division && def.division) {
          existing.division = def.division;
          await existing.save();
        }
        const profile = await InstructorProfile.findOne({ user: existing._id });
        if (!profile) {
          await InstructorProfile.create({
            user: existing._id,
            division: existing.division || def.division,
            divisions: [existing.division || def.division],
            title: 'Senior Space Systems Instructor',
            specialization: 'Satellite Communications & Orbital Dynamics',
            bio: 'Expert instructor in Egyptian Space Agency space academy training programs.',
          });
          console.log(`[seed] repaired missing InstructorProfile for: ${existing.email}`);
        }
      }
      continue;
    }

    const user = await User.create({ ...def, passwordHash });

    if (def.role === ROLES.STUDENT) {
      await StudentProfile.create({ user: user._id, division: def.division });
    }
    if (def.role === ROLES.INSTRUCTOR) {
      await InstructorProfile.create({
        user: user._id,
        division: def.division,
        divisions: [def.division],
        title: 'Senior Space Systems Instructor',
        specialization: 'Satellite Communications & Orbital Dynamics',
        bio: 'Expert instructor in Egyptian Space Agency space academy training programs.',
      });
    }
    if ([ROLES.PRE_UNIVERSITY_ADMIN, ROLES.UNIVERSITY_ADMIN].includes(def.role)) {
      await AdminScope.create({ user: user._id, division: def.division });
    }

    console.log(`[seed] created: ${def.email} / password: ${SEED_PASSWORD}`);
  }

  await mongoose.disconnect();
  console.log('[seed] done.');
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
