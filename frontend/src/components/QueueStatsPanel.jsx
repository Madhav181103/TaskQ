import React, { useState, useEffect } from 'react';
import api from '../api';

/**
 * QueueStatsPanel Component
 * 
 * Fetches job stats on mount and polls every 2 seconds.
 * Renders status aggregates in a responsive grid layout.
 */
function QueueStatsPanel() {
  const [stats, setStats] = useState({
    queued: 0,
    processing: 0,
    completed: 0,
    retrying: 0,
    dead_letter: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await api.get('/stats');
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('[QueueStatsPanel] Error polling stats:', err);
      setError('Connection interrupted');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Immediate load
    fetchStats();

    // Set polling scheduler
    const interval = setInterval(fetchStats, 2000);

    // Unmount cleanup
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: 'Queued', key: 'queued', colorClass: 'queued', desc: 'Pending Execution' },
    { label: 'Processing', key: 'processing', colorClass: 'processing', desc: 'Running Active Task' },
    { label: 'Retrying', key: 'retrying', colorClass: 'retrying', desc: 'Delayed Backoffs' },
    { label: 'Completed', key: 'completed', colorClass: 'completed', desc: 'Processed OK' },
    { label: 'Dead Letter', key: 'dead_letter', colorClass: 'dead-letter', desc: 'Permanent Fail' }
  ];

  return (
    <div className="dashboard-card stats-card">
      <div className="card-header stats-header-row">
        <div>
          <h2>System Metrics</h2>
          <span className="card-subtitle">Real-time status aggregates of jobs in system</span>
        </div>
        <div className="live-status-wrap">
          {error ? (
            <span className="connection-badge offline">Offline</span>
          ) : (
            <span className="connection-badge online">
              <span className="pulse-dot"></span>
              Live Polling
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="stats-loading">
          <span className="spinner"></span>
          <span>Loading queue status...</span>
        </div>
      )}

      {!loading && (
        <div className="stats-grid">
          {statCards.map(card => {
            const count = stats[card.key] !== undefined ? stats[card.key] : 0;
            return (
              <div key={card.key} className={`stat-box stat-box-${card.colorClass}`}>
                <div className="stat-count-row">
                  <span className="stat-count">{count}</span>
                  <span className="status-indicator-dot"></span>
                </div>
                <span className="stat-label">{card.label}</span>
                <span className="stat-desc">{card.desc}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default QueueStatsPanel;
