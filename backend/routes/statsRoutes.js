const express = require('express');
const router = express.Router();
const { getJobCountsByStatus } = require('../services/jobStoreService');
const { getDeadLetterJobs, retryDeadLetterJob } = require('../services/deadLetterService');
const { redis } = require('../services/queueService');

// GET /api/stats - Get count of all jobs grouped by status for dashboard charts/summaries
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getJobCountsByStatus();
    return res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/deadletter - Get all jobs currently resting in the Dead-Letter Queue
router.get('/deadletter', async (req, res, next) => {
  try {
    const deadJobs = await getDeadLetterJobs();
    return res.json(deadJobs);
  } catch (error) {
    next(error);
  }
});

// POST /api/deadletter/:id/retry - Manually trigger a retry for a dead-lettered job
router.post('/deadletter/:id/retry', async (req, res, next) => {
  try {
    const { id } = req.params;
    await retryDeadLetterJob(id);
    return res.json({ message: 'Job re-queued' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// GET /api/logs - Retrieve the last 100 log messages in chronological order (oldest first)
router.get('/logs', async (req, res, next) => {
  try {
    const logs = await redis.lrange('taskq:logs', 0, -1);
    // Since we LPUSH'ed them, index 0 is the newest.
    // We reverse the array to display them chronologically (oldest at the top, newest at the bottom).
    return res.json(logs.reverse());
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs - Clear the console log buffer in Redis
router.delete('/logs', async (req, res, next) => {
  try {
    await redis.del('taskq:logs');
    return res.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
