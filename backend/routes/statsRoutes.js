const express = require('express');
const router = express.Router();
const { getJobCountsByStatus } = require('../services/jobStoreService');
const { getDeadLetterJobs, retryDeadLetterJob } = require('../services/deadLetterService');

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

module.exports = router;
