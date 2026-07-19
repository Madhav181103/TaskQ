# ⚙️ TaskQ — Distributed Job Queue & Task Scheduler

> Submit jobs to a priority queue, processed by a pool of workers with automatic retries
> (exponential backoff) and a dead-letter queue for permanently failed jobs.

---

## How It Works

```
Browser / curl
     │
     ▼
POST /api/jobs
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│  API Server (Express)                                           │
│                                                                 │
│  1. Write job record → PostgreSQL  (status: 'queued')           │
│  2. Cache payload   → Redis  (taskq:job:<uuid>)                 │
│  3. Enqueue         → Redis ZADD taskq:queue <priority> <uuid>  │
└─────────────────────────────────────────────────────────────────┘
                              │
              Redis sorted set (priority queue)
                              │
     ┌────────────────────────┼────────────────────────┐
     ▼                        ▼                        ▼
Worker Loop 1           Worker Loop 2           Worker Loop N
ZPOPMIN (atomic)        ZPOPMIN (atomic)        ZPOPMIN (atomic)
     │
     ├── Success → mark 'completed' in Postgres, clean up Redis
     │
     └── Failure → retryService
                        │
                        ├── attempts < MAX_RETRY_ATTEMPTS
                        │       └── ZADD taskq:delayed  (score = now + backoff_seconds)
                        │               ▲
                        │               │  schedulerService polls every second
                        │               │  promotes due jobs back to taskq:queue
                        │
                        └── attempts >= MAX_RETRY_ATTEMPTS
                                └── moveToDeadLetter → Postgres (status: 'dead_letter')
```

### Step by step

1. **Enqueue** — The API writes a job record to PostgreSQL and pushes the job ID into a Redis
   sorted set (`taskq:queue`) with its priority as the score. Lower score = processed first.

2. **Dequeue (atomic)** — Each worker calls `ZPOPMIN` on the sorted set, which atomically pops the
   highest-priority job. Because `ZPOPMIN` is atomic at the Redis server level, multiple workers
   can compete safely — no two workers ever receive the same job. No application-level locking needed.

3. **Reliable move-to-processing** — After popping, the job ID is written to `taskq:processing`
   (a Redis hash) with a timestamp so stuck jobs can be detected. *(See Known Limitations.)*

4. **Retry with exponential backoff** — On failure, the job is added to a second sorted set
   (`taskq:delayed`) with its score set to the absolute Unix timestamp when it next becomes eligible.
   A scheduler loop polls this set every second and promotes due jobs back to the live queue.
   Backoff formula: `delay = RETRY_BACKOFF_BASE_SECONDS ^ attemptNumber`
   (default: attempt 1 = 2s, attempt 2 = 4s, attempt 3 = 8s).

5. **Dead-letter queue** — Jobs that exceed `MAX_RETRY_ATTEMPTS` are marked `dead_letter` in
   PostgreSQL. The dashboard lists them with their error message and payload, and lets you
   retry them manually (re-enqueues at the original priority).

6. **Live dashboard** — A React frontend polls `GET /api/stats` every 2 seconds and displays
   real-time counts by status. Submit test jobs and watch the full lifecycle without touching curl.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API + Worker | Node.js, Express | Lightweight, async-native, single runtime for both processes |
| Priority Queue | Redis sorted set (`ZADD` / `ZPOPMIN`) | O(log N) insert + atomic pop — distributed heap out of the box |
| Delayed Retries | Redis sorted set (`taskq:delayed`) | Same sorted-set-as-heap trick; score = future Unix timestamp |
| Job History | PostgreSQL | Durable, queryable record of every job and its lifecycle |
| Frontend | React + Vite | Component-per-panel dashboard with live polling |

---

## Project Structure

```
TaskQ/
├── backend/
│   ├── server.js               # Express app — mounts routes, starts HTTP server
│   ├── worker.js               # Worker pool — spawns N concurrent job-processing loops
│   ├── config.js               # Centralised env-var config with defaults
│   ├── handlers/               # Job handlers: sendEmailHandler.js, resizeImageHandler.js
│   ├── routes/
│   │   ├── jobRoutes.js        # POST /api/jobs, GET /api/jobs/:id
│   │   └── statsRoutes.js      # GET /api/stats, GET /api/deadletter, POST /api/deadletter/:id/retry
│   ├── services/
│   │   ├── queueService.js     # Redis enqueue / dequeue / markJobDone
│   │   ├── jobStoreService.js  # PostgreSQL CRUD for job records
│   │   ├── retryService.js     # Backoff delay calculation + handleJobFailure
│   │   ├── schedulerService.js # Polls taskq:delayed; promotes due jobs to live queue
│   │   └── deadLetterService.js# moveToDeadLetter, getDeadLetterJobs, retryDeadLetterJob
│   ├── db/
│   │   └── schema.sql          # jobs table + idx_jobs_status index
│   └── scripts/
│       └── bulkSubmit.js       # Load-test script: submits 100 jobs, measures enqueue speed
├── frontend/
│   └── src/
│       ├── App.jsx             # Dashboard layout: header + stats + submit/DLQ row
│       └── components/
│           ├── QueueStatsPanel.jsx   # Live-polling status counts
│           ├── SubmitJobForm.jsx     # Enqueue new jobs from the browser
│           └── DeadLetterPanel.jsx   # Inspect + retry permanently failed jobs
└── loadtest/
    └── benchmark.md            # Concurrency benchmark table + run instructions
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Enqueue a new job. Body: `{ type, payload, priority? }` |
| `GET`  | `/api/jobs/:id` | Get status and details of a specific job by UUID |
| `GET`  | `/api/stats` | Job counts grouped by status (queued / processing / retrying / completed / dead_letter) |
| `GET`  | `/api/deadletter` | List all dead-lettered jobs |
| `POST` | `/api/deadletter/:id/retry` | Re-enqueue a dead-lettered job at its original priority |

---

## Running Locally

### Prerequisites

- Node.js ≥ 18
- PostgreSQL (create a database named `taskq`)
- Redis (running on `localhost:6379` by default)

### Setup & Start

```bash
# Terminal 1 — API Server
cd backend
npm install
cp .env.example .env       # edit DATABASE_URL if your Postgres credentials differ
psql -d taskq -f db/schema.sql
npm run dev                # starts on http://localhost:8000

