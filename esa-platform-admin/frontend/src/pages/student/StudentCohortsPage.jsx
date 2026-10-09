import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import cohortService from '../../services/api/cohortService';
import styles from './StudentCohortsPage.module.css';

export default function StudentCohortsPage() {
  const [cohorts, setCohorts] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStudentData = async () => {
    setLoading(true);
    setError('');
    try {
      const [cohortsRes, evalsRes] = await Promise.all([
        cohortService.getStudentCohorts(),
        cohortService.getMyEvaluations(),
      ]);
      setCohorts(cohortsRes || []);
      setEvaluations(evalsRes || []);
    } catch (err) {
      setError(err.message || 'Failed to load class schedule and records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  if (loading) {
    return <LoadingState message="Loading your class cohorts, attendance history, and grades..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchStudentData} />;
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Classes & Academic Records"
        subtitle="View your scheduled cohort sessions, personal attendance records, and instructor graded deliverables."
      />

      {cohorts.length === 0 ? (
        <EmptyState
          title="No Scheduled Cohorts"
          message="You are not currently enrolled in any scheduled cohorts. Once your enrollment is confirmed and a batch is scheduled by your division administrator, your sessions will appear here."
        />
      ) : (
        <div>
          {cohorts.map((item) => {
            const { cohort, attendance, assignments } = item;
            const cohortEvals = evaluations.filter(
              (e) => String(e.cohort?._id || e.cohort) === String(cohort._id)
            );
            const latestEval = cohortEvals.length > 0 ? cohortEvals[0] : null;

            return (
              <div key={cohort._id} className={styles.cohortCard}>
                <div className={styles.cohortHeader}>
                  <div>
                    <span className={styles.cohortNumber}>{cohort.cohortNumber}</span>
                    <div className={styles.cohortTitle}>{cohort.name}</div>
                    <div className={styles.programTitle}>
                      <i className="fa-solid fa-graduation-cap me-1 text-primary"></i>
                      {cohort.program?.title} ({cohort.program?.division?.replace(/_/g, ' ')})
                    </div>
                    <div className="small text-muted mt-1">
                      <i className="fa-solid fa-chalkboard-user me-1 text-secondary"></i>
                      Instructor: {cohort.instructor?.fullName} ({cohort.instructor?.email})
                    </div>
                  </div>

                  <div className="text-end">
                    <StatusBadge status={cohort.status} />
                    <div className="small text-muted mt-2">
                      {new Date(cohort.startDate).toLocaleDateString()} &rarr; {new Date(cohort.endDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* STATS OVERVIEW */}
                <div className={styles.statsRow}>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#0284c7' }}>
                      {attendance.attendanceRate}%
                    </div>
                    <div className={styles.statLbl}>Attendance Rate</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#16a34a' }}>
                      {attendance.presentCount}
                    </div>
                    <div className={styles.statLbl}>Present</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#d97706' }}>
                      {attendance.lateCount}
                    </div>
                    <div className={styles.statLbl}>Late</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#dc2626' }}>
                      {attendance.absentCount}
                    </div>
                    <div className={styles.statLbl}>Absent</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal}>
                      {attendance.totalSessions}
                    </div>
                    <div className={styles.statLbl}>Total Sessions</div>
                  </div>
                </div>

                {/* OFFICIAL LEARNING OUTCOME (PHASE 12) */}
                <div className={styles.outcomeSection} id={`eval-section-${cohort._id}`}>
                  <div className={styles.outcomeHeader}>
                    <div className="d-flex align-items-center gap-2">
                      <i className="fa-solid fa-award text-primary fs-5"></i>
                      <div>
                        <span className="fw-bold text-dark">Official Learning Outcome & Certified Evaluation</span>
                        <div className="text-muted small">Final academic evaluation qualifying for certification</div>
                      </div>
                    </div>
                    {latestEval ? (
                      <div className="d-flex align-items-center gap-2">
                        <span className="small text-muted">Result:</span>
                        <StatusBadge status={latestEval.outcome} />
                      </div>
                    ) : (
                      <span className="badge bg-light text-secondary border">Evaluation Pending</span>
                    )}
                  </div>

                  {latestEval ? (
                    <div>
                      <div className={styles.outcomeGrid}>
                        <div className={styles.outcomeItem}>
                          <div className="small text-muted">Certified Attendance</div>
                          <div className="d-flex align-items-baseline gap-2 mt-1">
                            <span className={`fs-5 fw-bold ${latestEval.attendanceThresholdMet ? 'text-success' : 'text-danger'}`}>
                              {latestEval.attendanceRate}%
                            </span>
                            <span className="small text-muted">
                              {latestEval.attendanceThresholdMet ? '(Met \u2265 80%)' : '(Below 80% Gate)'}
                            </span>
                          </div>
                        </div>

                        <div className={styles.outcomeItem}>
                          <div className="small text-muted">Cumulative Score</div>
                          <div className="d-flex align-items-baseline gap-2 mt-1">
                            <span className={`fs-5 fw-bold ${latestEval.averageScore >= 60 ? 'text-success' : 'text-danger'}`}>
                              {latestEval.averageScore}%
                            </span>
                            <span className="small text-muted">
                              {latestEval.averageScore >= 60 ? '(Pass \u2265 60%)' : '(Below 60%)'}
                            </span>
                          </div>
                        </div>

                        <div className={styles.outcomeItem}>
                          <div className="small text-muted">Evaluated Date</div>
                          <div className="small fw-semibold text-dark mt-1">
                            {new Date(latestEval.evaluatedAt).toLocaleDateString()}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            {new Date(latestEval.evaluatedAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      <div className={styles.outcomeReasonBox}>
                        <div className="fw-semibold small text-primary mb-1">
                          <i className="fa-solid fa-circle-info me-1"></i> Determination Summary:
                        </div>
                        <div>{latestEval.outcomeReason}</div>
                      </div>

                      {cohortEvals.length > 1 && (
                        <div className="mt-3 pt-2 border-top">
                          <div className="small fw-semibold text-secondary mb-2">
                            <i className="fa-solid fa-clock-rotate-left me-1"></i> Evaluation History ({cohortEvals.length} runs):
                          </div>
                          <div className="d-flex flex-column gap-1">
                            {cohortEvals.slice(1).map((prev, idx) => (
                              <div key={prev._id} className={styles.evalHistoryItem}>
                                <div className="d-flex align-items-center gap-2">
                                  <span className="text-muted">Run #{cohortEvals.length - 1 - idx}:</span>
                                  <StatusBadge status={prev.outcome} />
                                  <span className="text-muted small">Attendance: {prev.attendanceRate}% | Score: {prev.averageScore}%</span>
                                </div>
                                <span className="text-muted small">{new Date(prev.evaluatedAt).toLocaleDateString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted small p-2 bg-white rounded border">
                      <i className="fa-regular fa-clock me-1 text-secondary"></i>
                      This cohort has not yet been officially evaluated by your division administrator. Once the training schedule concludes and assessments are completed, certified outcomes will appear here.
                    </div>
                  )}
                </div>

                {/* SESSIONS & ATTENDANCE LOG */}
                <div className="mb-4">
                  <div className={styles.sectionTitle}>
                    <i className="fa-regular fa-calendar-check text-primary"></i> Session Schedule & Personal Attendance Log
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={`table ${styles.studentTable}`}>
                      <thead>
                        <tr>
                          <th>Session #</th>
                          <th>Date</th>
                          <th>Topic</th>
                          <th>Duration</th>
                          <th>Attendance Status</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohort.sessions?.map((sess) => {
                          const record = attendance.records?.find((r) => String(r.sessionId) === String(sess._id));
                          return (
                            <tr key={sess._id}>
                              <td className="fw-bold">Session {sess.sessionNumber}</td>
                              <td>{new Date(sess.date).toLocaleDateString()}</td>
                              <td className="fw-semibold text-dark">{sess.topic}</td>
                              <td>{sess.durationMinutes} mins</td>
                              <td>
                                {record ? (
                                  <StatusBadge status={record.status} />
                                ) : (
                                  <span className="badge bg-light text-muted border">Not Recorded Yet</span>
                                )}
                              </td>
                              <td className="small text-muted">{record?.notes || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DELIVERABLES & GRADES */}
                <div>
                  <div className={styles.sectionTitle}>
                    <i className="fa-solid fa-file-pen text-success"></i> Deliverables, Project Scores & Feedback
                  </div>
                  <div className={styles.tableWrap}>
                    {assignments?.length === 0 ? (
                      <div className="p-3 text-center text-muted small">No deliverables assigned for this cohort yet.</div>
                    ) : (
                      <table className={`table ${styles.studentTable}`}>
                        <thead>
                          <tr>
                            <th>Deliverable</th>
                            <th>Due Date</th>
                            <th>Score / Max</th>
                            <th>Status / Grade</th>
                            <th>Instructor Feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments?.map((a) => {
                            const percentage = a.score !== null ? Math.round((a.score / a.maxScore) * 100) : null;
                            return (
                              <tr key={a._id}>
                                <td>
                                  <div className="fw-semibold text-dark">{a.title}</div>
                                  <div className="small text-muted">{a.description}</div>
                                </td>
                                <td>{new Date(a.dueDate).toLocaleDateString()}</td>
                                <td>
                                  {a.score !== null ? (
                                    <span className="fw-bold text-dark">
                                      {a.score} / {a.maxScore}
                                    </span>
                                  ) : (
                                    <span className="text-muted">— / {a.maxScore}</span>
                                  )}
                                </td>
                                <td>
                                  {a.score !== null ? (
                                    <span
                                      className={`badge ${
                                        percentage >= 75
                                          ? 'bg-success-subtle text-success border border-success-subtle'
                                          : percentage >= 60
                                          ? 'bg-warning-subtle text-warning border border-warning-subtle'
                                          : 'bg-danger-subtle text-danger border border-danger-subtle'
                                      }`}
                                    >
                                      {percentage}%
                                    </span>
                                  ) : (
                                    <span className="badge bg-light text-secondary border">Pending Grading</span>
                                  )}
                                </td>
                                <td className="small text-secondary">{a.feedback || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
