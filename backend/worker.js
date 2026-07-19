const config = require('./config');
const { dequeueJob, markJobDone, redis } = require('./services/queueService');
const handlers = require('./handlers');
const { updateJobStatus } = require('./services/jobStoreService');
const { handleJobFailure } = require('./services/retryService');
const { startScheduler } = require('./services/schedulerService');

// Capture console logs and stream them to Redis for the frontend dashboard terminal.
// Keeps the latest 100 log messages in taskq:logs.
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  redis.lpush('taskq:logs', `[LOG] ${message}`).then(() => {
    redis.ltrim('taskq:logs', 0, 99);
  }).catch(err => originalError('Log capture failed:', err));
};

console.error = (...args) => {
  originalError(...args);
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  redis.lpush('taskq:logs', `[ERROR] ${message}`).then(() => {
    redis.ltrim('taskq:logs', 0, 99);
  }).catch(err => originalError('Log capture failed:', err));
};


/**
 * Executes a single job from the queue if available.
 * @returns {Promise<boolean>} True if a job was processed, false if the queue was empty
 */
async function processOneJob() {
  // 1. Dequeue job atomically from Redis (moving it to processing)
  const job = await dequeueJob();
  if (!job) {
    return false; // Queue is empty
  }

  console.log(`[Worker] Dequeued Job ${job.id} [Type: ${job.type}]`);

  // 2. Resolve job handler in the registry
  const handler = handlers[job.type];
  if (!handler) {
    const errorMsg = `No handler registered for job type "${job.type}"`;
    console.error(`[Worker] Error: ${errorMsg}`);
    
    // Mark job as permanently failed in DB (bad type should not be retried)
    await updateJobStatus(job.id, 'dead_letter', {
      errorMessage: errorMsg,
      completedAt: new Date()
    });

    // Clean up from Redis
    await markJobDone(job.id);
    return true;
  }

  // 3. Update job status to 'processing' in Postgres
  await updateJobStatus(job.id, 'processing');

  // 4. Execute job handler
  try {
    await handler(job.payload);

    // Success: update DB status and clean up Redis
    await markJobDone(job.id);
    await updateJobStatus(job.id, 'completed', { completedAt: new Date() });
    
    console.log(`[Worker] Job ${job.id} completed successfully.`);
  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed execution: ${error.message}`);
    
    // Delegate failure handling to the retry service
    await handleJobFailure(job, error);
  }

  return true;
}

/**
 * Worker loop that polls for jobs repeatedly.
 * @param {number} workerId - Identifier for logging concurrency
 */
async function startWorkerLoop(workerId) {
  console.log(`[Worker ${workerId}] Loop initialized.`);
  
  while (true) {
    try {
      const processed = await processOneJob();
      
      // If queue is empty, wait for a short polling delay before checking again
      if (!processed) {
        /**
         * POLLING VS BLOCKING DESIGN NOTE:
         * 
         * We poll the queue with a 500ms delay when it is empty, instead of using blocking
         * Redis commands like BRPOP/BLMOVE.
         * 
         * Rationale:
         * For a learning and debugging project, simple polling is much easier to reason about,
         * trace, and shut down cleanly. It prevents threads/event loops from getting stuck in a blocked
         * state. While it introduces a maximum 500ms latency for new jobs when the queue is completely idle,
         * and generates minor poll traffic to Redis, this is a very acceptable tradeoff for simplicity.
         */
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (loopError) {
      console.error(`[Worker ${workerId}] Error in execution loop:`, loopError.message);
      // Wait a second before resuming the loop on server/network errors
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start the background scheduler service to promote due delayed jobs
startScheduler();

// Concurrency pool initialization
const concurrency = config.workerConcurrency;

console.log(`[System] Initializing worker pool with concurrency = ${concurrency}`);

const loops = [];
for (let i = 1; i <= concurrency; i++) {
  loops.push(startWorkerLoop(i));
}

/**
 * CONCURRENCY DESIGN NOTE:
 * 
 * We run multiple worker loops inside the same process (or across separate processes).
 * 
 * Rationale:
 * Because Redis ZPOPMIN is atomic, multiple loops can run in parallel and safely compete to pop jobs.
 * Redis guarantees that no two workers can ever pop the exact same job ID.
 * This allows us to achieve concurrent job execution out-of-the-box without needing any complex
 * application-level mutexes or locking mechanisms.
 */
Promise.all(loops).catch(err => {
  console.error('[System] Worker pool encountered a fatal error:', err);
});
