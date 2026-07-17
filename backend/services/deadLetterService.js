const { updateJobStatus } = require('./jobStoreService');
const { redis, QUEUE_KEY, PROCESSING_KEY, JOB_DATA_PREFIX } = require('./queueService');

const DLQ_LIST_KEY = 'taskq:deadletter';

/**
 * DEAD-LETTER QUEUE DESIGN NOTE:
 * 
 * Why dead-lettering is better than retrying forever or silently dropping the job:
 * 
 * 1. Retrying forever: Wastes system resources (CPU, Database connections, Worker pool threads)
 *    continually executing a task that is permanently broken (e.g., due to bad payloads, 
 *    removed endpoints, database validation rules). This reduces queue capacity for other valid jobs.
 * 2. Silently dropping: Makes debugging impossible. When a job silently vanishes, operators have no
 *    record of the failure, what parameters were passed, or what error was thrown.
 * 
 * Dead-lettering provides a clean solution: it isolates the permanently failing job,
 * halts active execution, preserves the original payload and priority, and attaches the final error trace.
 * This allows human operators to inspect the failure, fix dependencies or payloads, and manually trigger a retry.
 */

/**
 * Moves a permanently failed job to the DLQ.
 * @param {Object} job - The job payload
 * @param {Error} error - The final execution error
 */
async function moveToDeadLetter(job, error) {
  console.log(`[DLQ] Moving job ${job.id} to Dead-Letter Queue. Error: ${error.message}`);

  const dlqData = JSON.stringify({
    id: job.id,
    type: job.type,
    payload: job.payload,
    errorMessage: error.message,
    failedAt: new Date(),
    priority: job.priority || 5
  });

  // 1. Push into Redis list 'taskq:deadletter'
  await redis.lpush(DLQ_LIST_KEY, dlqData);

  // 2. Update Postgres status to 'dead_letter' with final error details
  await updateJobStatus(job.id, 'dead_letter', {
    errorMessage: error.message,
    completedAt: new Date()
  });

  // 3. Remove from active execution tracking sets in Redis
  await Promise.all([
    redis.hdel(PROCESSING_KEY, job.id),
    redis.del(`${JOB_DATA_PREFIX}${job.id}`)
  ]);

  console.log(`[DLQ] Job ${job.id} successfully dead-lettered.`);
}

/**
 * Returns all dead letter jobs.
 * @returns {Promise<Array>} List of parsed DLQ job objects
 */
async function getDeadLetterJobs() {
  const list = await redis.lrange(DLQ_LIST_KEY, 0, -1);
  return list.map(item => JSON.parse(item));
}

/**
 * Removes a job from the DLQ and re-enqueues it fresh.
 * @param {string} jobId - The UUID of the job to retry
 */
async function retryDeadLetterJob(jobId) {
  console.log(`[DLQ] Manual retry requested for job: ${jobId}`);

  // 1. Find and remove matching entry from DLQ list
  const list = await redis.lrange(DLQ_LIST_KEY, 0, -1);
  let targetItemStr = null;
  let jobData = null;

  for (const itemStr of list) {
    const parsed = JSON.parse(itemStr);
    if (parsed.id === jobId) {
      targetItemStr = itemStr;
      jobData = parsed;
      break;
    }
  }

  if (!targetItemStr || !jobData) {
    throw new Error(`Job ${jobId} not found in Dead-Letter Queue.`);
  }

  // Remove exactly one instance of this item from DLQ list
  await redis.lrem(DLQ_LIST_KEY, 1, targetItemStr);

  // 2. Re-enqueue the job fresh under the SAME ID to preserve history
  // Restore details to Redis
  const jobDetails = JSON.stringify({
    id: jobId,
    type: jobData.type,
    payload: jobData.payload,
    priority: jobData.priority || 5
  });
  
  await redis.set(`${JOB_DATA_PREFIX}${jobId}`, jobDetails);
  
  // ZADD back to main active queue ZSET
  await redis.zadd(QUEUE_KEY, jobData.priority || 5, jobId);

  // 3. Reset attempts to 0 and status back to 'queued' in Postgres
  await updateJobStatus(jobId, 'queued', {
    attempts: 0,
    errorMessage: null,
    completedAt: null
  });

  console.log(`[DLQ] Job ${jobId} successfully re-enqueued for retry.`);
  return jobId;
}

module.exports = {
  moveToDeadLetter,
  getDeadLetterJobs,
  retryDeadLetterJob
};
