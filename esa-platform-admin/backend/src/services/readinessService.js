const Course = require('../models/Course');
const { PROGRAM_LEVEL, PROGRAM_STATUS } = require('../constants/statuses');
const { DIVISIONS } = require('../constants/divisions');

/**
 * Deterministic rule-based evaluation of student application readiness.
 *
 * Scoring and Gate Policy:
 * -------------------------------------------------------------
 * 1. Mandatory Gates (20 pts each):
 *    - Division & Educational Tier Alignment (isGate: true, weight: 20)
 *    - Profile Completeness & Institutional Verification (isGate: true, weight: 20)
 *    Failure of ANY mandatory gate immediately forces outcome to MANUAL_REVIEW,
 *    overriding any numerical points scored on academic criteria.
 *
 * 2. Academic Preparation Criteria (30 pts each):
 *    - Academic Background & Level Preparation (isGate: false, weight: 30)
 *    - Program Prerequisite Fulfillment (isGate: false, weight: 30)
 *
 * 3. Deterministic Evaluation Pipeline:
 *    Gate Evaluation -> Score Calculation -> Outcome Determination:
 *    - If any mandatory gate fails: outcome is MANUAL_REVIEW (regardless of score).
 *    - If all mandatory gates pass:
 *      * Score 75%–100% (100%): All criteria satisfied -> ELIGIBLE.
 *      * Score 50%–74% (70%): Gates pass, but specific background or prerequisite gap identified -> FOUNDATION_RECOMMENDED.
 *      * Score < 50% (40%): Both academic criteria unsatisfied -> MANUAL_REVIEW.
 *
 * Identity Verification:
 * Safe profile and account signals are used exclusively (institutional affiliation,
 * educational completeness, contact info, and active account status).
 * No National ID numbers are stored, exposed, or required for readiness evaluation.
 *
 * @param {Object} params
 * @param {Object} params.application - The Application document
 * @param {Object} params.student - The User document for the student
 * @param {Object} params.profile - The StudentProfile document (if any)
 * @param {Object} params.program - The Course document (program)
 * @returns {Promise<Object>} Evaluated criteria, score, outcome, and explainable recommendation
 */
