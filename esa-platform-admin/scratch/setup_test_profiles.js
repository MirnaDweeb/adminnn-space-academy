const mongoose = require('../backend/node_modules/mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const StudentProfile = mongoose.model('StudentProfile', new mongoose.Schema({}, { strict: false }));
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const ReadinessResult = mongoose.model('ReadinessResult', new mongoose.Schema({}, { strict: false }));

  // 1. Pre-Uni student with complete profile
  const student = await User.findOne({ email: 'student@esa.dev' });
  await StudentProfile.updateOne(
    { user: student._id },
    {
      $set: {
        institution: 'Cairo STEM High School',
        phone: '+20 100 123 4567',
        nationalId: '30501011234567',
        educationLevel: 'Secondary / High School',
        major: 'General STEM',
        skills: ['Basic Physics', 'Introductory Python'],
      }
    },
    { upsert: true }
  );
  console.log('Pre-Uni student profile updated with Cairo STEM High School');

  // Find a PRE_UNIVERSITY application in SUBMITTED status
  const preUniApp = await Application.findOne({
    student: student._id,
    division: 'PRE_UNIVERSITY',
    status: 'SUBMITTED',
  });
  console.log('Found Pre-Uni SUBMITTED application:', preUniApp?._id);

  // 2. Also ensure a University student profile exists with University institution
  const uniStudent = await User.findOne({ email: 'uni.student@esa.dev' });
  if (uniStudent) {
    await StudentProfile.updateOne(
      { user: uniStudent._id },
      {
        $set: {
          institution: 'Faculty of Engineering, Cairo University',
          phone: '+20 111 987 6543',
          nationalId: '30101017654321',
          educationLevel: 'Undergraduate (Year 3)',
          major: 'Aerospace Engineering',
          skills: ['Orbital Mechanics', 'C++', 'MATLAB', 'Python'],
        }
      },
      { upsert: true }
    );
    console.log('University student profile updated with Cairo University');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
