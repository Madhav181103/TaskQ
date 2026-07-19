import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

/**
 * WorkerTerminalPanel Component
 * 
 * Periodically polls the backend for worker logs and renders them in a styled
 * terminal panel. Features auto-scroll, log clearing, and colored log types.
 */
function WorkerTerminalPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const terminalEndRef = useRef(null);
  const logContainerRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await api.get('/logs');
      setLogs(response.data);
      setError(null);
    } catch (err) {
      console.error('[WorkerTerminalPanel] Error polling logs:', err);
      setError('Connection lost');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // Scroll to bottom if auto-scroll is enabled
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Request Redis log clearing on the backend
  const handleClearDbLogs = async () => {
    try {
      await api.delete('/logs');
      setLogs([]);
    } catch (err) {
      console.error('[WorkerTerminalPanel] Error clearing logs:', err);
    }
  };

  // Color code and parse log lines dynamically
  const renderLogLine = (line, index) => {
    if (!line) return null;

    let lineClass = 'terminal-line-log';
    let content = line;

    // Detect and separate type tag
    if (line.startsWith('[ERROR]')) {
      lineClass = 'terminal-line-error';
      content = line.replace('[ERROR]', '❌ [ERROR]');
    } else if (line.startsWith('[LOG]')) {
      content = line.substring(6); // strip '[LOG] '
      if (content.includes('[Scheduler]')) {
        lineClass = 'terminal-line-scheduler';
      } else if (content.includes('[System]')) {
        lineClass = 'terminal-line-system';
      } else if (content.includes('[Worker')) {
        lineClass = 'terminal-line-worker-init';
      } else if (content.includes('Success!') || content.includes('completed successfully')) {
        lineClass = 'terminal-line-success';
      } else if (content.includes('failed execution') || content.includes('failed.')) {
        lineClass = 'terminal-line-fail';
      } else if (content.includes('Dequeued Job')) {
        lineClass = 'terminal-line-dequeue';
      }
    }

    return (
      <div key={index} className={`terminal-line ${lineClass}`}>
        <span className="terminal-prompt">&gt;</span>
        <span className="terminal-text">{content}</span>
      </div>
    );
  };

  return (
    <div className="dashboard-card terminal-card">
      <div className="card-header terminal-header">
        <div className="terminal-title-wrap">
          <div className="terminal-icon">📟</div>
          <div>
            <h2>Worker Process Console</h2>
            <span className="card-subtitle">Live console stream of worker and scheduler activity</span>
          </div>
        </div>

        <div className="terminal-controls">
          <div className="live-status-wrap">
            {error ? (
              <span className="connection-badge offline">Offline</span>
            ) : (
              <span className="connection-badge online">
                <span className="pulse-dot"></span>
                Streaming
              </span>
            )}
          </div>
          
          <label className="autoscroll-toggle">
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={(e) => setAutoScroll(e.target.checked)} 
            />
            <span>Auto-scroll</span>
          </label>

          <button 
            className="btn btn--secondary btn--sm clear-btn"
            onClick={handleClearDbLogs}
            disabled={logs.length === 0}
            title="Clear persistent logs in Redis"
          >
            Clear Output
          </button>
        </div>
      </div>

      <div className="terminal-viewport" ref={logContainerRef}>
        {loading && logs.length === 0 ? (
          <div className="terminal-loading">
            <span className="spinner"></span>
            <span>Initializing console link...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="terminal-empty">
            <span>Console is idle. Submit a job to watch execution output.</span>
          </div>
        ) : (
          <div className="terminal-logs">
            {logs.map((line, idx) => renderLogLine(line, idx))}
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkerTerminalPanel;