# Terminal 2 — Worker Process
cd backend
npm run worker             # reads WORKER_CONCURRENCY from .env (default: 3)

# Terminal 3 — Frontend Dashboard
cd frontend
npm install
npm run dev                # starts on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) to see the dashboard.

### Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `WORKER_CONCURRENCY` | `3` | Number of parallel job-processing loops |
| `MAX_RETRY_ATTEMPTS` | `3` | Retries before a job is dead-lettered |
| `RETRY_BACKOFF_BASE_SECONDS` | `2` | Base for exponential backoff (`base ^ attempt`) |
| `PROCESSING_TIMEOUT_SECONDS` | `30` | Threshold for detecting stuck jobs |

---

## Load Testing & Benchmark

```bash
# Submit 100 jobs and measure enqueue speed
cd backend
npm run bulk
```

See [`loadtest/benchmark.md`](loadtest/benchmark.md) for a step-by-step guide to running the
`WORKER_CONCURRENCY=1` vs `WORKER_CONCURRENCY=3` comparison. Fill in your actual numbers there.

**Expected result:** concurrency=3 completes ~3× faster than concurrency=1, proving the
worker pool actually parallelizes execution — not just an architectural claim.

---

## Known Limitations (Honest Engineering)

These are deliberate simplifications made for clarity — each one has a documented fix:

### 1. Two-step dequeue is not fully atomic

`dequeueJob()` calls `ZPOPMIN` and then `HSET` into `taskq:processing` as two separate Redis
commands. If the worker crashes between those two calls, the job is silently lost.

**Production fix:** Wrap both commands in a Redis Lua script, which Redis executes atomically
on the server in a single round-trip.

### 2. Worker runs inside one OS process

`WORKER_CONCURRENCY=3` starts three async loops inside one Node.js process. They share the
same CPU and memory. True horizontal scaling requires running `worker.js` on multiple machines
(or containers), all pointing at the same Redis instance — which this architecture fully supports
without any code changes.

### 3. Processing timeout sweep is passive

`PROCESSING_TIMEOUT_SECONDS` is tracked but a full active sweep (re-queuing stuck jobs) is
only partially implemented. A production system would need a scheduler loop that periodically
checks `taskq:processing` timestamps and re-enqueues any job whose age exceeds the timeout.

---

## What I'd Add With More Time

- **Atomic Lua dequeue** — eliminate the ZPOPMIN → HSET race window (see Known Limitations #1)
- **Horizontal worker scaling** — run `worker.js` on multiple machines; the architecture already
  supports this since all state lives in Redis + Postgres
- **Full processing timeout sweep** — active re-queue of jobs stuck in `taskq:processing`
  past the configured timeout
- **Job progress events** — WebSocket or SSE stream from worker to dashboard so the UI updates
  instantly instead of polling every 2 seconds
- **Admin API** — `DELETE /api/jobs/:id`, bulk-retry DLQ, priority override on existing jobs

---

## Architecture Decisions Worth Discussing

**"Why Redis sorted sets instead of a list?"**
A list (`RPUSH`/`LPOP`) gives FIFO ordering — fine for equal-priority work. A sorted set gives
O(log N) priority-aware ordering: job with score 1 always beats score 10, regardless of insertion
order. This is a real min-heap implemented inside Redis.

**"Why poll at 500ms instead of `BRPOP`?"**
`BRPOP`/`BLMOVE` block the Redis connection until a job arrives, eliminating poll delay. We chose
polling because it's easier to reason about, trace, and shut down cleanly during development.
The 500ms idle lag is negligible when the queue is under load.

**"Why PostgreSQL for job history?"**
Redis is ephemeral — jobs that complete or crash out disappear. PostgreSQL gives a permanent,
queryable audit trail of every job's full lifecycle (created → queued → processing → completed
or dead_letter), which is invaluable for debugging and for the dashboard's stats aggregation.
