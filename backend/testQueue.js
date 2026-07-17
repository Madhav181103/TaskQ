const queueService = require('./services/queueService');
const pool = require('./db/pool');

async function test() {
  console.log('--- Testing QueueService ---');
  try {
    // 1. Enqueue a job
    console.log('\n[1] Enqueueing high priority job (priority: 3)...');
    const id1 = await queueService.enqueueJob({
      type: 'resizeImage',
      payload: { src: 'avatar.png', width: 200 },
      priority: 3
    });
    console.log('Job 1 enqueued. ID:', id1);

    console.log('\n[2] Enqueueing critical priority job (priority: 1)...');
    const id2 = await queueService.enqueueJob({
      type: 'sendEmail',
      payload: { email: 'admin@example.com' },
      priority: 1
    });
    console.log('Job 2 enqueued. ID:', id2);

    // Verify sorted set scores
    const score1 = await queueService.redis.zscore(queueService.QUEUE_KEY, id1);
    const score2 = await queueService.redis.zscore(queueService.QUEUE_KEY, id2);
    console.log(`\nRedis ZSET Priority check:`);
    console.log(`- Job 1 (${id1}) score:`, score1);
    console.log(`- Job 2 (${id2}) score:`, score2);

    // 3. Dequeue (should pop priority 1 first)
    console.log('\n[3] Dequeuing first job (should be Job 2 with priority 1)...');
    const poppedJob1 = await queueService.dequeueJob();
    console.log('First popped job:', poppedJob1);

    // Verify it's in the processing hash
    const startTimestamp = await queueService.redis.hget(queueService.PROCESSING_KEY, poppedJob1.id);
    console.log('Popped job timestamp in processing hash:', startTimestamp);

    // 4. Dequeue second job (should pop priority 3)
    console.log('\n[4] Dequeuing second job (should be Job 1 with priority 3)...');
    const poppedJob2 = await queueService.dequeueJob();
    console.log('Second popped job:', poppedJob2);

    // 5. Mark Job 2 done
    console.log(`\n[5] Marking Job 2 (${poppedJob1.id}) done...`);
    await queueService.markJobDone(poppedJob1.id);

    const inProcessing = await queueService.redis.hexists(queueService.PROCESSING_KEY, poppedJob1.id);
    const hasData = await queueService.redis.exists(`${queueService.JOB_DATA_PREFIX}${poppedJob1.id}`);
    console.log('Is Job 2 still in processing hash?', inProcessing ? 'Yes' : 'No');
    console.log('Do Job 2 details still exist in Redis?', hasData ? 'Yes' : 'No');

    // Clean up Job 1
    await queueService.markJobDone(poppedJob2.id);

    console.log('\n✅ QueueService verification test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed. Details:', error);
  } finally {
    queueService.redis.disconnect();
    await pool.end();
    console.log('Connections closed.');
  }
}

test();
