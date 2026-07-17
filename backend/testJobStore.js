const { v4: uuidv4 } = require('uuid');
const jobStore = require('./services/jobStoreService');
const pool = require('./db/pool');

async function test() {
  const jobId = uuidv4();
  console.log(`--- Testing JobStoreService ---`);
  console.log(`Using Test Job ID: ${jobId}`);

  try {
    // 1. Create a job
    console.log('\n[1] Creating job record...');
    const newJob = await jobStore.createJobRecord({
      id: jobId,
      type: 'sendEmail',
      payload: { email: 'test@example.com', subject: 'Verification' },
      priority: 2
    });
    console.log('Created Job Row:', newJob);

    // 2. Fetch the job details
    console.log('\n[2] Fetching job record...');
    const fetchedJob = await jobStore.getJobById(jobId);
    console.log('Fetched Job Row:', fetchedJob);

    // 3. Update job to completed
    console.log('\n[3] Updating job status to "completed"...');
    const updatedJob = await jobStore.updateJobStatus(jobId, 'completed', {
      completedAt: new Date()
    });
    console.log('Updated Job Row:', updatedJob);

    // 4. Retrieve job counts grouped by status
    console.log('\n[4] Fetching all job counts...');
    const counts = await jobStore.getJobCountsByStatus();
    console.log('Current Counts:', counts);

    console.log('\n✅ JobStoreService verification test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed. Details:', error);
  } finally {
    // Shutdown postgres connection pool
    await pool.end();
    console.log('Database pool connection closed.');
  }
}

test();