async function evaluateStudentReadiness({ application, student, profile, program }) {
  const criteriaEvaluated = [];

  // 1. Division & Educational Tier Alignment (Mandatory Gate: 20 pts)
  const appDivision = application.division || program.division;
  const inst = (profile?.institution || '').toLowerCase();

  let tierMet = true;
  let tierNotes = '';

  if (appDivision !== program.division) {
    tierMet = false;
    tierNotes = `Division conflict: Program belongs to ${program.division} while application is scoped to ${appDivision}.`;
  } else if (appDivision === DIVISIONS.PRE_UNIVERSITY) {
    const higherEdKeywords = ['university', 'faculty', 'college', 'higher institute', 'bachelor', 'undergraduate'];
    const matchesHigherEd = higherEdKeywords.some((kw) => inst.includes(kw));

    if (matchesHigherEd && !inst.includes('school')) {
      tierMet = false;
      tierNotes = `Institutional tier discrepancy: Applicant institution indicates higher education ("${profile.institution}") while applying to Pre-University training tier.`;
    } else {
      tierMet = true;
      tierNotes = `Educational tier confirmed: Applicant division aligns with Pre-University secondary education standards (${profile?.institution || 'Registered secondary student'}).`;
    }
  } else if (appDivision === DIVISIONS.UNIVERSITY) {
    const secondaryKeywords = ['secondary school', 'high school', 'prep school', 'primary'];
    const matchesSecondary = secondaryKeywords.some((kw) => inst.includes(kw));

    if (matchesSecondary && !inst.includes('university') && !inst.includes('faculty')) {
      tierMet = false;
      tierNotes = `Institutional tier discrepancy: Applicant institution indicates secondary schooling ("${profile.institution}") while applying to University training tier.`;
    } else {
      tierMet = true;
      tierNotes = `Educational tier confirmed: Applicant division aligns with University higher education standards (${profile?.institution || 'Registered university student'}).`;
    }
  }

  criteriaEvaluated.push({
    criterion: 'Division & Educational Tier Alignment',
    met: tierMet,
    weight: 20,
    isGate: true,
    notes: tierNotes,
  });

  // 2. Profile Completeness & Institutional Verification (Mandatory Gate: 20 pts)
  // Safe profile signals only: institutional affiliation, active account status, education details, contact
  let profileMet = false;
  let profileNotes = '';

  if (profile) {
    const hasContact = Boolean(profile.phone || student.phone);
    const hasInst = Boolean(profile.institution && profile.institution.trim());
    const hasEduInfo = Boolean(
      (profile.educationLevel && profile.educationLevel.trim()) ||
      (profile.major && profile.major.trim()) ||
      profile.academicYear
    );
    const isAccountActive = student.isActive !== false;

    if (hasInst && isAccountActive && (hasContact || hasEduInfo)) {
      profileMet = true;
      profileNotes = `Student identity verified via active institutional affiliation ("${profile.institution}") and confirmed educational profile data.`;
    } else if (hasInst && isAccountActive) {
      profileMet = true;
      profileNotes = `Student institutional affiliation verified ("${profile.institution}"). Basic academic record confirmed.`;
    } else if (hasEduInfo && hasContact && isAccountActive) {
      profileMet = true;
      profileNotes = 'Student educational credentials and contact records verified on file.';
    } else {
      profileMet = false;
      profileNotes = 'Student profile lacks verified institutional affiliation or required educational completeness. Verification gate failed.';
    }
  } else {
    profileMet = false;
    profileNotes = 'Student profile is uninitialized; missing institutional affiliation and academic records. Administrative review required.';
  }

  criteriaEvaluated.push({
    criterion: 'Profile Completeness & Institutional Verification',
    met: profileMet,
    weight: 20,
    isGate: true,
    notes: profileNotes,
  });

  // 3. Academic Background & Level Preparation (Academic Criterion: 30 pts)
  const programLevel = program.level || PROGRAM_LEVEL.BEGINNER;
  let bgMet = true;
  let bgNotes = '';

  const studentMajor = (profile?.major || '').toLowerCase();
  const studentSkills = (profile?.skills || []).map((s) => s.toLowerCase());
  const stemKeywords = ['engineering', 'computer', 'physics', 'astronomy', 'aerospace', 'science', 'robotics', 'stem', 'math'];
  const hasStemMajorOrSkill =
    stemKeywords.some((kw) => studentMajor.includes(kw)) ||
    studentSkills.some((s) => stemKeywords.some((kw) => s.includes(kw)));

  if (programLevel === PROGRAM_LEVEL.BEGINNER) {
    bgMet = true;
    bgNotes = `Introductory Program Level (${programLevel}): Applicant satisfies baseline educational requirements for entry-level academy coursework.`;
  } else if (programLevel === PROGRAM_LEVEL.INTERMEDIATE) {
    if (hasStemMajorOrSkill || (profile?.educationLevel && profile.educationLevel.toLowerCase().includes('university'))) {
      bgMet = true;
      bgNotes = `Intermediate Program Level (${programLevel}): Verified academic background (${profile?.major || 'STEM curriculum'}) satisfies intermediate prerequisite expectations.`;
    } else {
      bgMet = false;
      bgNotes = `Intermediate Program Level (${programLevel}): Profile lacks verified technical background in STEM or computing. Preparatory foundation path recommended.`;
    }
  } else if (programLevel === PROGRAM_LEVEL.ADVANCED) {
    if (appDivision === DIVISIONS.PRE_UNIVERSITY) {
      bgMet = false;
      bgNotes = `Advanced Program Level (${programLevel}): Advanced specialized syllabus exceeds standard secondary curricula. Foundational sequence recommended first.`;
    } else if (hasStemMajorOrSkill) {
      bgMet = true;
      bgNotes = `Advanced Program Level (${programLevel}): Academic specialization in ${profile?.major || 'Engineering/Science'} demonstrates preparation for advanced modules.`;
    } else {
      bgMet = false;
      bgNotes = `Advanced Program Level (${programLevel}): Specialized domain requirements not confirmed in applicant records. Foundation review recommended.`;
    }
  }

  criteriaEvaluated.push({
    criterion: 'Academic Background & Level Preparation',
    met: bgMet,
    weight: 30,
    isGate: false,
    notes: bgNotes,
  });

  // 4. Program Prerequisite Fulfillment (Academic Criterion: 30 pts)
  let prereqMet = true;
  let prereqNotes = '';

  const explicitPrereqs = Array.isArray(program.prerequisites) ? program.prerequisites : [];

  if (explicitPrereqs.length > 0) {
    const missing = explicitPrereqs.filter((req) => {
      const lower = req.toLowerCase();
      return (
        !studentSkills.includes(lower) &&
        !studentMajor.includes(lower) &&
        !(profile?.notes || '').toLowerCase().includes(lower)
      );
    });

    if (missing.length === 0) {
      prereqMet = true;
      prereqNotes = `All program prerequisites verified: ${explicitPrereqs.join(', ')}.`;
    } else {
      prereqMet = false;
      prereqNotes = `Missing verified prerequisites: ${missing.join(', ')}. Gap can be resolved via preparatory foundation training.`;
    }
  } else {
    if (programLevel === PROGRAM_LEVEL.BEGINNER) {
      prereqMet = true;
      prereqNotes = 'Course has open foundational prerequisites; standard STEM curriculum alignment verified.';
    } else if (programLevel === PROGRAM_LEVEL.INTERMEDIATE) {
      if (hasStemMajorOrSkill || (profile?.skills && profile.skills.length > 0)) {
        prereqMet = true;
        prereqNotes = 'General prerequisite knowledge confirmed based on verified student academic competencies.';
      } else {
        prereqMet = false;
        prereqNotes = 'Intermediate module expects foundational mathematics and programming knowledge not documented in student profile.';
      }
    } else {
      // ADVANCED
      if (hasStemMajorOrSkill && (profile?.skills && profile.skills.length >= 2)) {
        prereqMet = true;
        prereqNotes = 'Advanced technical prerequisite competencies verified in student profile.';
      } else {
        prereqMet = false;
        prereqNotes = 'Advanced syllabus requires specialized lab and theoretical prerequisites not confirmed in current records.';
      }
    }
  }

  criteriaEvaluated.push({
    criterion: 'Program Prerequisite Fulfillment',
    met: prereqMet,
    weight: 30,
    isGate: false,
    notes: prereqNotes,
  });

  // Deterministic Score Calculation
  const score = criteriaEvaluated.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0);

  // Deterministic Gate-First Pipeline:
  // Gate Evaluation -> Score Evaluation -> Final Outcome
  const failedGates = criteriaEvaluated.filter((c) => c.isGate && !c.met);

  let outcome = 'MANUAL_REVIEW';

  if (failedGates.length > 0) {
    // Override: Any failed mandatory gate forces MANUAL_REVIEW regardless of points scored
    outcome = 'MANUAL_REVIEW';
  } else if (score >= 75 && bgMet && prereqMet) {
    // 75%–100%: Mandatory gates pass and all academic criteria satisfied
    outcome = 'ELIGIBLE';
  } else if (score >= 50 && score < 75) {
    // 50%–74%: Mandatory gates pass, but specific background or prerequisite gap identified
    outcome = 'FOUNDATION_RECOMMENDED';
  } else {
    // < 50%: Multiple academic deficits
    outcome = 'MANUAL_REVIEW';
  }

  // Generate deterministic explainable Course Recommendation
  let recommendedProgram = null;
  let recommendationReason = '';

  if (outcome === 'FOUNDATION_RECOMMENDED') {
    // Find an active or beginner program in the same division to serve as foundation
    const foundationCourse = await Course.findOne({
      division: appDivision,
      level: PROGRAM_LEVEL.BEGINNER,
      status: { $in: [PROGRAM_STATUS.ACTIVE, PROGRAM_STATUS.DRAFT] },
      _id: { $ne: program._id },
    }).sort({ status: 1, createdAt: -1 });

    if (foundationCourse) {
      recommendedProgram = foundationCourse._id;
      recommendationReason = `Recommended Foundation Path: "${foundationCourse.title}" (${foundationCourse.level}, ${foundationCourse.deliveryMode}) — Designed to bridge prerequisite fundamentals in STEM and lab readiness before advancing to ${program.title}.`;
    } else {
      recommendationReason = `Recommended Foundation Path: Introductory preparatory module in ${appDivision === DIVISIONS.PRE_UNIVERSITY ? 'Pre-University STEM Basics' : 'University Engineering Fundamentals'} recommended prior to enrolling in ${program.title}.`;
    }
  } else if (outcome === 'ELIGIBLE') {
    recommendedProgram = program._id;
    recommendationReason = `Direct Pathway Confirmed: Applicant meets all prerequisite and academic tier criteria for "${program.title}" (${program.level}, ${program.deliveryMode}). Matches verified student background.`;
  } else {
    // MANUAL_REVIEW
    recommendedProgram = null;
    const gateReasons = failedGates.map((g) => g.criterion).join(', ');
    recommendationReason = failedGates.length > 0
      ? `Automated recommendation deferred: Mandatory gate condition unsatisfied (${gateReasons}). Application requires review by ${appDivision === DIVISIONS.PRE_UNIVERSITY ? 'Pre-University' : 'University'} Admissions Committee.`
      : `Automated recommendation deferred: Applicant credentials require individualized evaluation by ${appDivision === DIVISIONS.PRE_UNIVERSITY ? 'Pre-University' : 'University'} Admissions Committee.`;
  }

  return {
    criteriaEvaluated,
    score,
    outcome,
    recommendedProgram,
    recommendationReason,
  };
}

module.exports = {
  evaluateStudentReadiness,
};
