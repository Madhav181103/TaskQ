const pool = require('../db/pool');

/**
 * ARCHITECTURE EXPLANATION:
 * 
 * Why Postgres (not just Redis) is the source of truth for job HISTORY specifically:
 * 
 * Redis is designed for high-throughput, low-latency in-memory data structures. It is ideal
 * for holding the ACTIVE queue state (which jobs are currently waiting, executing, or delayed).
 * Once a job is successfully executed or permanently fails, keeping it in Redis consumes
 * expensive RAM for no active operational benefit.
 * 
 * Postgres, being a persistent disk-based relational database, is suited for long-term historical records.
 * We store every job's full history (payload, retry attempts, completed timestamps, error logs) in Postgres.
 * This allows the React dashboard to load historical stats, enables deep debugging on past jobs, and
 * helps answer questions like "what happened to job X yesterday?" without clogging up Redis memory.
 */

/**
 * Creates a new job record in the database with status = 'queued' and attempts = 0.
 * @param {Object} job
 * @param {string} job.id - Unique UUID of the job
 * @param {string} job.type - The task type (e.g. 'sendEmail')
 * @param {Object} job.payload - The job parameters/arguments
 * @param {number} [job.priority=5] - Job priority (lower = higher priority)
 * @returns {Promise<Object>} The inserted database row
 */
async function createJobRecord({ id, type, payload, priority }) {
  const query = `
    INSERT INTO jobs (id, type, payload, priority, status, attempts, created_at)
    VALUES ($1, $2, $3, $4, 'queued', 0, NOW())
    RETURNING *;
  `;
  
  const values = [
    id, 
    type, 
    JSON.stringify(payload), 
    priority !== undefined ? priority : 5
  ];
  
  const res = await pool.query(query, values);
  return res.rows[0];
}

/**
 * Updates the status and other execution properties of a job.
 * @param {string} id - The UUID of the job to update
 * @param {string} status - New job status ('queued' | 'processing' | 'completed' | 'retrying' | 'dead_letter')
 * @param {Object} [extra={}] - Optional fields to update
 * @param {number} [extra.attempts] - Number of execution attempts so far
 * @param {string} [extra.errorMessage] - Failure message to record
 * @param {Date} [extra.completedAt] - Timestamp when the job completed (success or DLQ)
 * @returns {Promise<Object>} The updated database row
 */
async function updateJobStatus(id, status, extra = {}) {
  const fields = ['status = $1'];
  const values = [status];
  let paramCount = 2;

  if (extra.attempts !== undefined) {
    fields.push(`attempts = $${paramCount}`);
    values.push(extra.attempts);
    paramCount++;
  }

  if (extra.errorMessage !== undefined) {
    fields.push(`error_message = $${paramCount}`);
    values.push(extra.errorMessage);
    paramCount++;
  } else if (extra.errorMessage === null) {
    fields.push(`error_message = NULL`);
  }

  if (extra.completedAt !== undefined) {
    fields.push(`completed_at = $${paramCount}`);
    values.push(extra.completedAt);
    paramCount++;
  } else if (extra.completedAt === null) {
    fields.push(`completed_at = NULL`);
  }

  values.push(id);
  const query = `
    UPDATE jobs
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *;
  `;
  
  const res = await pool.query(query, values);
  return res.rows[0];
}

/**
 * Fetches a single job by its ID.
 * @param {string} id - Job UUID
 * @returns {Promise<Object|null>} The job row or null if not found
 */
async function getJobById(id) {
  const res = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/**
 * Retrieves aggregate counts of all jobs grouped by their status.
 * @returns {Promise<Object>} Object showing count per status
 */
async function getJobCountsByStatus() {
  const res = await pool.query('SELECT status, COUNT(*) FROM jobs GROUP BY status');
  
  const counts = {
    queued: 0,
    processing: 0,
    completed: 0,
    retrying: 0,
    dead_letter: 0
  };
  
  for (const row of res.rows) {
    if (counts[row.status] !== undefined) {
      counts[row.status] = parseInt(row.count, 10);
    }
  }
  
  return counts;
}

module.exports = {
  createJobRecord,
  updateJobStatus,
  getJobById,
  getJobCountsByStatus
};
