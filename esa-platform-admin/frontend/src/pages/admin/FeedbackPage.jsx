import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import LoadingState from '../../components/common/LoadingState';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import adminService from '../../services/api/adminService';
import programService from '../../services/api/programService';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_TO_DIVISION, DIVISION_LABELS } from '../../constants/divisions';
import styles from './FeedbackPage.module.css';

export default function FeedbackPage() {
  const { user } = useAuth();
  const params = useParams();
  const activeDivision = params.division || ROLE_TO_DIVISION[user?.role] || 'ALL';

  // Feedback Table State
  const [feedbackList, setFeedbackList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [metrics, setMetrics] = useState({ total: 0, averageRating: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI / Thematic Summary State
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Filters
  const [ratingFilter, setRatingFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [programs, setPrograms] = useState([]);

  // Detail Modal
  const [selectedFeedback, setSelectedFeedback] = useState(null);

  // Fetch Feedback List
  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.listFeedback({
        division: activeDivision === 'ALL' ? undefined : activeDivision,
        rating: ratingFilter || undefined,
        sentiment: sentimentFilter || undefined,
        feedbackType: typeFilter || undefined,
        program: programFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: 20,
      });

      setFeedbackList(res.feedback || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      setMetrics(res.metrics || { total: 0, averageRating: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load student feedback');
    } finally {
      setLoading(false);
    }
  }, [activeDivision, ratingFilter, sentimentFilter, typeFilter, programFilter, search, page]);

  // Fetch AI/Thematic Summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const res = await adminService.getFeedbackSummary({
        division: activeDivision === 'ALL' ? undefined : activeDivision,
        program: programFilter || undefined,
      });
      setSummaryData(res.summary || null);
    } catch (err) {
      setSummaryError(err.message || 'Failed to generate feedback summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [activeDivision, programFilter]);

  // Initial & Filter Triggers
  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Load programs dropdown
  useEffect(() => {
    async function loadPrograms() {
      try {
        const query = activeDivision === 'ALL' ? {} : { division: activeDivision };
        const res = await programService.listPrograms(query);
        setPrograms(res.programs || []);
      } catch (err) {
        console.error('Failed to load programs for filter:', err);
      }
    }
    loadPrograms();
  }, [activeDivision]);

  // Render Stars
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <i
          key={i}
          className={`fa-solid fa-star ${i <= rating ? 'text-warning' : 'text-muted'}`}
          style={{ fontSize: '0.85rem' }}
        ></i>
      );
    }
    return <span className={styles.feedbackRating}>{stars}</span>;
  };

  const columns = [
    {
      header: 'Student',
      render: (item) => (
        <div>
          <div className="fw-semibold text-dark">{item.student?.fullName || 'Anonymous / Student'}</div>
          <div className="text-muted small">{item.student?.email || 'Confidential'}</div>
        </div>
      ),
    },
    {
      header: 'Program & Cohort',
      render: (item) => (
        <div>
          <div className="fw-medium text-dark">{item.program?.title || 'Academy Program'}</div>
          <div className="text-muted small">
            {item.cohort?.cohortNumber} ({item.division?.replace('_', ' ')})
          </div>
        </div>
      ),
    },
    {
      header: 'Rating & Sentiment',
      render: (item) => (
        <div>
          <div>{renderStars(item.rating)}</div>
          <span
            className={`badge mt-1 ${
              item.sentiment === 'POSITIVE'
                ? 'bg-success'
                : item.sentiment === 'NEGATIVE'
                ? 'bg-danger'
                : 'bg-secondary'
            }`}
            style={{ fontSize: '0.7rem' }}
          >
            {item.sentiment}
          </span>
        </div>
      ),
    },
    {
      header: 'Type',
      render: (item) => (
        <span className="badge bg-light text-dark border">
          {item.feedbackType?.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Comments Summary',
      render: (item) => (
        <div style={{ maxWidth: '340px' }}>
          <div className="text-truncate text-dark small">{item.comments}</div>
          {item.strengths && (
            <div className="text-success small text-truncate">
              <strong>+</strong> {item.strengths}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Date',
      render: (item) => (
        <span className="small text-secondary">
          {new Date(item.submittedAt || item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (item) => (
        <button
          type="button"
          className="btn btn-outline-primary btn-sm py-0 px-2"
          onClick={() => setSelectedFeedback(item)}
          id={`btn-view-feedback-${item._id}`}
        >
          <i className="fa-solid fa-eye me-1"></i> View
        </button>
      ),
    },
  ];

  const divisionTitle =
    activeDivision === 'ALL'
      ? 'All Divisions'
      : DIVISION_LABELS[activeDivision] || activeDivision;

  return (
    <div className={styles.container}>
      <PageHeader
        title={`${divisionTitle} Student Feedback Center`}
        subtitle="Review real student sentiment, evaluate training experience, and leverage AI-assisted feedback analytics grounded in verified submissions."
        actions={
          <button
            type="button"
            className="btn btn-outline-primary d-flex align-items-center gap-2"
            id="btn-refresh-summary"
            onClick={fetchSummary}
            disabled={summaryLoading}
          >
            <i className={`fa-solid fa-arrows-rotate ${summaryLoading ? 'fa-spin' : ''}`}></i>
            <span>Refresh Insights</span>
          </button>
        }
      />

      {/* STAT CARDS */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Feedback Responses" value={metrics.total || pagination.total} icon="fa-comments" />
        <StatCard
          label="Average Academy Rating"
          value={metrics.averageRating ? `${metrics.averageRating} / 5.0` : 'N/A'}
          icon="fa-star"
        />
        <StatCard
          label="Positive Sentiment"
          value={
            summaryData?.sentimentBreakdown
              ? `${summaryData.sentimentBreakdown.POSITIVE || 0} (${Math.round(
                  ((summaryData.sentimentBreakdown.POSITIVE || 0) / (summaryData.totalAnalyzed || 1)) * 100
                )}%)`
              : 'N/A'
          }
          icon="fa-face-smile"
        />
        <StatCard
          label="Areas for Improvement"
          value={
            summaryData?.sentimentBreakdown
              ? `${summaryData.sentimentBreakdown.NEGATIVE || 0} responses`
              : '0'
          }
          icon="fa-triangle-exclamation"
        />
      </div>

      {/* AI / SMART FEEDBACK INSIGHTS PANEL */}
      <div className={styles.insightsCard}>
        <div className={styles.insightsHeader}>
          <div className={styles.insightsTitle}>
            <i className="fa-solid fa-wand-magic-sparkles text-info"></i>
            <span>STUDENT FEEDBACK INSIGHTS</span>
            <span className={styles.insightsBadge}>
              {summaryData?.provider?.includes('GEMINI')
                ? 'Google Gemini 1.5 Flash'
                : 'ESA Thematic & Grounded NLP Engine'}
            </span>
          </div>

          <div className="d-flex align-items-center gap-2 small text-light">
            <i className="fa-solid fa-database"></i>
            <span>
              {summaryData?.totalAnalyzed || 0} real responses analyzed · Avg Rating:{' '}
              <strong>{summaryData?.averageRating || 0} / 5.0</strong>
            </span>
          </div>
        </div>

        {summaryLoading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-info mb-2" role="status"></div>
            <div className="small text-light">Synthesizing institutional student feedback...</div>
          </div>
        ) : summaryError ? (
          <div className="alert alert-danger py-2 small mb-0">{summaryError}</div>
        ) : !summaryData || summaryData.totalAnalyzed === 0 ? (
          <div className="text-center py-3 text-light small">
            No student feedback records available for automated thematic synthesis.
          </div>
        ) : (
          <div>
            {/* Executive Overview */}
            {summaryData.executiveOverview && (
              <div className="mb-3 p-2 rounded bg-white bg-opacity-10 small text-light border border-white border-opacity-10">
                <i className="fa-solid fa-circle-info me-2 text-info"></i>
                {summaryData.executiveOverview}
              </div>
            )}

            {/* Key Themes Chips */}
            {summaryData.keyThemes && summaryData.keyThemes.length > 0 && (
              <div className="mb-3">
                <div className="small text-uppercase fw-bold text-info mb-2">Key Themes Detected:</div>
                <div className={styles.themesContainer}>
                  {summaryData.keyThemes.map((theme, i) => (
                    <span key={i} className={styles.themeChip}>
                      <i className="fa-solid fa-tag me-1"></i> {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4-Column / Grid of Grounded Insights */}
            <div className={styles.insightsGrid}>
              {/* Strengths */}
              <div className={styles.insightSection}>
                <div className={styles.sectionTitle}>
                  <i className="fa-solid fa-circle-check text-success"></i>
                  <span>Most Mentioned Strengths</span>
                </div>
                <ul className={styles.insightList}>
                  {summaryData.mostMentionedStrengths?.map((str, i) => (
                    <li key={i} className={styles.insightItem}>{str}</li>
                  ))}
                </ul>
              </div>

              {/* Issues */}
              <div className={styles.insightSection}>
                <div className={styles.sectionTitle}>
                  <i className="fa-solid fa-triangle-exclamation text-warning"></i>
                  <span>Most Mentioned Issues</span>
                </div>
                <ul className={styles.insightList}>
                  {summaryData.mostMentionedIssues?.map((iss, i) => (
                    <li key={i} className={styles.insightItem}>{iss}</li>
                  ))}
                </ul>
              </div>

              {/* Suggestions */}
              <div className={styles.insightSection}>
                <div className={styles.sectionTitle}>
                  <i className="fa-solid fa-lightbulb text-info"></i>
                  <span>Common Suggestions</span>
                </div>
                <ul className={styles.insightList}>
                  {summaryData.commonSuggestions?.map((sug, i) => (
                    <li key={i} className={styles.insightItem}>{sug}</li>
                  ))}
                </ul>
              </div>

              {/* Important Signals */}
              <div className={styles.insightSection}>
                <div className={styles.sectionTitle}>
                  <i className="fa-solid fa-bell text-danger"></i>
                  <span>Important Signals</span>
                </div>
                <ul className={styles.insightList}>
                  {summaryData.importantSignals?.map((sig, i) => (
                    <li key={i} className={styles.insightItem}>{sig}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Representative Grounded Feedback */}
            {summaryData.representativeFeedback && summaryData.representativeFeedback.length > 0 && (
              <div className="mt-3 pt-3 border-top border-white border-opacity-10">
                <div className="small text-uppercase fw-bold text-info mb-2">Representative Student Feedback:</div>
                <div className={styles.quotesContainer}>
                  {summaryData.representativeFeedback.map((quote, i) => (
                    <div key={i} className={styles.quoteItem}>
                      "{quote}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOOLBAR & FILTERS */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search feedback comments, strengths, or student names..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            id="input-search-feedback"
          />
        </div>

        <div className={styles.filters}>
          <select
            className={styles.selectInput}
            value={ratingFilter}
            onChange={(e) => {
              setRatingFilter(e.target.value);
              setPage(1);
            }}
            id="select-feedback-rating"
          >
            <option value="">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
          </select>

          <select
            className={styles.selectInput}
            value={sentimentFilter}
            onChange={(e) => {
              setSentimentFilter(e.target.value);
              setPage(1);
            }}
            id="select-feedback-sentiment"
          >
            <option value="">All Sentiments</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEUTRAL">Neutral</option>
            <option value="NEGATIVE">Negative</option>
          </select>

          <select
            className={styles.selectInput}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            id="select-feedback-type"
          >
            <option value="">All Types</option>
            <option value="COURSE_CONTENT">Course Content</option>
            <option value="INSTRUCTOR">Instructor</option>
            <option value="FACILITY">Facility & Lab</option>
            <option value="PLATFORM">Platform & Systems</option>
            <option value="GENERAL">General</option>
          </select>

          <select
            className={styles.selectInput}
            value={programFilter}
            onChange={(e) => {
              setProgramFilter(e.target.value);
              setPage(1);
            }}
            id="select-feedback-program"
          >
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* FEEDBACK TABLE */}
      {loading ? (
        <LoadingState message="Loading student feedback..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchFeedback} />
      ) : feedbackList.length === 0 ? (
        <EmptyState
          title="No Student Feedback Records"
          message="No student feedback matches the active filters. Feedback is collected directly from enrolled candidates following course completion."
        />
      ) : (
        <DataTable
          columns={columns}
          data={feedbackList}
          pagination={pagination}
          onPageChange={(p) => setPage(p)}
          id="table-student-feedback"
        />
      )}

      {/* FEEDBACK DETAIL MODAL */}
      {selectedFeedback && (
        <Modal
          isOpen={Boolean(selectedFeedback)}
          onClose={() => setSelectedFeedback(null)}
          title="Student Feedback Record"
          size="md"
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-bold text-dark">{selectedFeedback.student?.fullName || 'Anonymous Student'}</div>
              <div className="text-muted small">{selectedFeedback.student?.email}</div>
            </div>
            <div className="text-end">
              <div>{renderStars(selectedFeedback.rating)}</div>
              <span
                className={`badge mt-1 ${
                  selectedFeedback.sentiment === 'POSITIVE'
                    ? 'bg-success'
                    : selectedFeedback.sentiment === 'NEGATIVE'
                    ? 'bg-danger'
                    : 'bg-secondary'
                }`}
              >
                {selectedFeedback.sentiment}
              </span>
            </div>
          </div>

          <div className="p-3 bg-light rounded border mb-3 small">
            <div className="row g-2">
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Program:</span>
                <div className="fw-medium text-dark">{selectedFeedback.program?.title}</div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Cohort:</span>
                <div className="fw-medium text-dark">{selectedFeedback.cohort?.cohortNumber} ({selectedFeedback.division?.replace('_', ' ')})</div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Feedback Type:</span>
                <div className="fw-medium text-dark">{selectedFeedback.feedbackType?.replace('_', ' ')}</div>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary fw-semibold">Submission Date:</span>
                <div className="fw-medium text-dark">{new Date(selectedFeedback.submittedAt || selectedFeedback.createdAt).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-bold text-dark small">Student Comments & Review</label>
            <div className="p-3 bg-white border rounded small text-dark" style={{ minHeight: '80px', lineHeight: 1.5 }}>
              {selectedFeedback.comments}
            </div>
          </div>

          {selectedFeedback.strengths && (
            <div className="mb-3">
              <label className="form-label fw-bold text-success small">Noted Strengths</label>
              <div className="p-2 bg-success bg-opacity-10 border border-success border-opacity-25 rounded small text-dark">
                {selectedFeedback.strengths}
              </div>
            </div>
          )}

          {selectedFeedback.improvements && (
            <div className="mb-3">
              <label className="form-label fw-bold text-warning small">Suggested Improvements</label>
              <div className="p-2 bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded small text-dark">
                {selectedFeedback.improvements}
              </div>
            </div>
          )}

          <div className="d-flex justify-content-end pt-2 border-top">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedFeedback(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
