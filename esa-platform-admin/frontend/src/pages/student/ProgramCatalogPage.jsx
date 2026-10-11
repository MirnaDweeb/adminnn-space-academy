import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SearchBar from '../../components/common/SearchBar';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import ConfirmModal from '../../components/common/ConfirmModal';
import programService from '../../services/api/programService';
import applicationService from '../../services/api/applicationService';
import { useAuth } from '../../hooks/useAuth';
import { DIVISION_LABELS } from '../../constants/divisions';
import styles from './ProgramCatalogPage.module.css';

export default function ProgramCatalogPage() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [appliedProgramIds, setAppliedProgramIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('ALL');

  // Apply confirmation modal state
  const [targetProgram, setTargetProgram] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch published programs and student's existing applications concurrently
      const [programsRes, myAppsRes] = await Promise.all([
        programService.list({ status: 'PUBLISHED', limit: 100 }),
        applicationService.listMyApplications().catch(() => ({ applications: [] })),
      ]);

      const allPrograms = programsRes?.data?.programs || programsRes?.programs || [];
      const myApps = myAppsRes?.applications || [];

      setPrograms(allPrograms);
      const appliedSet = new Set(
        myApps.map((a) => (typeof a.program === 'object' ? a.program?._id : a.program)).filter(Boolean)
      );
      setAppliedProgramIds(appliedSet);
    } catch (err) {
      console.error('Failed to load program catalog:', err);
      setError(err.response?.data?.message || err.message || 'Unable to load training programs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConfirmApply = async () => {
    if (!targetProgram) return;
    try {
      setApplyLoading(true);
      setFeedback(null);
      await applicationService.createApplication(targetProgram._id);
      setFeedback({
        type: 'success',
        text: `Application submitted successfully for "${targetProgram.title}". Review status in your applications tab.`,
      });
      setAppliedProgramIds((prev) => new Set([...prev, targetProgram._id]));
      setTargetProgram(null);
    } catch (err) {
      console.error('Application submission failed:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to submit application.',
      });
    } finally {
      setApplyLoading(false);
    }
  };

  const filteredPrograms = programs.filter((p) => {
    if (selectedDivision !== 'ALL' && p.division !== selectedDivision) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = p.title?.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      const matchLevel = p.level?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLevel) return false;
    }
    return true;
  });

  return (
    <div className={styles.container}>
      <PageHeader
        title="Academy Program Catalog"
        subtitle="Explore specialized space science, satellite engineering, and aerospace educational tracks."
        actions={
          <Link to="/applications" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1">
            <i className="fa-solid fa-file-lines" aria-hidden="true" />
            My Applications ({appliedProgramIds.size})
          </Link>
        }
      />

      {feedback && (
        <div
          className={`alert ${feedback.type === 'success' ? 'alert-success' : 'alert-danger'} py-2 px-3 mb-0`}
          role="alert"
        >
          <div className="d-flex justify-content-between align-items-center">
            <span>
              <i
                className={`fa-solid ${
                  feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'
                } me-2`}
              />
              {feedback.text}
            </span>
            <button
              type="button"
              className="btn-close btn-sm"
              onClick={() => setFeedback(null)}
              aria-label="Close alert"
            />
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <SearchBar
            value={search}
            onChange={(e) => setSearchTerm ? setSearchTerm(e.target.value) : setSearch(e.target.value)}
            placeholder="Search programs by title, curriculum, or level..."
          />
        </div>

        <div>
          <select
            className="form-select form-select-sm"
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
          >
            <option value="ALL">All Academy Divisions</option>
            <option value="PRE_UNIVERSITY">Pre-University Division</option>
            <option value="UNIVERSITY">University Division</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading academic programs..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : filteredPrograms.length === 0 ? (
        <EmptyState
          icon="fa-graduation-cap"
          title="No Programs Available"
          message="There are currently no published programs matching your selection criteria."
        />
      ) : (
        <div className={styles.grid}>
          {filteredPrograms.map((program) => {
            const isApplied = appliedProgramIds.has(program._id);
            return (
              <div key={program._id} className={styles.programCard}>
                <div>
                  <div className={styles.cardHeader}>
                    <span className={styles.divisionTag}>
                      {DIVISION_LABELS[program.division] || program.division}
                    </span>
                    <span className="badge bg-light text-dark border">
                      {program.level || 'Standard'}
                    </span>
                  </div>

                  <h3 className={styles.title}>{program.title}</h3>
                  <p className={styles.description}>
                    {program.description || 'Comprehensive training curriculum developed by Egyptian Space Agency specialists.'}
                  </p>

                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <i className="fa-solid fa-clock fa-fw" style={{ color: 'var(--esa-primary)' }} />
                      <span>Duration: {program.durationWeeks ? `${program.durationWeeks} weeks` : 'Self-Paced'}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <i className="fa-solid fa-users fa-fw" style={{ color: '#64748b' }} />
                      <span>Capacity: {program.capacity || 30} students per cohort</span>
                    </div>
                    <div className={styles.metaItem}>
                      <i className="fa-solid fa-laptop-code fa-fw" style={{ color: '#0284c7' }} />
                      <span>Mode: {program.deliveryMode || 'Hybrid / In-Person'}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div>
                    {program.price ? (
                      <span className={styles.price}>{program.price.toLocaleString()} EGP</span>
                    ) : (
                      <span className={styles.priceFree}>Fully Sponsored</span>
                    )}
                  </div>

                  {isApplied ? (
                    <span className={styles.appliedBadge}>
                      <i className="fa-solid fa-check" />
                      Applied
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.applyButton}
                      onClick={() => setTargetProgram(program)}
                    >
                      <i className="fa-solid fa-paper-plane" />
                      Apply Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Apply Modal */}
      {targetProgram && (
        <ConfirmModal
          isOpen={Boolean(targetProgram)}
          onClose={() => !applyLoading && setTargetProgram(null)}
          onConfirm={handleConfirmApply}
          title="Submit Academy Application"
          message={
            <div>
              <p>
                You are about to submit an application for:
                <br />
                <strong>{targetProgram.title}</strong> ({DIVISION_LABELS[targetProgram.division] || targetProgram.division})
              </p>
              <p className="text-muted small mb-0">
                Your student profile will be reviewed by academy admissions officers. You will receive an official notification once your readiness and prerequisites have been validated.
              </p>
            </div>
          }
          confirmText="Confirm Application"
          confirmTone="primary"
          loading={applyLoading}
          icon="fa-paper-plane"
        />
      )}
    </div>
  );
}
