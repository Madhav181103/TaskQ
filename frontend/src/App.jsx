import { useCallback, useRef } from 'react';
import './index.css';
import './App.css';
import QueueStatsPanel from './components/QueueStatsPanel';
import SubmitJobForm from './components/SubmitJobForm';
import DeadLetterPanel from './components/DeadLetterPanel';
import WorkerTerminalPanel from './components/WorkerTerminalPanel';

/**
 * App — TaskQ Dashboard
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Header: TaskQ Dashboard                │
 *   ├─────────────────────────────────────────┤
 *   │  QueueStatsPanel (full width)           │
 *   ├─────────────────┬───────────────────────┤
 *   │  SubmitJobForm  │  DeadLetterPanel      │
 *   ├─────────────────┴───────────────────────┤
 *   │  WorkerTerminalPanel (full width)       │
 *   └─────────────────────────────────────────┘
 *   (bottom rows stack to single column on mobile)
 */
function App() {
  // Ref to QueueStatsPanel's imperative refresh trigger
  const statsRefreshRef = useRef(null);

  const handleJobSubmitted = useCallback(() => {
    // Trigger an immediate stats refresh after a job is enqueued
    if (statsRefreshRef.current) {
      statsRefreshRef.current();
    }
  }, []);

  return (
    <div className="app-root">

      {/* ── Sticky Header ────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span className="app-logo-icon" aria-hidden="true">⚡</span>
            <span className="app-logo-name">TaskQ</span>
          </div>

          <div className="app-header-center">
            <h1 className="app-header-title">TaskQ Dashboard</h1>
          </div>

          <div className="app-header-right">
            <span className="app-env-badge">DEV</span>
          </div>
        </div>
      </header>

      {/* ── Main Dashboard ───────────────────────────────────────────── */}
      <main className="app-main" id="main-content">
        <div className="dashboard-layout">

          {/* Row 1 — Stats: always full width, glanceable first */}
          <section className="dashboard-row dashboard-row--stats" aria-label="Queue metrics">
            <QueueStatsPanel refreshRef={statsRefreshRef} />
          </section>

          {/* Row 2 — Submit + DLQ side by side */}
          <section className="dashboard-row dashboard-row--bottom" aria-label="Job submission and dead-letter queue">
            <div className="dashboard-col dashboard-col--form">
              <SubmitJobForm onJobSubmitted={handleJobSubmitted} />
            </div>
            <div className="dashboard-col dashboard-col--dlq">
              <DeadLetterPanel />
            </div>
          </section>

          {/* Row 3 — Live Worker Console */}
          <section className="dashboard-row dashboard-row--terminal" aria-label="Live worker console">
            <WorkerTerminalPanel />
          </section>

        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <span className="app-footer-text">
          TaskQ · Job Queue System · All times local
        </span>
      </footer>

    </div>
  );
}

export default App;
