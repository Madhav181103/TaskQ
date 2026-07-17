const config = require('../config');
const { getJobById, updateJobStatus } = require('./jobStoreService');
const { redis, PROCESSING_KEY } = require('./queueService');
const { moveToDeadLetter } = require('./deadLetterService');

const DELAYED_KEY = 'taskq:delayed';

/**
 * Calculates exponential backoff delay in seconds.
 * Formula: delay = base ^ attemptNumber
 * @param {number} attemptNumber - The current retry attempt index (1-indexed)
 * @returns {number} Delay duration in seconds
 */
function calculateBackoffDelaySeconds(attemptNumber) {
  return Math.pow(config.retryBackoffBaseSeconds, attemptNumber);
}

/**
 * Decides whether to retry a failed job with backoff delay, or dead-letter it.
 * @param {Object} job - The job payload object containing id
 * @param {Error} error - The execution failure error details
 * @param {number} [currentAttempts] - Optional pre-fetched retry attempts count
 */
async function handleJobFailure(job, error, currentAttempts) {
  let attempts = currentAttempts;

  // If attempts count wasn't pre-fetched, query the persistent Postgres record
  if (attempts === undefined) {
    const dbJob = await getJobById(job.id);
    attempts = dbJob ? dbJob.attempts : 0;
  }

  const nextAttempt = attempts + 1;

  // If maximum retry threshold exceeded, move the job permanently to DLQ
  if (nextAttempt > config.maxRetryAttempts) {
    console.log(`[retryService] Job ${job.id} exceeded max retries (${config.maxRetryAttempts}). Moving to DLQ.`);
    await moveToDeadLetter(job, error);
    return;
  }

  console.log(`[retryService] Job ${job.id} failed. Scheduling retry #${nextAttempt}...`);

  // 1. Update Postgres state: status='retrying', attempts=nextAttempt, error_message=error.message
  await updateJobStatus(job.id, 'retrying', {
    attempts: nextAttempt,
    errorMessage: error.message
  });

  // 2. Calculate delay in seconds
  const delaySeconds = calculateBackoffDelaySeconds(nextAttempt);

  // 3. Remove the job from the active processing hash set
  await redis.hdel(PROCESSING_KEY, job.id);

  // 4. Add the job back to Redis inside the delayed set.
  // Score = current Unix timestamp + delaySeconds
  const triggerUnixTime = Math.floor(Date.now() / 1000) + delaySeconds;

  /**
   * DELAYED QUEUE DESIGN NOTE:
   * 
   * We use a Redis Sorted Set ('taskq:delayed') to store delayed jobs.
   * 
   * Rationale:
   * This reuses the exact same sorted-set-as-heap idea from the main priority queue.
   * However, instead of storing "priority" as the score, we store the "absolute unix epoch timestamp
   * (in seconds) when the job is next eligible to run" as the score.
   * 
   * A scheduler process will query this set sorted by score (time). The scheduler will look for
   * elements whose score is <= current_timestamp, pop them, and move them back to the active queue.
   * This is an extremely elegant and standard way to implement delays and scheduled tasks in Redis.
   */
  await redis.zadd(DELAYED_KEY, triggerUnixTime, job.id);
  
  console.log(`[retryService] Job ${job.id} delayed by ${delaySeconds}s (trigger time: ${triggerUnixTime}).`);
}

module.exports = {
  calculateBackoffDelaySeconds,
  handleJobFailure
};
