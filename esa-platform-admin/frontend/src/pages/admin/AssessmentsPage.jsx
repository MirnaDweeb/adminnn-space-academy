import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import SearchBar from '../../components/common/SearchBar';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import adminService from '../../services/api/adminService';
import apiClient from '../../services/api/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { DIVISIONS, DIVISION_LABELS } from '../../constants/divisions';
import styles from './AssessmentsPage.module.css';

const QUESTION_TYPES = [
  { value: 'SINGLE_CHOICE', label: 'Single Choice' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'RATING', label: 'Rating (1 - 5)' },
];

export default function AssessmentsPage() {
  const { division } = useParams();
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');

  // Modals state: Builder
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [builderForm, setBuilderForm] = useState({
    programId: '',
    title: '',
    description: '',
    instructions: 'Please answer all questions honestly to help us understand your background.',
    timeLimitMinutes: 30,
    thresholds: {
      recommended: 80,
      foundation: 60,
      manualReview: 40,
    },
    questions: [
      {
        questionText: 'Do you have prior experience with space engineering or orbital mechanics?',
        questionType: 'SINGLE_CHOICE',
        options: ['Extensive Experience', 'Basic Knowledge', 'Beginner / No Experience'],
        correctAnswer: 'Basic Knowledge',
        weight: 1,
      },
    ],
  });
  const [builderError, setBuilderError] = useState('');
  const [builderLoading, setBuilderLoading] = useState(false);

  // Modals state: Attempts Viewer
  const [isAttemptsOpen, setIsAttemptsOpen] = useState(false);
  const [viewingAssessment, setViewingAssessment] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // Confirmation toggle
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Fetch assessments and programs
  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const scopeDiv = division || (user?.role === ROLES.SUPER_ADMIN ? 'all' : user?.division);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== '') params.isActive = statusFilter;
      if (programFilter && programFilter !== 'all') params.programId = programFilter;

      const res = await adminService.listAssessments(scopeDiv, params);
      setAssessments(res.data?.assessments || []);
    } catch (err) {
      setError(err.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }, [division, user, search, statusFilter, programFilter]);

  const fetchPrograms = useCallback(async () => {
    try {
      const scopeDiv = division || (user?.role === ROLES.SUPER_ADMIN ? '' : user?.division);
      const res = await apiClient.get('/programs', {
        params: { limit: 100, division: scopeDiv },
      });
      setPrograms(res.data?.data?.programs || []);
    } catch (e) {
      // Non-blocking
    }
  }, [division, user]);

  useEffect(() => {
    fetchAssessments();
    fetchPrograms();
  }, [fetchAssessments, fetchPrograms]);

  // Question Builders helpers
  const addQuestion = () => {
    setBuilderForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionText: '',
          questionType: 'SINGLE_CHOICE',
          options: ['Option 1', 'Option 2'],
          correctAnswer: 'Option 1',
          weight: 1,
        },
      ],
    }));
  };

  const removeQuestion = (idx) => {
    if (builderForm.questions.length <= 1) {
      alert('Assessment must have at least one question');
      return;
    }
    setBuilderForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const updateQuestion = (idx, field, value) => {
    setBuilderForm((prev) => {
      const updated = [...prev.questions];
      const q = { ...updated[idx], [field]: value };

      // Adjust defaults when type changes
      if (field === 'questionType') {
        if (value === 'TRUE_FALSE') {
          q.options = ['True', 'False'];
          q.correctAnswer = 'True';
        } else if (value === 'RATING') {
          q.options = ['1', '2', '3', '4', '5'];
          q.correctAnswer = '4';
        } else if (!q.options || q.options.length === 0) {
          q.options = ['Option A', 'Option B'];
          q.correctAnswer = 'Option A';
        }
      }

      updated[idx] = q;
      return { ...prev, questions: updated };
    });
  };

  const addOption = (qIdx) => {
    setBuilderForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIdx];
      const opts = [...(q.options || []), `Option ${q.options.length + 1}`];
      updated[qIdx] = { ...q, options: opts };
      return { ...prev, questions: updated };
    });
  };

  const updateOption = (qIdx, optIdx, val) => {
    setBuilderForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIdx];
      const opts = [...q.options];
      const oldVal = opts[optIdx];
      opts[optIdx] = val;
      const isCurrentAnswer = q.correctAnswer === oldVal;
      updated[qIdx] = {
        ...q,
        options: opts,
        correctAnswer: isCurrentAnswer ? val : q.correctAnswer,
      };
      return { ...prev, questions: updated };
    });
  };

  const removeOption = (qIdx, optIdx) => {
    setBuilderForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIdx];
      if (q.options.length <= 2) {
        alert('Choice questions must have at least 2 options');
        return prev;
      }
      const opts = q.options.filter((_, i) => i !== optIdx);
      updated[qIdx] = {
        ...q,
        options: opts,
        correctAnswer: opts[0] || '',
      };
      return { ...prev, questions: updated };
    });
  };

  // Open Create Builder
  const handleOpenCreate = () => {
    setEditingAssessmentId(null);
    setBuilderError('');
    setBuilderForm({
      programId: programs[0]?._id || '',
      title: '',
      description: '',
      instructions: 'Please answer all questions before submitting your assessment.',
      timeLimitMinutes: 30,
      thresholds: { recommended: 80, foundation: 60, manualReview: 40 },
      questions: [
        {
          questionText: 'Do you have prior experience with space engineering concepts?',
          questionType: 'SINGLE_CHOICE',
          options: ['Extensive Experience', 'Basic Knowledge', 'Beginner / No Experience'],
          correctAnswer: 'Basic Knowledge',
          weight: 1,
        },
      ],
    });
    setIsBuilderOpen(true);
  };

  // Open Edit Builder
  const handleOpenEdit = (assessment) => {
    setEditingAssessmentId(assessment._id);
    setBuilderError('');
    setBuilderForm({
      programId: assessment.program?._id || assessment.program,
      title: assessment.title || '',
      description: assessment.description || '',
      instructions: assessment.instructions || '',
      timeLimitMinutes: assessment.timeLimitMinutes || 30,
      thresholds: assessment.thresholds || { recommended: 80, foundation: 60, manualReview: 40 },
      questions: assessment.questions?.map((q) => ({
        questionText: q.questionText,
        questionType: q.questionType || 'SINGLE_CHOICE',
        options: q.options || [],
        correctAnswer: q.correctAnswer || (q.options ? q.options[0] : ''),
        weight: q.weight || 1,
      })) || [],
    });
    setIsBuilderOpen(true);
  };

  // Submit Builder (Create or Update)
  const handleBuilderSubmit = async (e) => {
    e.preventDefault();
    setBuilderError('');

    if (!builderForm.title.trim()) {
      setBuilderError('Assessment title is required');
      return;
    }
    if (!builderForm.programId) {
      setBuilderError('Please select a program for this assessment');
      return;
    }
    for (let i = 0; i < builderForm.questions.length; i++) {
      const q = builderForm.questions[i];
      if (!q.questionText.trim()) {
        setBuilderError(`Question #${i + 1} text cannot be empty`);
        return;
      }
      if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
        setBuilderError(`Question #${i + 1} must have a designated correct answer`);
        return;
      }
    }

    setBuilderLoading(true);
    try {
      if (editingAssessmentId) {
        await adminService.updateAssessment(editingAssessmentId, builderForm);
      } else {
        await adminService.createAssessment(builderForm);
      }
      setIsBuilderOpen(false);
      fetchAssessments();
    } catch (err) {
      setBuilderError(err.message || 'Failed to save assessment');
    } finally {
      setBuilderLoading(false);
    }
  };

  // Toggle Status
  const handleToggleStatus = async () => {
    if (!confirmToggle) return;
    setToggleLoading(true);
    try {
      await adminService.toggleAssessmentStatus(confirmToggle._id, !confirmToggle.isActive);
      setConfirmToggle(null);
      fetchAssessments();
    } catch (err) {
      alert(err.message || 'Failed to update assessment status');
    } finally {
      setToggleLoading(false);
    }
  };

  // View Attempts
  const handleOpenAttempts = async (assessment) => {
    setViewingAssessment(assessment);
    setIsAttemptsOpen(true);
    setAttemptsLoading(true);
    try {
      const res = await adminService.listAssessmentAttempts(assessment._id);
      setAttempts(res.attempts || []);
    } catch (err) {
      setAttempts([]);
    } finally {
      setAttemptsLoading(false);
    }
  };

  const getResultBadgeClass = (res) => {
    if (res === 'RECOMMENDED') return styles.resultRecommended;
    if (res === 'FOUNDATION_RECOMMENDED') return styles.resultFoundation;
    if (res === 'MANUAL_REVIEW') return styles.resultManual;
    return styles.resultNotRecommended;
  };

  const columns = [
    {
      key: 'title',
      label: 'Assessment Title',
      render: (row) => (
        <div>
          <div className="fw-semibold text-primary">{row.title}</div>
          <div className="text-secondary small">{row.program?.title || 'Program Assessment'}</div>
        </div>
      ),
    },
    {
      key: 'division',
      label: 'Division',
      render: (row) => (
        <span className="badge bg-light text-dark border">
          {DIVISION_LABELS[row.division] || row.division}
        </span>
      ),
    },
    {
      key: 'questions',
      label: 'Questions',
      render: (row) => (
        <span className="badge bg-secondary-subtle text-secondary">
          <i className="fa-solid fa-list-check me-1"></i>{row.questions?.length || 0} Questions
        </span>
      ),
    },
    {
      key: 'thresholds',
      label: 'Pass Thresholds',
      render: (row) => (
        <span className="small text-secondary">
          Rec: <strong>{row.thresholds?.recommended}%</strong> | Fnd: <strong>{row.thresholds?.foundation}%</strong>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="d-flex gap-1 justify-content-end">
          <button
            type="button"
            className="btn btn-sm btn-outline-info"
            onClick={() => handleOpenAttempts(row)}
            title="View Student Attempts & Results"
          >
            <i className="fa-solid fa-chart-simple me-1"></i>Attempts
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => handleOpenEdit(row)}
            title="Edit Assessment"
          >
            <i className="fa-solid fa-pen-to-square me-1"></i>Edit
          </button>
          <button
            type="button"
            className={`btn btn-sm ${row.isActive ? 'btn-outline-warning' : 'btn-outline-success'}`}
            onClick={() => setConfirmToggle(row)}
            title={row.isActive ? 'Deactivate Assessment' : 'Activate Assessment'}
          >
            <i className={`fa-solid ${row.isActive ? 'fa-pause' : 'fa-play'} me-1`}></i>
            {row.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title="Program Readiness & Admission Assessments"
        subtitle="Build candidate evaluation assessments to assess student suitability. Results serve as decision support alongside human admission reviews."
        actions={
          <button type="button" className="btn btn-primary" onClick={handleOpenCreate}>
            <i className="fa-solid fa-plus me-1" aria-hidden="true"></i>
            Create Assessment
          </button>
        }
      />

      {/* Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.searchWrap}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search assessments..." />
        </div>
        <div className={styles.filterGroup}>
          <FilterBar
            filters={[
              {
                name: 'status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: '', label: 'All Statuses' },
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Inactive' },
                ],
              },
            ]}
          />
        </div>
      </div>

      {loading && !assessments.length ? (
        <LoadingState message="Loading assessments..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAssessments} />
      ) : (
        <DataTable columns={columns} rows={assessments} emptyTitle="No assessments created yet" />
      )}

      {/* BUILDER MODAL */}
      <Modal
        isOpen={isBuilderOpen}
        onClose={() => !builderLoading && setIsBuilderOpen(false)}
        title={editingAssessmentId ? 'Edit Assessment' : 'Create Program Assessment'}
        subtitle="Define evaluation questions, scoring weights, and recommendation thresholds."
        size="xl"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setIsBuilderOpen(false)}
              disabled={builderLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBuilderSubmit}
              disabled={builderLoading}
            >
              {builderLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Saving...
                </>
              ) : (
                'Save Assessment'
              )}
            </button>
          </>
        }
      >
        {builderError && <div className="alert alert-danger py-2 mb-3">{builderError}</div>}
        <form onSubmit={handleBuilderSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Associated Program <span className="text-danger">*</span>
              </label>
              <select
                className="form-select"
                value={builderForm.programId}
                onChange={(e) => setBuilderForm((prev) => ({ ...prev, programId: e.target.value }))}
                required
                disabled={!!editingAssessmentId}
              >
                <option value="">Select a Program...</option>
                {programs.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title} ({p.division})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Assessment Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Space Robotics Readiness Exam"
                value={builderForm.title}
                onChange={(e) => setBuilderForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-md-8">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Instructions for Candidate
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Read each scenario carefully. You have 30 minutes to complete."
                value={builderForm.instructions}
                onChange={(e) => setBuilderForm((prev) => ({ ...prev, instructions: e.target.value }))}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
                Time Limit (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="180"
                className="form-control"
                value={builderForm.timeLimitMinutes}
                onChange={(e) => setBuilderForm((prev) => ({ ...prev, timeLimitMinutes: e.target.value }))}
              />
            </div>
          </div>

          {/* Thresholds */}
          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.85rem' }}>
              Decision Support Score Thresholds (%)
            </label>
            <div className={styles.thresholdGrid}>
              <div>
                <label className="small text-success fw-bold">Recommended (Direct)</label>
                <div className="input-group input-group-sm mt-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-control"
                    value={builderForm.thresholds.recommended}
                    onChange={(e) =>
                      setBuilderForm((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, recommended: Number(e.target.value) },
                      }))
                    }
                  />
                  <span className="input-group-text">%</span>
                </div>
                <div className="small text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                  Candidate demonstrates high readiness.
                </div>
              </div>
              <div>
                <label className="small text-primary fw-bold">Foundation Recommended</label>
                <div className="input-group input-group-sm mt-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-control"
                    value={builderForm.thresholds.foundation}
                    onChange={(e) =>
                      setBuilderForm((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, foundation: Number(e.target.value) },
                      }))
                    }
                  />
                  <span className="input-group-text">%</span>
                </div>
                <div className="small text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                  Recommends preparatory foundation module.
                </div>
              </div>
              <div>
                <label className="small text-warning fw-bold">Manual Review</label>
                <div className="input-group input-group-sm mt-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-control"
                    value={builderForm.thresholds.manualReview}
                    onChange={(e) =>
                      setBuilderForm((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, manualReview: Number(e.target.value) },
                      }))
                    }
                  />
                  <span className="input-group-text">%</span>
                </div>
                <div className="small text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                  Requires human interview or portfolio check.
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Questions Builder */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0 text-navy">
              Assessment Questions ({builderForm.questions.length})
            </h6>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addQuestion}>
              <i className="fa-solid fa-plus me-1"></i>Add Question
            </button>
          </div>

          {builderForm.questions.map((q, qIdx) => (
            <div key={qIdx} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionBadge}>Question #{qIdx + 1}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={() => removeQuestion(qIdx)}
                >
                  <i className="fa-solid fa-trash-can"></i>
                </button>
              </div>

              <div className="row g-2 mb-2">
                <div className="col-md-8">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Enter question text..."
                    value={q.questionText}
                    onChange={(e) => updateQuestion(qIdx, 'questionText', e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={q.questionType}
                    onChange={(e) => updateQuestion(qIdx, 'questionType', e.target.value)}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-1">
                  <input
                    type="number"
                    min="1"
                    className="form-control form-control-sm"
                    title="Weight / Points"
                    value={q.weight}
                    onChange={(e) => updateQuestion(qIdx, 'weight', Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Options */}
              {(q.questionType === 'SINGLE_CHOICE' || q.questionType === 'MULTIPLE_CHOICE') && (
                <div className={styles.optionsList}>
                  <div className="small fw-semibold text-secondary">
                    Options (Select the radio to set the correct answer):
                  </div>
                  {q.options?.map((opt, optIdx) => (
                    <div key={optIdx} className={styles.optionRow}>
                      <input
                        type="radio"
                        name={`correct_q_${qIdx}`}
                        checked={q.correctAnswer === opt}
                        onChange={() => updateQuestion(qIdx, 'correctAnswer', opt)}
                        title="Mark as correct answer"
                      />
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={opt}
                        onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0"
                        onClick={() => removeOption(qIdx, optIdx)}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-decoration-none p-0 align-self-start"
                    onClick={() => addOption(qIdx)}
                  >
                    <i className="fa-solid fa-plus me-1"></i>Add Option
                  </button>
                </div>
              )}

              {q.questionType === 'TRUE_FALSE' && (
                <div className="d-flex gap-3 align-items-center mt-2 small">
                  <span className="fw-semibold">Correct Answer:</span>
                  <label className="form-check-label d-flex align-items-center gap-1">
                    <input
                      type="radio"
                      name={`tf_${qIdx}`}
                      checked={q.correctAnswer === 'True'}
                      onChange={() => updateQuestion(qIdx, 'correctAnswer', 'True')}
                    />
                    True
                  </label>
                  <label className="form-check-label d-flex align-items-center gap-1">
                    <input
                      type="radio"
                      name={`tf_${qIdx}`}
                      checked={q.correctAnswer === 'False'}
                      onChange={() => updateQuestion(qIdx, 'correctAnswer', 'False')}
                    />
                    False
                  </label>
                </div>
              )}

              {q.questionType === 'RATING' && (
                <div className="d-flex gap-2 align-items-center mt-2 small">
                  <span className="fw-semibold">Expected Readiness Rating:</span>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <label key={val} className="d-flex align-items-center gap-1">
                      <input
                        type="radio"
                        name={`rating_${qIdx}`}
                        checked={String(q.correctAnswer) === String(val)}
                        onChange={() => updateQuestion(qIdx, 'correctAnswer', String(val))}
                      />
                      {val}★
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </form>
      </Modal>

      {/* CONFIRM STATUS TOGGLE */}
      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={handleToggleStatus}
        title={confirmToggle?.isActive ? 'Deactivate Assessment' : 'Activate Assessment'}
        confirmText={confirmToggle?.isActive ? 'Disable Assessment' : 'Enable Assessment'}
        confirmTone={confirmToggle?.isActive ? 'warning' : 'success'}
        icon={confirmToggle?.isActive ? 'fa-pause' : 'fa-play'}
        loading={toggleLoading}
        message={
          confirmToggle?.isActive ? (
            <>
              Deactivate assessment <strong>{confirmToggle?.title}</strong>? Candidates will no longer be able to submit attempts until re-enabled.
            </>
          ) : (
            <>
              Activate assessment <strong>{confirmToggle?.title}</strong> for student evaluation?
            </>
          )
        }
      />

      {/* ATTEMPTS VIEWER MODAL */}
      <Modal
        isOpen={isAttemptsOpen}
        onClose={() => setIsAttemptsOpen(false)}
        title={`Student Attempts: ${viewingAssessment?.title || ''}`}
        subtitle="Decision-support scoring records submitted by candidates."
        size="lg"
        footer={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsAttemptsOpen(false)}>
            Close
          </button>
        }
      >
        {attemptsLoading ? (
          <LoadingState message="Loading student attempts..." />
        ) : attempts.length === 0 ? (
          <div className="text-center py-4 text-secondary">
            <i className="fa-solid fa-clipboard-question display-6 mb-2"></i>
            <div>No student attempts recorded for this assessment yet.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className={styles.attemptsTable}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Recommendation Result</th>
                  <th>Time Taken</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att) => (
                  <tr key={att._id}>
                    <td>
                      <div className="fw-semibold">{att.student?.fullName || 'Student'}</div>
                      <div className="text-secondary small">{att.student?.email}</div>
                    </td>
                    <td>
                      <div className="fw-bold fs-6">{att.score}%</div>
                      <div className="text-secondary" style={{ fontSize: '0.72rem' }}>
                        {att.totalPoints} / {att.maxPoints} pts
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.resultBadge} ${getResultBadgeClass(att.result)}`}>
                        {att.result?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{att.completionTimeMinutes} min</td>
                    <td className="small text-secondary">
                      {att.submittedAt ? new Date(att.submittedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
