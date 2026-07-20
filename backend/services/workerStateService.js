'use strict';

/**
 * workerStateService
 *
 * In-memory singleton that tracks whether the worker loops are paused.
 * Default state: RUNNING (paused = false).
 *
 * The pause state is intentionally in-memory only — a server restart will
 * always bring the worker back to the running state (safe default).
 */

let paused = false;

module.exports = {
  isPaused: () => paused,
  pause:    () => { paused = true;  console.log('[System] Worker paused by user.'); },
  resume:   () => { paused = false; console.log('[System] Worker resumed by user.'); },
  getStatus: () => ({ paused }),
};
