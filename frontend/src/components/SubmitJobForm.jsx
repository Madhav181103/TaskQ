import React, { useState } from 'react';
import api from '../api';

/**
 * SubmitJobForm Component
 * 
 * Provides an interactive UI to push new jobs into the TaskQ priority queue.
 * Features:
 * - Dynamic parameter inputs depending on whether we simulate email sending or image resizing.
 * - Priority level selector with visual hint indicators.
 * - Loading states, error banners, and success prompts showing the returned UUID.
 */
function SubmitJobForm({ onJobSubmitted }) {
  const [type, setType] = useState('sendEmail');
  
  // State for simulated payload fields
  const [emailTo, setEmailTo] = useState('hello@target.com');
  const [emailSubject, setEmailSubject] = useState('TaskQ Queue Notification');
  const [imgSrc, setImgSrc] = useState('https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5');
  const [imgWidth, setImgWidth] = useState(600);
  
  const [priority, setPriority] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submittedJob, setSubmittedJob] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSubmittedJob(null);

    // Assemble job payload parameters based on task type
    const payload = type === 'sendEmail'
      ? { to: emailTo, subject: emailSubject }
      : { src: imgSrc, width: parseInt(imgWidth, 10) };

    try {
      const response = await api.post('/jobs', {
        type,
        payload,
        priority: parseInt(priority, 10),
      });
      
      setSubmittedJob(response.data);
      
      // Notify parent to refresh queue statistics
      if (onJobSubmitted) {
        onJobSubmitted(response.data.jobId);
      }
    } catch (err) {
      console.error('[SubmitJobForm] Post failed:', err);
      setError(err.response?.data?.error || 'Failed to connect to the backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-card form-card">
      <div className="card-header">
        <h2>Submit New Job</h2>
        <span className="card-subtitle">Push a simulation task to the priority queue</span>
      </div>
      
      {error && (
        <div className="alert alert-danger">
          <div className="alert-icon">⚠️</div>
          <div className="alert-content">{error}</div>
        </div>
      )}

      {submittedJob && (
        <div className="alert alert-success">
          <div className="alert-icon">✨</div>
          <div className="alert-content">
            <strong>Submitted Successfully!</strong>
            <div className="job-id-wrap">
              <span>Job ID:</span>
              <code>{submittedJob.jobId}</code>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="job-form">
        <div className="form-group">
          <label htmlFor="job-type">Job Type</label>
          <select
            id="job-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={loading}
          >
            <option value="sendEmail">✉ sendEmail (Simulated Email)</option>
            <option value="resizeImage">🖼 resizeImage (Simulated Processing)</option>
          </select>
        </div>

        {type === 'sendEmail' ? (
          <>
            <div className="form-group">
              <label htmlFor="email-to">Recipient Email</label>
              <input
                id="email-to"
                type="email"
                required
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                disabled={loading}
                placeholder="e.g. receiver@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="email-subject">Subject Line</label>
              <input
                id="email-subject"
                type="text"
                required
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={loading}
                placeholder="e.g. Account activation"
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor="img-src">Image URL Source</label>
              <input
                id="img-src"
                type="text"
                required
                value={imgSrc}
                onChange={(e) => setImgSrc(e.target.value)}
                disabled={loading}
                placeholder="e.g. https://domain.com/picture.jpg"
              />
            </div>
            <div className="form-group">
              <label htmlFor="img-width">Target Width (Pixels)</label>
              <input
                id="img-width"
                type="number"
                required
                min="10"
                max="8000"
                value={imgWidth}
                onChange={(e) => setImgWidth(e.target.value)}
                disabled={loading}
              />
            </div>
          </>
        )}

        <div className="form-group">
          <div className="label-row">
            <label htmlFor="job-priority">Priority Score</label>
            <span className="label-hint">lower score = processed sooner</span>
          </div>
          <input
            id="job-priority"
            type="number"
            min="0"
            max="100"
            required
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={loading}
          />
        </div>

        <button type="submit" disabled={loading} className="btn-submit">
          {loading ? (
            <span className="spinner-wrap">
              <span className="spinner"></span>
              Enqueuing...
            </span>
          ) : (
            'Queue Job'
          )}
        </button>
      </form>
    </div>
  );
}

export default SubmitJobForm;
