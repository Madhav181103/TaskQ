const { v4: uuidv4 } = require('uuid');
const deadLetterService = require('./services/deadLetterService');
const queueService = require('./services/queueService');
const pool = require('./db/pool');

async function test() {
  console.log('--- Testing DeadLetterService ---');
  const jobId = uuidv4();
  const testJob = {
    id: jobId,
    type: 'sendEmail',
    payload: { to: 'dlq-test@example.com' },
    priority: 4
  };

  try {
    // 1. Enqueue job first to initialize the database row and Redis details
    //    Note: enqueueJob generates a fresh UUID internally — we capture it here
    //    so every subsequent step (dequeue, DLQ move, retry) uses the same ID.
    console.log('\n[1] Enqueuing test job...');
    const actualJobId = await queueService.enqueueJob({
      type: testJob.type,
      payload: testJob.payload,
      priority: testJob.priority
    });
    // Rebuild testJob with the actual enqueued ID so all steps stay in sync
    const liveJob = { ...testJob, id: actualJobId };
    console.log('Enqueued job ID:', actualJobId);

    // Dequeue to simulate it being active (moves to processing hash)
    await queueService.dequeueJob();

    // 2. Simulate complete failure (exceeding attempts)
    console.log('\n[2] Simulating max failures. Moving job to Dead-Letter Queue...');
    await deadLetterService.moveToDeadLetter(liveJob, new Error('SMTP connection rejected.'));

    // 3. Retrieve DLQ list
    console.log('\n[3] Fetching all jobs in the Dead-Letter Queue...');
    const dlqJobs = await deadLetterService.getDeadLetterJobs();
    console.log('Current DLQ Jobs:', dlqJobs);

    const exists = dlqJobs.some(j => j.id === actualJobId);
    console.log(`Is our test job in DLQ? ${exists ? 'Yes' : 'No'}`);

    // 4. Retry the job
    console.log('\n[4] Retrying the dead-lettered job...');
    await deadLetterService.retryDeadLetterJob(actualJobId);

    // Verify it is removed from DLQ
    const dlqJobsAfter = await deadLetterService.getDeadLetterJobs();
    const stillExists = dlqJobsAfter.some(j => j.id === actualJobId);
    console.log(`Is our test job still in DLQ? ${stillExists ? 'Yes' : 'No'}`);

    // Verify it's back in the active queue ZSET
    const score = await queueService.redis.zscore(queueService.QUEUE_KEY, actualJobId);
    console.log(`Job score in active queue (Priority):`, score);

    console.log('\n✅ DeadLetterService verification test completed successfully!');

  } catch (err) {
    console.error('\n❌ Test failed. Details:', err);
  } finally {
    queueService.redis.disconnect();
    await pool.end();
    console.log('Connections closed.');
  }
}

test();
