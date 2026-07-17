const { redis, QUEUE_KEY, JOB_DATA_PREFIX } = require('./queueService');
const { updateJobStatus } = require('./jobStoreService');

const DELAYED_KEY = 'taskq:delayed';

/**
 * SCHEDULER SYSTEM DESIGN NOTE:
 * 
 * Why this needs to be a SEPARATE periodic loop rather than checked inline by workers:
 * 
 * Delayed jobs are not tied to any specific worker or active execution thread. If workers only
 * checked inline when they completed their current job:
 * 1. If all workers are idle (no jobs in the active queue), no one is completing jobs, so the
 *    delayed queue would never be checked. Delayed jobs would remain stuck forever (deadlock).
 * 2. Checking inline adds non-essential latency and race conditions to the core worker loop.
 * 
 * Instead, the scheduler runs as a separate, periodic background loop (similar to a cron job).
 * It runs independently at a fixed frequency, checking the delayed set, promoting expired items,
 * and pushing them back to the active queue. This ensures that timed events and backoffs trigger
 * predictably and reliably even if all workers are currently idle or saturated.
 */
async function promoteDueJobs() {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    // 1. Fetch all job IDs whose scheduled time has passed
    const dueJobIds = await redis.zrangebyscore(DELAYED_KEY, 0, now);
    
    if (dueJobIds.length === 0) {
      return;
    }
    
    console.log(`[Scheduler] Found ${dueJobIds.length} due job(s) for promotion.`);
    let promotedCount = 0;

    for (const jobId of dueJobIds) {
      // 2. Atomically remove from delayed set to prevent double promotion in case of multiple scheduler instances
      const removed = await redis.zrem(DELAYED_KEY, jobId);
      
      if (removed === 1) {
        // 3. Retrieve original priority from stored job details in Redis
        const jobDetailsStr = await redis.get(`${JOB_DATA_PREFIX}${jobId}`);
        if (!jobDetailsStr) {
          console.error(`[Scheduler] Warning: Job details for ${jobId} not found in Redis. Skipping.`);
          continue;
        }

        const { priority } = JSON.parse(jobDetailsStr);
        const resolvedPriority = priority !== undefined ? priority : 5;

        // 4. Re-add to the main active priority queue
        await redis.zadd(QUEUE_KEY, resolvedPriority, jobId);

        // 5. Update Postgres status back to 'queued' for permanent tracking
        await updateJobStatus(jobId, 'queued');

        console.log(`[Scheduler] Promoted job ${jobId} back to active queue (Priority: ${resolvedPriority})`);
        promotedCount++;
      }
    }
    
    if (promotedCount > 0) {
      console.log(`[Scheduler] Cycle complete. Promoted ${promotedCount} job(s).`);
    }
  } catch (error) {
    console.error('[Scheduler] Error in promote cycle:', error.message);
  }
}

/**
 * Starts the scheduler loop on an interval.
 * @param {number} [intervalMs=1000] - Polling frequency
 */
function startScheduler(intervalMs = 1000) {
  console.log(`[Scheduler] Scheduler service started. Scanning for due delayed jobs every ${intervalMs}ms...`);
  setInterval(promoteDueJobs, intervalMs);
}

module.exports = {
  promoteDueJobs,
  startScheduler
};
