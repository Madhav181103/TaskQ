const { updateJobStatus } = require('./jobStoreService');
const { redis, PROCESSING_KEY, JOB_DATA_PREFIX } = require('./queueService');

/**
 * Stub for moveToDeadLetter. Will be fully implemented in Chunk 4.2.
 * Currently updates Postgres status to 'dead_letter' and cleans up Redis active keys.
 */
async function moveToDeadLetter(job, error) {
  console.log(`[deadLetterService Stub] Moving job ${job.id} to Dead-Letter Queue. Error: ${error.message}`);

  // 1. Update Postgres status to 'dead_letter' with error details
  await updateJobStatus(job.id, 'dead_letter', {
    errorMessage: error.message,
    completedAt: new Date()
  });

  // 2. Remove job from active Redis sets (processing and job details)
  await Promise.all([
    redis.hdel(PROCESSING_KEY, job.id),
    redis.del(`${JOB_DATA_PREFIX}${job.id}`)
  ]);

  console.log(`[deadLetterService Stub] Job ${job.id} clean up complete.`);
}

module.exports = {
  moveToDeadLetter
};
