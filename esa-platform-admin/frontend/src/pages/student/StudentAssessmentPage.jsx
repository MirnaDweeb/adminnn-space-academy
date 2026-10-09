import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../services/api/apiClient';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import styles from './StudentAssessmentPage.module.css';

export default function StudentAssessmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startTime] = useState(Date.now());

  // Answers state: array of { questionIndex, selectedAnswer }
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  useEffect(() => {
    const fetchAssessment = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.get(`/student/assessments/${id}`);
        setAssessment(res.data?.data?.assessment || null);
      } catch (err) {
        setError(err.message || 'Failed to load assessment. It may have expired or been deactivated.');
      } finally {
        setLoading(false);
      }
    };

    fetchAssessment();
  }, [id]);

  const handleSelectAnswer = (qIdx, value) => {
    setAnswers((prev) => ({
      ...prev,
      [qIdx]: value,
    }));
  };

  const handleToggleMultipleAnswer = (qIdx, value) => {
    setAnswers((prev) => {
      const currentList = Array.isArray(prev[qIdx]) ? [...prev[qIdx]] : [];
      if (currentList.includes(value)) {
        return { ...prev, [qIdx]: currentList.filter((v) => v !== value) };
      } else {
        return { ...prev, [qIdx]: [...currentList, value] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assessment) return;

    // Check answered questions
    const totalQuestions = assessment.questions?.length || 0;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < totalQuestions) {
      if (!window.confirm(`You have answered ${answeredCount} of ${totalQuestions} questions. Are you sure you want to submit?`)) {
        return;
      }
    }

    const elapsedMinutes = Math.max(Math.round((Date.now() - startTime) / 60000), 1);

    const formattedAnswers = Object.entries(answers).map(([qIdx, ans]) => ({
      questionIndex: Number(qIdx),
      selectedAnswer: ans,
    }));

    setSubmitting(true);
    try {
      const res = await apiClient.post(`/student/assessments/${id}/submit`, {
        answers: formattedAnswers,
        completionTimeMinutes: elapsedMinutes,
      });
      setSubmissionResult(res.data?.data || res.data);
    } catch (err) {
      alert(err.message || 'Failed to submit assessment attempt');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState message="Loading program assessment..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  // Display outcome card upon completion
  if (submissionResult) {
    const isRecommended = submissionResult.result === 'RECOMMENDED';
    const isFoundation = submissionResult.result === 'FOUNDATION_RECOMMENDED';
    const isManual = submissionResult.result === 'MANUAL_REVIEW';

    return (
      <div className={styles.container}>
        <div className={styles.assessmentCard}>
          <div className={styles.resultCard}>
            <div className={styles.scoreCircle}>
              <span className={styles.scoreVal}>{submissionResult.score}%</span>
              <span className={styles.scoreLabel}>Score</span>
            </div>

            <h3 className="fw-bold mb-2">Assessment Completed</h3>
            <p className="text-secondary mb-3">
              Total Points: <strong>{submissionResult.totalPoints}</strong> / {submissionResult.maxPoints} pts | Time: {submissionResult.completionTimeMinutes} min
            </p>

            <div className="mb-4">
              <span
                className={`badge fs-6 px-3 py-2 ${
                  isRecommended
                    ? 'bg-success'
                    : isFoundation
                    ? 'bg-primary'
                    : isManual
                    ? 'bg-warning text-dark'
                    : 'bg-danger'
                }`}
              >
                Recommendation: {submissionResult.result?.replace(/_/g, ' ')}
              </span>
            </div>

            <div className={styles.decisionNote}>
              <div className="fw-bold mb-1 text-navy">
                <i className="fa-solid fa-circle-info me-2 text-primary"></i>
                Admissions Decision Support Notice
              </div>
              <div>
                This assessment provides additional academic readiness evidence to our admissions committee.
                Final admission offers remain subject to official review of your application, educational prerequisites, and capacity availability.
              </div>
            </div>

            <div className="d-flex justify-content-center gap-3 mt-4">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => navigate('/applications')}
              >
                <i className="fa-solid fa-file-lines me-1"></i>My Applications
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/programs')}
              >
                <i className="fa-solid fa-book-open me-1"></i>Explore Programs
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.assessmentCard}>
        <div className={styles.headerWrap}>
          <div className={styles.title}>{assessment.title}</div>
          <div className={styles.programMeta}>
            <i className="fa-solid fa-satellite me-1"></i>
            {assessment.program?.title || 'Program Assessment'} • {assessment.timeLimitMinutes || 30} Minutes
          </div>
        </div>

        {assessment.instructions && (
          <div className={styles.instructionsBox}>
            <i className="fa-solid fa-circle-info me-2 text-cyan"></i>
            {assessment.instructions}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {assessment.questions?.map((q, idx) => {
            const currentAnswer = answers[idx];

            return (
              <div key={idx} className={styles.questionItem}>
                <div className={styles.questionNumber}>
                  Question {idx + 1} of {assessment.questions.length} ({q.weight || 1} pt)
                </div>
                <div className={styles.questionText}>{q.questionText}</div>

                {/* SINGLE CHOICE */}
                {q.questionType === 'SINGLE_CHOICE' && (
                  <div className={styles.optionsGroup}>
                    {q.options?.map((opt, optIdx) => (
                      <label
                        key={optIdx}
                        className={`${styles.optionLabel} ${currentAnswer === opt ? styles.optionSelected : ''}`}
                      >
                        <input
                          type="radio"
                          name={`q_${idx}`}
                          checked={currentAnswer === opt}
                          onChange={() => handleSelectAnswer(idx, opt)}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* MULTIPLE CHOICE */}
                {q.questionType === 'MULTIPLE_CHOICE' && (
                  <div className={styles.optionsGroup}>
                    {q.options?.map((opt, optIdx) => {
                      const isChecked = Array.isArray(currentAnswer) && currentAnswer.includes(opt);
                      return (
                        <label
                          key={optIdx}
                          className={`${styles.optionLabel} ${isChecked ? styles.optionSelected : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMultipleAnswer(idx, opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* TRUE / FALSE */}
                {q.questionType === 'TRUE_FALSE' && (
                  <div className="d-flex gap-3">
                    {['True', 'False'].map((val) => (
                      <label
                        key={val}
                        className={`${styles.optionLabel} flex-fill text-center justify-content-center ${
                          currentAnswer === val ? styles.optionSelected : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${idx}`}
                          checked={currentAnswer === val}
                          onChange={() => handleSelectAnswer(idx, val)}
                        />
                        <span>{val}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* RATING */}
                {q.questionType === 'RATING' && (
                  <div>
                    <div className="small text-secondary mb-2">Rate your proficiency (1 = Beginner, 5 = Expert):</div>
                    <div className={styles.ratingGroup}>
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className={`${styles.ratingBtn} ${
                            String(currentAnswer) === String(val) ? styles.ratingSelected : ''
                          }`}
                          onClick={() => handleSelectAnswer(idx, String(val))}
                        >
                          {val}★
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => navigate(-1)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary px-4 py-2" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Submitting Attempt...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane me-2"></i>
                  Submit Assessment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
