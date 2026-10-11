import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import cohortService from '../../services/api/cohortService';
import { useAuth } from '../../hooks/useAuth';
import { ATTENDANCE_STATUS, SESSION_STATUS } from '../../constants/statuses';
import styles from './InstructorCohortsPage.module.css';

export default function InstructorCohortsPage() {
  const { user } = useAuth();

  const [cohorts, setCohorts] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [cohortData, setCohortData] = useState(null); // includes roster, assignments
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active view tab in workspace: 'attendance' | 'grading' | 'roster'
  const [activeTab, setActiveTab] = useState('attendance');

  // Attendance state
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendanceMap, setAttendanceMap] = useState({}); // { studentId: { status, notes } }
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);

  // Grading state
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [gradesMap, setGradesMap] = useState({}); // { studentId: { score, feedback } }
  const [savingGrades, setSavingGrades] = useState(false);

  // Create Assignment modal/form state
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [newAssignForm, setNewAssignForm] = useState({ title: '', description: '', dueDate: '', maxScore: 100 });
  const [creatingAssign, setCreatingAssign] = useState(false);

  // Phase 12: Evaluations state (Read-only for Instructor)
  const [evaluationsData, setEvaluationsData] = useState(null);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [evaluationsError, setEvaluationsError] = useState('');

  const loadInstructorEvaluations = async (cohortId) => {
    if (!cohortId) return;
    setEvaluationsLoading(true);
    setEvaluationsError('');
    try {
      const data = await cohortService.getInstructorCohortEvaluations(cohortId);
      setEvaluationsData(data);
    } catch (err) {
      setEvaluationsError(err.message || 'Failed to load evaluations for this cohort');
    } finally {
      setEvaluationsLoading(false);
    }
  };

  // Fetch assigned cohorts
  const fetchInstructorCohorts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await cohortService.listInstructorCohorts();
      const list = res.cohorts || [];
      setCohorts(list);
      if (list.length > 0 && !selectedCohort) {
        setSelectedCohort(list[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load assigned cohorts');
    } finally {
      setLoading(false);
    }
  }, [selectedCohort]);

  useEffect(() => {
    fetchInstructorCohorts();
  }, [fetchInstructorCohorts]);

  // Load selected cohort details (roster, assignments, sessions)
  const loadCohortWorkspace = useCallback(async (cohortId) => {
    try {
      const res = await cohortService.getInstructorCohort(cohortId);
      setCohortData(res);

      // Default to first session if sessions exist
      if (res.cohort?.sessions?.length > 0) {
        const firstSess = res.cohort.sessions[0];
        setSelectedSessionId(firstSess._id);
        loadSessionAttendance(cohortId, firstSess._id, res.roster || []);
      }

      // Default to first assignment if exists
      if (res.assignments?.length > 0) {
        const firstAssign = res.assignments[0];
        setSelectedAssignmentId(firstAssign._id);
        loadAssignmentGrades(firstAssign._id, res.roster || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load cohort details');
    }
  }, []);

  useEffect(() => {
    if (selectedCohort?._id) {
      loadCohortWorkspace(selectedCohort._id);
    }
  }, [selectedCohort, loadCohortWorkspace]);

  // Load existing attendance for a session
  const loadSessionAttendance = async (cohortId, sessId, currentRoster = cohortData?.roster || []) => {
    try {
      const res = await cohortService.getAttendance(cohortId, sessId);
      const existingRecords = res.records || [];

      // Initialize map for all students in roster
      const initialMap = {};
      currentRoster.forEach((r) => {
        const studentId = r.student?._id;
        const found = existingRecords.find((rec) => String(rec.student?._id || rec.student) === String(studentId));
        initialMap[studentId] = {
          status: found ? found.status : ATTENDANCE_STATUS.PRESENT,
          notes: found ? found.notes || '' : '',
          isSaved: !!found,
        };
      });
      setAttendanceMap(initialMap);
    } catch (err) {
      console.error('Failed to load session attendance:', err);
    }
  };

  // Load existing grades for an assignment
  const loadAssignmentGrades = async (assignId, currentRoster = cohortData?.roster || []) => {
    try {
      const res = await cohortService.getGrades(assignId);
      const existingGrades = res.grades || [];

      const initialMap = {};
      currentRoster.forEach((r) => {
        const studentId = r.student?._id;
        const found = existingGrades.find((g) => String(g.student?._id || g.student) === String(studentId));
        initialMap[studentId] = {
          score: found ? found.score : '',
          feedback: found ? found.feedback || '' : '',
          isGraded: !!found,
        };
      });
      setGradesMap(initialMap);
    } catch (err) {
      console.error('Failed to load assignment grades:', err);
    }
  };

  const handleSelectSession = (sessId) => {
    setSelectedSessionId(sessId);
    if (selectedCohort?._id) {
      loadSessionAttendance(selectedCohort._id, sessId);
    }
  };

  const handleSelectAssignment = (assignId) => {
    setSelectedAssignmentId(assignId);
    loadAssignmentGrades(assignId);
  };

  // Attendance actions
  const handleSetStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), status },
    }));
  };

  const handleSetStudentNotes = (studentId, notes) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), notes },
    }));
  };

  const handleMarkAllPresent = () => {
    const updated = { ...attendanceMap };
    Object.keys(updated).forEach((id) => {
      updated[id] = { ...updated[id], status: ATTENDANCE_STATUS.PRESENT };
    });
    setAttendanceMap(updated);
  };

  const handleSaveAttendance = async () => {
    if (!selectedCohort || !selectedSessionId) return;

    setSavingAttendance(true);
    setSuccessMsg('');
    setError('');
    try {
      const records = Object.entries(attendanceMap).map(([studentId, val]) => ({
        studentId,
        status: val.status || ATTENDANCE_STATUS.PRESENT,
        notes: val.notes || '',
      }));

      await cohortService.recordAttendance(selectedCohort._id, {
        sessionId: selectedSessionId,
        attendanceRecords: records,
      });

      setSuccessMsg('Session attendance recorded and verified successfully!');
      loadSessionAttendance(selectedCohort._id, selectedSessionId);
    } catch (err) {
      setError(err.message || 'Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Grading actions
  const handleSetScore = (studentId, score) => {
    setGradesMap((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), score },
    }));
  };

  const handleSetFeedback = (studentId, feedback) => {
    setGradesMap((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), feedback },
    }));
  };

  const handleSaveGrades = async () => {
    if (!selectedAssignmentId) return;

    setSavingGrades(true);
    setSuccessMsg('');
    setError('');
    try {
      const grades = Object.entries(gradesMap)
        .filter(([_, val]) => val.score !== '' && val.score !== null)
        .map(([studentId, val]) => ({
          studentId,
          score: Number(val.score),
          feedback: val.feedback || '',
        }));

      if (grades.length === 0) {
        setError('Please enter at least one student score before saving');
        setSavingGrades(false);
        return;
      }

      await cohortService.recordGrades(selectedAssignmentId, { grades });
      setSuccessMsg('Assignment grades and feedback recorded successfully!');
      loadAssignmentGrades(selectedAssignmentId);
    } catch (err) {
      setError(err.message || 'Failed to save grades');
    } finally {
      setSavingGrades(false);
    }
  };

  // Create Assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!selectedCohort) return;

    setCreatingAssign(true);
    setError('');
    try {
      await cohortService.createInstructorAssignment(selectedCohort._id, newAssignForm);
      setSuccessMsg(`Assignment "${newAssignForm.title}" created successfully!`);
      setShowNewAssignment(false);
      setNewAssignForm({ title: '', description: '', dueDate: '', maxScore: 100 });
      loadCohortWorkspace(selectedCohort._id);
    } catch (err) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setCreatingAssign(false);
    }
  };

  // Start Session (Live monitoring integration)
  const handleStartSession = async (sessId) => {
    if (!selectedCohort?._id || !sessId) return;
    setSessionActionLoading(true);
    setError('');
    try {
      await cohortService.startSession(selectedCohort._id, sessId);
      setSuccessMsg('Session officially started! Live status is now visible to academy administration.');
      await loadCohortWorkspace(selectedCohort._id);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to start session');
    } finally {
      setSessionActionLoading(false);
    }
  };

  // End Session (Calculates actual duration & completes)
  const handleEndSession = async (sessId) => {
    if (!selectedCohort?._id || !sessId) return;
    setSessionActionLoading(true);
    setError('');
    try {
      await cohortService.endSession(selectedCohort._id, sessId);
      setSuccessMsg('Session successfully concluded. Actual delivery duration has been recorded.');
      await loadCohortWorkspace(selectedCohort._id);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to end session');
    } finally {
      setSessionActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading instructor cohorts and assigned runs..." />;
  }

  if (error && cohorts.length === 0) {
    return <ErrorState message={error} onRetry={fetchInstructorCohorts} />;
  }

  if (cohorts.length === 0) {
    return (
      <div className={styles.container}>
        <PageHeader
          title="Instructor Training Delivery Portal"
          subtitle="Manage class attendance, scheduled sessions, and student project grades."
        />
        <EmptyState
          title="No Assigned Cohorts"
          message="You are not currently assigned to any scheduled training cohorts. Contact your division administrator to be assigned to an active cohort."
        />
      </div>
    );
  }

  const activeSession = cohortData?.cohort?.sessions?.find((s) => String(s._id) === String(selectedSessionId));
  const activeAssignment = cohortData?.assignments?.find((a) => String(a._id) === String(selectedAssignmentId));

  return (
    <div className={styles.container}>
      <PageHeader
        title="Instructor Training Delivery Portal"
        subtitle={`Welcome, ${user.fullName}. Manage your training cohorts, mark session attendance, and record project grades.`}
      />

      {successMsg && (
        <div className="alert alert-success alert-dismissible fade show py-2 px-3 mb-0" role="alert">
          <i className="fa-solid fa-circle-check me-2"></i>
          {successMsg}
          <button
            type="button"
            className="btn-close"
            style={{ padding: '0.75rem' }}
            onClick={() => setSuccessMsg('')}
            aria-label="Close"
          ></button>
        </div>
      )}

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-0" role="alert">
          <i className="fa-solid fa-triangle-exclamation me-2"></i>
          {error}
        </div>
      )}

      {/* COHORT CARDS SELECTOR */}
      <div>
        <h5 className="fw-semibold text-dark mb-3">Your Assigned Training Cohorts ({cohorts.length})</h5>
        <div className={styles.cohortCardGrid}>
          {cohorts.map((c) => {
            const isSelected = selectedCohort?._id === c._id;
            return (
              <div
                key={c._id}
                className={`${styles.cohortCard} ${isSelected ? styles.cohortCardActive : ''}`}
                onClick={() => setSelectedCohort(c)}
                id={`cohort-card-${c._id}`}
              >
                <div>
                  <div className={styles.cardHeader}>
                    <span className={styles.cohortNum}>{c.cohortNumber}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className={styles.cohortTitle}>{c.name}</div>
                  <div className="text-muted small mb-2">{c.program?.title}</div>
                </div>

                <div>
                  <div className={styles.detailRow}>
                    <span>Confirmed Students</span>
                    <span className="fw-bold text-dark">{c.enrolledCount || 0} students</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Schedule</span>
                    <span>{new Date(c.startDate).toLocaleDateString()} &rarr; {new Date(c.endDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* WORKSPACE AREA FOR SELECTED COHORT */}
      {selectedCohort && (
        <div className={styles.workspaceCard}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h4 className="fw-bold text-dark mb-1">
                {selectedCohort.name} <span className="text-muted fs-6">({selectedCohort.cohortNumber})</span>
              </h4>
              <span className="badge bg-light text-secondary border">
                {selectedCohort.program?.title} &middot; {cohortData?.roster?.length || 0} Confirmed Students
              </span>
            </div>
          </div>

          {/* TABS */}
          <div className={styles.tabNav}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'attendance' ? styles.activeTabBtn : ''}`}
              onClick={() => setActiveTab('attendance')}
              id="instructor-tab-attendance"
            >
              <i className="fa-regular fa-calendar-check me-2"></i> Session Attendance
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'grading' ? styles.activeTabBtn : ''}`}
              onClick={() => setActiveTab('grading')}
              id="instructor-tab-grading"
            >
              <i className="fa-solid fa-file-pen me-2"></i> Deliverables & Grading
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'roster' ? styles.activeTabBtn : ''}`}
              onClick={() => setActiveTab('roster')}
              id="instructor-tab-roster"
            >
              <i className="fa-solid fa-users me-2"></i> Student Roster
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'evaluations' ? styles.activeTabBtn : ''}`}
              onClick={() => {
                setActiveTab('evaluations');
                loadInstructorEvaluations(selectedCohort._id);
              }}
              id="instructor-tab-evaluations"
            >
              <i className="fa-solid fa-award me-2"></i> Evaluated Outcomes
            </button>
          </div>

          {/* TAB 1: ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-semibold text-dark small">Select Session:</span>
                <button
                  type="button"
                  className="btn btn-outline-success btn-sm"
                  onClick={handleMarkAllPresent}
                  id="btn-mark-all-present"
                >
                  <i className="fa-solid fa-check-double me-1"></i> Mark All Present
                </button>
              </div>

              {/* SESSIONS BAR */}
              <div className={styles.sessionSelectorBar}>
                {cohortData?.cohort?.sessions?.map((sess) => {
                  const isSel = String(sess._id) === String(selectedSessionId);
                  return (
                    <button
                      key={sess._id}
                      type="button"
                      className={`${styles.sessionBtn} ${isSel ? styles.activeSessionBtn : ''}`}
                      onClick={() => handleSelectSession(sess._id)}
                      id={`session-btn-${sess.sessionNumber}`}
                    >
                      <i className="fa-regular fa-calendar me-1"></i>
                      Session {sess.sessionNumber} ({new Date(sess.date).toLocaleDateString()})
                    </button>
                  );
                })}
              </div>

              {activeSession && (
                <div className="alert alert-light border py-2 px-3 mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-bold text-dark">Session #{activeSession.sessionNumber}:</span>
                      <span className="text-secondary">{activeSession.topic || activeSession.title}</span>
                      <StatusBadge status={activeSession.status || SESSION_STATUS.SCHEDULED} />
                    </div>
                    <div className="text-muted small mt-1">
                      <span>{activeSession.durationMinutes || 0} mins (scheduled)</span>
                      {activeSession.actualDurationMinutes && (
                        <span className="text-success fw-bold ms-2">
                          &middot; {activeSession.actualDurationMinutes} mins actual
                        </span>
                      )}
                      {activeSession.location && (
                        <span className="ms-2">&middot; {activeSession.location}</span>
                      )}
                      {activeSession.deliveryMode === 'ONLINE' && activeSession.meetingUrl && (
                        <a
                          href={activeSession.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ms-2 text-primary"
                        >
                          <i className="fa-solid fa-video me-1"></i> Meeting Link
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    {(!activeSession.status || activeSession.status === SESSION_STATUS.SCHEDULED) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-success d-inline-flex align-items-center gap-1"
                        onClick={() => handleStartSession(activeSession._id)}
                        disabled={sessionActionLoading}
                        id={`btn-start-session-${activeSession.sessionNumber}`}
                      >
                        <i className={`fa-solid ${sessionActionLoading ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                        Start Session
                      </button>
                    )}

                    {activeSession.status === SESSION_STATUS.IN_PROGRESS && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger d-inline-flex align-items-center gap-1"
                        onClick={() => handleEndSession(activeSession._id)}
                        disabled={sessionActionLoading}
                        id={`btn-end-session-${activeSession.sessionNumber}`}
                      >
                        <i className={`fa-solid ${sessionActionLoading ? 'fa-spinner fa-spin' : 'fa-stop'}`}></i>
                        End Session
                      </button>
                    )}

                    {activeSession.status === SESSION_STATUS.COMPLETED && (
                      <span className="badge bg-success-subtle text-success border border-success-subtle py-1 px-2">
                        <i className="fa-solid fa-circle-check me-1"></i> Session Completed
                      </span>
                    )}
                  </div>
                </div>
              )}

              {cohortData?.roster?.length === 0 ? (
                <EmptyState
                  title="No Confirmed Enrollees"
                  message="There are no confirmed students in this cohort yet to take attendance."
                />
              ) : (
                <div className="table-responsive border rounded">
                  <table className={`table ${styles.attendanceTable}`}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Remarks / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortData?.roster?.map((r) => {
                        const studentId = r.student?._id;
                        const current = attendanceMap[studentId] || { status: ATTENDANCE_STATUS.PRESENT, notes: '' };
                        return (
                          <tr key={studentId}>
                            <td className="fw-semibold text-dark">{r.student?.fullName}</td>
                            <td className="text-muted small">{r.student?.email}</td>
                            <td>
                              <div className={styles.quickSelectGroup}>
                                <button
                                  type="button"
                                  className={`${styles.quickBtn} ${current.status === ATTENDANCE_STATUS.PRESENT ? styles.quickBtnPresentActive : ''}`}
                                  onClick={() => handleSetStudentStatus(studentId, ATTENDANCE_STATUS.PRESENT)}
                                  id={`attend-${studentId}-PRESENT`}
                                >
                                  Present
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.quickBtn} ${current.status === ATTENDANCE_STATUS.LATE ? styles.quickBtnLateActive : ''}`}
                                  onClick={() => handleSetStudentStatus(studentId, ATTENDANCE_STATUS.LATE)}
                                  id={`attend-${studentId}-LATE`}
                                >
                                  Late
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.quickBtn} ${current.status === ATTENDANCE_STATUS.ABSENT ? styles.quickBtnAbsentActive : ''}`}
                                  onClick={() => handleSetStudentStatus(studentId, ATTENDANCE_STATUS.ABSENT)}
                                  id={`attend-${studentId}-ABSENT`}
                                >
                                  Absent
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.quickBtn} ${current.status === ATTENDANCE_STATUS.EXCUSED ? styles.quickBtnExcusedActive : ''}`}
                                  onClick={() => handleSetStudentStatus(studentId, ATTENDANCE_STATUS.EXCUSED)}
                                  id={`attend-${studentId}-EXCUSED`}
                                >
                                  Excused
                                </button>
                              </div>
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Optional notes..."
                                value={current.notes || ''}
                                onChange={(e) => handleSetStudentNotes(studentId, e.target.value)}
                                style={{ maxWidth: '280px' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="d-flex justify-content-end mt-3">
                <button
                  type="button"
                  className="btn btn-primary d-flex align-items-center gap-2"
                  onClick={handleSaveAttendance}
                  disabled={savingAttendance || cohortData?.roster?.length === 0}
                  id="btn-save-session-attendance"
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>{savingAttendance ? 'Saving Attendance...' : 'Save Session Attendance'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GRADING */}
          {activeTab === 'grading' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold text-dark small">Deliverable:</span>
                  <select
                    className="form-select form-select-sm"
                    style={{ minWidth: '240px' }}
                    value={selectedAssignmentId}
                    onChange={(e) => handleSelectAssignment(e.target.value)}
                    id="instructor-assignment-select"
                  >
                    {cohortData?.assignments?.length === 0 && <option value="">No Deliverables Created</option>}
                    {cohortData?.assignments?.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.title} (Max {a.maxScore} pts &middot; Due {new Date(a.dueDate).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => setShowNewAssignment(!showNewAssignment)}
                  id="btn-instructor-add-assignment"
                >
                  <i className="fa-solid fa-plus me-1"></i> New Deliverable
                </button>
              </div>

              {/* CREATE ASSIGNMENT FORM */}
              {showNewAssignment && (
                <form onSubmit={handleCreateAssignment} className="p-3 bg-light rounded border mb-3">
                  <div className="fw-semibold text-dark mb-2 small">Create New Graded Deliverable</div>
                  <div className="row g-2 mb-2">
                    <div className="col-md-6">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Deliverable Title (e.g. Orbital Propagation Script)"
                        value={newAssignForm.title}
                        onChange={(e) => setNewAssignForm((p) => ({ ...p, title: e.target.value }))}
                        required
                        id="new-assignment-title"
                      />
                    </div>
                    <div className="col-md-3">
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={newAssignForm.dueDate}
                        onChange={(e) => setNewAssignForm((p) => ({ ...p, dueDate: e.target.value }))}
                        required
                        id="new-assignment-date"
                      />
                    </div>
                    <div className="col-md-3">
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        placeholder="Max Score"
                        value={newAssignForm.maxScore}
                        onChange={(e) => setNewAssignForm((p) => ({ ...p, maxScore: e.target.value }))}
                        min="1"
                        required
                        id="new-assignment-maxscore"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      placeholder="Instructions, guidelines, rubric..."
                      value={newAssignForm.description}
                      onChange={(e) => setNewAssignForm((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowNewAssignment(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={creatingAssign}
                      id="btn-confirm-create-assignment"
                    >
                      {creatingAssign ? 'Creating...' : 'Create Deliverable'}
                    </button>
                  </div>
                </form>
              )}

              {/* GRADING SHEET */}
              {!activeAssignment ? (
                <EmptyState
                  title="No Deliverables"
                  message="Click 'New Deliverable' to define an assignment, laboratory project, or flight simulation exam."
                />
              ) : cohortData?.roster?.length === 0 ? (
                <EmptyState
                  title="No Enrolled Students"
                  message="There are no confirmed students in this cohort to grade."
                />
              ) : (
                <div>
                  <div className="table-responsive border rounded">
                    <table className={`table ${styles.attendanceTable}`}>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Email</th>
                          <th style={{ width: '130px' }}>Score (Max {activeAssignment.maxScore})</th>
                          <th>Instructor Feedback & Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohortData?.roster?.map((r) => {
                          const studentId = r.student?._id;
                          const current = gradesMap[studentId] || { score: '', feedback: '' };
                          return (
                            <tr key={studentId}>
                              <td className="fw-semibold text-dark">{r.student?.fullName}</td>
                              <td className="text-muted small">{r.student?.email}</td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  min="0"
                                  max={activeAssignment.maxScore}
                                  placeholder="0"
                                  value={current.score}
                                  onChange={(e) => handleSetScore(studentId, e.target.value)}
                                  id={`grade-score-${studentId}`}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="Feedback for student..."
                                  value={current.feedback || ''}
                                  onChange={(e) => handleSetFeedback(studentId, e.target.value)}
                                  id={`grade-feedback-${studentId}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="d-flex justify-content-end mt-3">
                    <button
                      type="button"
                      className="btn btn-success d-flex align-items-center gap-2"
                      onClick={handleSaveGrades}
                      disabled={savingGrades}
                      id="btn-save-assignment-grades"
                    >
                      <i className="fa-solid fa-check"></i>
                      <span>{savingGrades ? 'Saving Grades...' : 'Save Deliverable Grades'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ROSTER */}
          {activeTab === 'roster' && (
            <div className="table-responsive border rounded">
              <table className={`table ${styles.attendanceTable}`}>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Email</th>
                    <th>Application Number</th>
                    <th>Confirmation Date</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortData?.roster?.map((r) => (
                    <tr key={r.enrollmentId}>
                      <td className="fw-semibold text-dark">{r.student?.fullName}</td>
                      <td>{r.student?.email}</td>
                      <td className="font-monospace small">{r.application?.applicationNumber || '—'}</td>
                      <td>{r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: EVALUATED OUTCOMES (READ-ONLY FOR INSTRUCTOR) */}
          {activeTab === 'evaluations' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <span className="fw-semibold text-dark small">Official Cohort Learning Outcomes</span>
                  <div className="text-muted small">
                    Evaluated and certified by Division Administration. Read-only view for assigned instructors.
                  </div>
                </div>
                <span className="badge bg-light text-secondary border font-monospace small">
                  Gate: &ge;80% Attendance | Pass: &ge;60% Score
                </span>
              </div>

              {evaluationsLoading ? (
                <LoadingState message="Loading certified learning outcomes..." />
              ) : evaluationsError ? (
                <ErrorState message={evaluationsError} onRetry={() => loadInstructorEvaluations(selectedCohort._id)} />
              ) : !evaluationsData?.evaluations || evaluationsData.evaluations.length === 0 ? (
                <EmptyState
                  title="No Certified Outcomes Yet"
                  message="Official learning outcomes have not yet been evaluated for this cohort. Once your division administrator runs the cohort evaluation, certified outcomes will appear here."
                />
              ) : (
                <div className="table-responsive border rounded">
                  <table className={`table ${styles.attendanceTable}`}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Attendance Rate</th>
                        <th>Average Score</th>
                        <th>Attendance Gate</th>
                        <th>Outcome</th>
                        <th>Determination Reason</th>
                        <th>Evaluated Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluationsData.evaluations.map((ev) => (
                        <tr key={ev._id}>
                          <td>
                            <div className="fw-semibold text-dark">{ev.student?.fullName}</div>
                            <div className="text-muted small">{ev.student?.email}</div>
                          </td>
                          <td>
                            <span className={`fw-bold ${ev.attendanceThresholdMet ? 'text-success' : 'text-danger'}`}>
                              {ev.attendanceRate}%
                            </span>
                          </td>
                          <td>
                            <span className={`fw-bold ${ev.averageScore >= 60 ? 'text-success' : 'text-danger'}`}>
                              {ev.averageScore}%
                            </span>
                          </td>
                          <td>
                            {ev.attendanceThresholdMet ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: '0.72rem' }}>
                                <i className="fa-solid fa-check me-1"></i> Met (&ge;80%)
                              </span>
                            ) : (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: '0.72rem' }}>
                                <i className="fa-solid fa-xmark me-1"></i> Below 80%
                              </span>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={ev.outcome} />
                          </td>
                          <td className="small text-secondary" style={{ maxWidth: '280px' }}>
                            {ev.outcomeReason}
                          </td>
                          <td className="small text-muted">
                            {new Date(ev.evaluatedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
