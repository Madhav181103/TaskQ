const { updateJobStatus } = require('./jobStoreService');

/**
 * Stub for handleJobFailure. Will be fully implemented in Chunk 4.1.
 * Currently log the failure and mark the job as 'dead_letter' in Postgres.
 */
async function handleJobFailure(job, error) {
  console.log(`[retryService Stub] Job ${job.id} failed: ${error.message}`);
  
  // Temporary behavior until Chunk 4.1 implements actual retries and backoff:
  // Move failed job immediately to dead_letter.
  try {
    await updateJobStatus(job.id, 'dead_letter', {
      errorMessage: error.message,
      completedAt: new Date()
    });
    console.log(`[retryService Stub] Job ${job.id} marked as dead_letter in DB.`);
  } catch (dbError) {
    console.error(`[retryService Stub] Failed to update status in DB:`, dbError.message);
  }
}

module.exports = {
  handleJobFailure
};
