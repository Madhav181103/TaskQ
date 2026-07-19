# TaskQ — Load Test & Benchmark Notes

## Why This Matters (Interview Talking Point)

> **Comparing `WORKER_CONCURRENCY=1` vs `WORKER_CONCURRENCY=3` is the single most compelling
> thing you can demo in an interview about this project.**

Here's why it's meaningful, not just a vanity metric:

- With `WORKER_CONCURRENCY=1`, each job is processed *serially* — the worker finishes Job A
  before it can start Job B. If every job takes ~200ms, 100 jobs take at minimum **20 seconds**.

- With `WORKER_CONCURRENCY=3`, three workers independently pop from the same Redis priority
  queue **simultaneously**, using Redis's atomic `ZPOPMIN`. No two workers ever claim the same
  job (Redis guarantees this), so there's no application-level locking needed.
  100 jobs at ~200ms each, with 3 workers running in parallel, should complete in roughly
  **7–8 seconds** — a ~3x speedup that directly mirrors the concurrency setting.

This is *direct, visual, numerical proof* that:
1. Your worker pool design actually parallelizes work (not just an architectural claim).
2. Redis's atomic pop prevents race conditions without any mutex or lock code you had to write.
3. The bottleneck shifts from CPU/IO-bound work to network round-trip time as you add workers —
   a real-world property that shows you understand the limits of the design.

It's the kind of thing interviewers remember because you showed a graph/table, not just described it.

---

## How to Run the Benchmark

### Prerequisites

Make sure the following are running before starting:

```
# Terminal 1 — API server
cd backend
npm run dev

# Terminal 2 — Worker (set concurrency in .env first!)
cd backend
node worker.js
```

### Step 1 — Set Worker Concurrency

Edit `backend/.env`:

```env
# Run 1: serial baseline
WORKER_CONCURRENCY=1

# Run 2: parallel pool
WORKER_CONCURRENCY=3
```

Restart the worker process after each change.

### Step 2 — Submit 100 Jobs

```bash
node backend/scripts/bulkSubmit.js
```

The script will print the **submission start timestamp**. Copy this — it is your start time.

### Step 3 — Poll Until Done

In a separate terminal, run this every few seconds:

```bash
# Windows PowerShell
while ($true) { Invoke-RestMethod http://localhost:8000/api/stats | ConvertTo-Json; Start-Sleep 3 }

# Unix / Git Bash
watch -n 3 'curl -s http://localhost:8000/api/stats | python -m json.tool'

# One-shot (paste & repeat manually)
curl -s http://localhost:8000/api/stats
```

Watch the `completed` count. When it **stops increasing** (and `queued` + `processing` = 0),
all jobs are done. Note the wall-clock time — that is your **Time to Complete All**.

### Step 4 — Record the Results

Fill in the table below with your actual numbers.

---

## Benchmark Results

> **Note:** "Time to Complete All" is wall-clock time from when `bulkSubmit.js`
> began submitting until `GET /api/stats` shows `queued=0, processing=0`.
> Enqueue time (~1–2s) is included in the total.

| Test | Jobs Submitted | Worker Concurrency | Time to Complete All | Jobs Dead-Lettered |
|------|---------------|-------------------|----------------------|--------------------|
| Baseline (serial) | 100 | 1 | _(fill in)_ s | _(fill in)_ |
| Parallel pool     | 100 | 3 | _(fill in)_ s | _(fill in)_ |

### Expected Results (Reference)

These are approximate — actual numbers depend on your machine's speed and handler sleep times:

| Test | Jobs Submitted | Worker Concurrency | Time to Complete All | Speedup vs Baseline |
|------|---------------|-------------------|----------------------|---------------------|
| Baseline (serial) | 100 | 1 | ~22–28s | 1× (baseline) |
| Parallel pool     | 100 | 3 | ~8–11s  | ~2.5–3× faster |

> If you changed `MAX_RETRY_ATTEMPTS` or handler sleep durations, your numbers will differ.
> What matters is the **ratio**, not the absolute value.

---

## Interpreting the Results

### What a ~3× speedup proves

```
Time(concurrency=1) / Time(concurrency=3) ≈ 3.0
```

This ratio should track closely with the concurrency setting. If it doesn't:

- **Much less than 3×**: Your handlers are CPU-bound and saturating a single core,
  or there's a shared bottleneck (e.g. DB connection pool too small).
- **More than 3×**: Queue overhead was significant at concurrency=1 (unlikely but possible).

### Dead-lettered jobs

Any jobs that appear in the `dead_letter` count were not due to the load test itself —
they represent jobs that genuinely hit your `MAX_RETRY_ATTEMPTS` limit. Check the
Dead Letter Queue panel in the dashboard for their error messages.

---

## Architecture Note: Why Redis Makes This Safe

```
Worker 1 ──►  ZPOPMIN  ──►  Redis Queue  ◄──  ZPOPMIN  ◄── Worker 2
                                  │
                            (atomic pop)
                                  │
                            Worker 3 ──► ZPOPMIN (gets next item, never same one)
```

Redis's `ZPOPMIN` is **atomic at the server level** — it pops and removes in a single
operation with no possibility of two clients receiving the same element. This is why
TaskQ needs zero application-level locking for its worker pool. The concurrency
safety is delegated entirely to Redis's single-threaded command execution model.

This is a legitimate architectural decision, not a shortcut — it's the same model
used by production queue systems like Sidekiq (Ruby), Celery (Python), and BullMQ (Node).

---

## Cleanup After Benchmarking

After both runs, remember to:

1. Set `WORKER_CONCURRENCY` back to your preferred value (default: `3`)
2. Optionally clear the DLQ via the dashboard Retry buttons
3. Reset any `MAX_RETRY_ATTEMPTS=0` or forced-failure handler changes you made during testing
