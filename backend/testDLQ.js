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
    console.log('\n[1] Enqueuing test job...');
    await queueService.enqueueJob(testJob);

    // Dequeue to simulate it being active (moves to processing hash)
    await queueService.dequeueJob();

    // 2. Simulate complete failure (exceeding attempts)
    console.log('\n[2] Simulating max failures. Moving job to Dead-Letter Queue...');
    await deadLetterService.moveToDeadLetter(testJob, new Error('SMTP connection rejected.'));

    // 3. Retrieve DLQ list
    console.log('\n[3] Fetching all jobs in the Dead-Letter Queue...');
    const dlqJobs = await deadLetterService.getDeadLetterJobs();
    console.log('Current DLQ Jobs:', dlqJobs);

    const exists = dlqJobs.some(j => j.id === jobId);
    console.log(`Is our test job in DLQ? ${exists ? 'Yes' : 'No'}`);

    // 4. Retry the job
    console.log('\n[4] Retrying the dead-lettered job...');
    await deadLetterService.retryDeadLetterJob(jobId);

    // Verify it is removed from DLQ
    const dlqJobsAfter = await deadLetterService.getDeadLetterJobs();
    const stillExists = dlqJobsAfter.some(j => j.id === jobId);
    console.log(`Is our test job still in DLQ? ${stillExists ? 'Yes' : 'No'}`);

    // Verify it's back in the active queue ZSET
    const score = await queueService.redis.zscore(queueService.QUEUE_KEY, jobId);
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
