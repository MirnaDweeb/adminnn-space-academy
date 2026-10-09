const mongoose = require('../backend/node_modules/mongoose');

async function testOutcomes() {
  console.log('====================================================');
  console.log('PHASE 8 — DETERMINISTIC OUTCOME VERIFICATION');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esa_academy');
  const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));
  const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const StudentProfile = mongoose.model('StudentProfile', new mongoose.Schema({}, { strict: false }));
  const ReadinessResult = mongoose.model('ReadinessResult', new mongoose.Schema({}, { strict: false }));

  const superAdmin = await User.findOne({ email: 'superadmin@esa.dev' });
  const student = await User.findOne({ email: 'student@esa.dev' });

  // 1. Create a specialized Intermediate course with explicit prerequisites in PRE_UNIVERSITY
  let intCourse = await Course.findOne({ title: 'Intermediate Satellite Systems Engineering' });
  if (!intCourse) {
    intCourse = await Course.create({
      title: 'Intermediate Satellite Systems Engineering',
      description: 'Intermediate module in small satellite telecommand and payload telemetry.',
      division: 'PRE_UNIVERSITY',
      level: 'INTERMEDIATE',
      targetAudience: 'Secondary students with prior robotics foundation',
      price: 600,
      capacity: 20,
      deliveryMode: 'HYBRID',
      status: 'ACTIVE',
      prerequisites: ['Space Robotics Foundation', 'Advanced Telemetry Basics'],
      createdBy: superAdmin._id,
    });
  }

  // 2. Create an application from student to this intermediate course
  let intApp = await Application.findOne({
    student: student._id,
    program: intCourse._id,
  });
  if (!intApp) {
    intApp = await Application.create({
      student: student._id,
      program: intCourse._id,
      division: 'PRE_UNIVERSITY',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      eligibilityStatus: 'NOT_EVALUATED',
    });
  }

  await mongoose.disconnect();

  // 3. Call evaluate readiness via API
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'preuni.admin@esa.dev', password: 'Password123!' }),
  });
  const { data: { token } } = await loginRes.json();

  const evalRes = await fetch(`http://localhost:5000/api/admin/applications/${intApp._id}/readiness`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const evalData = await evalRes.json();
  const result = evalData.data?.readinessResult;
  const updatedApp = evalData.data?.application;

  console.log(`Course Title: "${intCourse.title}" (level: ${intCourse.level})`);
  console.log(`Prerequisites: ${JSON.stringify(intCourse.prerequisites)}`);
  console.log(`Outcome: ${result?.outcome}`);
  console.log(`Score: ${result?.score}%`);
  console.log(`Application Status: ${updatedApp?.status}`);
  console.log(`Application EligibilityStatus: ${updatedApp?.eligibilityStatus}`);
  console.log(`Recommended Program: ${result?.recommendedProgram?.title}`);
  console.log(`Recommendation Reason: "${result?.recommendationReason}"`);

  console.log('\nCriteria Evaluated:');
  result?.criteriaEvaluated.forEach((c) => {
    console.log(`  - [${c.met ? 'MET' : 'NOT MET'}] ${c.criterion}: ${c.notes}`);
  });

  if (result?.outcome === 'FOUNDATION_RECOMMENDED') {
    console.log('\n[SUCCESS] Outcome FOUNDATION_RECOMMENDED verified with explainable foundation path!');
  } else {
    console.error('\n[FAILED] Expected FOUNDATION_RECOMMENDED but got ' + result?.outcome);
    process.exit(1);
  }
}

testOutcomes().catch((err) => {
  console.error(err);
  process.exit(1);
});
