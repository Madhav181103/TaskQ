-- Job history table schema for TaskQ
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  type VARCHAR(100) NOT NULL, -- e.g., "sendEmail", "resizeImage"
  payload JSONB NOT NULL,
  priority INT DEFAULT 5,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued | processing | completed | retrying | dead_letter
  attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index on the status column.
-- Rationale: The dashboard's most frequent query will be grouping/counting jobs by status
-- (e.g., counting how many jobs are in "queued", "processing", "completed", "dead_letter").
-- This index ensures fast status-based aggregations and filtering, avoiding slow sequential scans.
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
