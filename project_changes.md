# 🛠️ TaskQ — Project Changes & Verification Walkthrough

This document outlines the modifications made to the TaskQ codebase and explains how to run the priority and retry demonstrations.

---

## 1. What Changes Were Made?

### 📺 Live Worker Terminal Dashboard Integration (Frontend + Backend)
*   **Worker Console Interceptor (`backend/worker.js`):** Captured console logging globally and cached recent worker logs in Redis (using a list named `taskq:logs` capped at 100 entries via `LTRIM`).
*   **Logs API Endpoint (`backend/routes/statsRoutes.js`):** Exposed `GET /api/logs` and `DELETE /api/logs` to read and flush the Redis log buffer.
*   **UI Terminal Component (`frontend/src/components/WorkerTerminalPanel.jsx`):** A custom component that polls the logs API every 1000ms. It features colored syntax styling, auto-scrolling, and a manual clear database buffer button.
*   **Mounted in App (`frontend/src/App.jsx` & `frontend/src/App.css`):** Placed the terminal component below the DLQ panel.

### ⚙️ Engine Refactoring & Compatibility
*   **Lua Script Atomic Popping (`backend/services/queueService.js`):** Replaced the modern `ZPOPMIN` command (unsupported in older Redis 3.x versions on Windows) with an atomic Lua script executing `ZRANGE`, `ZREM`, and `HSET` atomically on the server.
*   **Decoupled Job Validation (`backend/routes/jobRoutes.js`):** Removed the strict handler existence check from the Express ingestion endpoint. This simulates a real microservices pipeline where the ingestion API doesn't know about worker handler code. It lets unregistered types enqueue, allowing the background worker to route them directly to the Dead-Letter Queue (DLQ).

### 🧪 Deterministic Interview Demo Suite
*   **Demo Submission Script (`backend/scripts/demoSubmit.js`):** Submits exactly 12 jobs featuring a mix of priorities (1 to 10), retry types, and unregistered actions.
*   **Flexible Handler Mocking (`backend/handlers/sendEmailHandler.js`):** Updated the simulated email handler to track attempts in a Map and trigger predictable behaviors for testing:
    *   `retry-once`: Fails on attempt 1, succeeds on attempt 2 (Retry #1).
    *   `retry-twice`: Fails on attempts 1 and 2, succeeds on attempt 3 (Retry #2).
    *   `retry-thrice`: Fails on attempts 1, 2, and 3, succeeds on attempt 4 (Retry #3).
    *   `always-fail` / `always_fail`: Fails permanently on all attempts, routing to the DLQ.

---

## 2. How to run the 12-Job Demo (Stopping the Worker)

To show an interviewer how the queue prioritizes and handles retries, follow these steps:

### Step 1: Clear the Queue & Stop the Workers
1. Stop the worker process terminal (`Ctrl+C` in the worker shell).
2. Go to the dashboard at `http://localhost:5173/` and click **Clear Output** to wipe the visual log buffer.
3. Reset your database and Redis cache (optional, to start completely at 0):
   ```bash
   # From your backend folder:
   psql -U postgres -h localhost -d taskq -c "TRUNCATE TABLE jobs;"
   redis-cli flushall
   ```

### Step 2: Queue the 12 Jobs
Run the demo submission script from the backend folder:
```bash
npm run demo
```
*This pushes 12 jobs in **random order** to the API server. In the UI, you will see the **Queued** count card update to **12**.*

### Step 3: Start the Worker & Watch the Terminal
Start the worker process:
```bash
npm run worker
```
Switch to the dashboard UI and watch the logs scroll:
1.  **Priority Sorting:** High-priority jobs (Priority 1 and 2) are processed and completed first.
2.  **Unregistered Types:** The `invalidType` job immediately moves to the DLQ.
3.  **Retries:** The `retry-once` job fails, waits 2s, and succeeds. The `retry-twice` job fails twice (2s, 4s delays) and succeeds.
4.  **DLQ:** The `always-fail` job fails 3 times, exhausts retries, and moves to the DLQ at the bottom.
