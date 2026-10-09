/**
 * Phase 12: Evaluations & Learning Outcomes Constants
 *
 * Configurable thresholds and outcome determinations for cohort completion
 * and future certificate qualification (Phase 13).
 */

const EVALUATION_OUTCOME = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  INCOMPLETE: 'INCOMPLETE',
});

// Configurable named thresholds
const ATTENDANCE_PASSING_THRESHOLD = 80; // Minimum 80% attendance required
const SCORE_PASSING_THRESHOLD = 60; // Minimum 60% average assignment score required

module.exports = {
  EVALUATION_OUTCOME,
  ATTENDANCE_PASSING_THRESHOLD,
  SCORE_PASSING_THRESHOLD,
};
