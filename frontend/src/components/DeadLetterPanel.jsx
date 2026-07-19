import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

/**
 * DeadLetterPanel Component
 *
 * Fetches permanently failed jobs from GET /deadletter on mount.
 * Allows manual retry of individual jobs via POST /deadletter/:id/retry.
 * Shows a positive empty state when the dead-letter queue is clean.
 */
function DeadLetterPanel() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryingIds, setRetryingIds] = useState(new Set());
  const [retryFeedback, setRetryFeedback] = useState({}); // { [id]: 'success' | 'error' }

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDeadLetters = useCallback(async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const response = await api.get('/deadletter');
      setJobs(response.data);
      setError(null);
    } catch (err) {
      console.error('[DeadLetterPanel] Failed to fetch dead-letter jobs:', err);
      setError('Failed to load dead-lettered jobs. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeadLetters();
  }, [fetchDeadLetters]);

  // ── Retry ────────────────────────────────────────────────────────────────
  const handleRetry = async (jobId) => {
    setRetryingIds(prev => new Set(prev).add(jobId));
    setRetryFeedback(prev => ({ ...prev, [jobId]: null }));

    try {
      await api.post(`/deadletter/${jobId}/retry`);
      setRetryFeedback(prev => ({ ...prev, [jobId]: 'success' }));
      // Give the user a brief "success" flash, then refresh list
      setTimeout(() => fetchDeadLetters(), 800);
    } catch (err) {
      console.error(`[DeadLetterPanel] Retry failed for job ${jobId}:`, err);
      setRetryFeedback(prev => ({ ...prev, [jobId]: 'error' }));
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(ts));
    } catch {
      return ts;
    }
  };

  const prettyPayload = (payload) => {
    try {
      return JSON.stringify(typeof payload === 'string' ? JSON.parse(payload) : payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-card dlq-card">
      {/* Header */}
      <div className="card-header dlq-header-row">
        <div>
          <h2>
            <span className="dlq-title-icon">☠️</span>
            Dead Letter Queue
          </h2>
          <span className="card-subtitle">
            Permanently failed jobs requiring manual intervention
          </span>
        </div>
        <div className="dlq-header-actions">
          {jobs.length > 0 && (
            <span className="dlq-count-badge">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          )}
          <button
            id="dlq-refresh-btn"
            className="btn-refresh"
            onClick={() => fetchDeadLetters(true)}
            disabled={loading}
            title="Refresh dead-letter list"
          >
            <span className={`refresh-icon ${loading ? 'spinning' : ''}`}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-icon">⚠️</span>
          <span className="alert-content">{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="stats-loading">
          <span className="spinner"></span>
          <span>Loading dead-letter jobs...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && jobs.length === 0 && (
        <div className="dlq-empty-state">
          <div className="dlq-empty-icon">✅</div>
          <h3 className="dlq-empty-title">All Clear</h3>
          <p className="dlq-empty-msg">
            No dead-lettered jobs — nothing has permanently failed.
          </p>
        </div>
      )}

      {/* Job List */}
      {!loading && !error && jobs.length > 0 && (
        <div className="dlq-list">
          {jobs.map((job) => {
            const isRetrying = retryingIds.has(job.id);
            const feedback = retryFeedback[job.id];

            return (
              <div
                key={job.id}
                className={`dlq-job-card ${feedback === 'success' ? 'dlq-job-success-flash' : ''}`}
              >
                {/* Job Meta Row */}
                <div className="dlq-job-meta">
                  <div className="dlq-job-meta-left">
                    <span className="dlq-job-type">{job.type}</span>
                    <span className="dlq-job-id">
                      <code>{job.id}</code>
                    </span>
                  </div>
                  <span className="dlq-job-timestamp">{formatTimestamp(job.failedAt || job.updatedAt || job.createdAt)}</span>
                </div>

                {/* Error Message */}
                {job.errorMessage && (
                  <div className="dlq-error-block">
                    <span className="dlq-error-label">Error</span>
                    <p className="dlq-error-text">{job.errorMessage}</p>
                  </div>
                )}

                {/* Payload */}
                <div className="dlq-payload-block">
                  <span className="dlq-payload-label">Payload</span>
                  <pre className="dlq-payload-pre">{prettyPayload(job.payload)}</pre>
                </div>

                {/* Retry Row */}
                <div className="dlq-job-footer">
                  {feedback === 'success' && (
                    <span className="dlq-feedback dlq-feedback-success">
                      ✓ Re-queued — job moved back to live queue
                    </span>
                  )}
                  {feedback === 'error' && (
                    <span className="dlq-feedback dlq-feedback-error">
                      ✗ Retry request failed
                    </span>
                  )}
                  {!feedback && <span />}

                  <button
                    id={`dlq-retry-btn-${job.id}`}
                    className="btn-retry"
                    onClick={() => handleRetry(job.id)}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <>
                        <span className="spinner spinner-sm"></span>
                        Retrying…
                      </>
                    ) : (
                      <>
                        <span className="retry-arrow">↺</span>
                        Retry Job
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DeadLetterPanel;
