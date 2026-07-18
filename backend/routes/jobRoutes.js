const express = require('express');
const router = express.Router();
const { enqueueJob } = require('../services/queueService');
const { getJobById } = require('../services/jobStoreService');
const handlers = require('../handlers');

// POST /api/jobs - Enqueue a new job in the priority queue
router.post('/jobs', async (req, res, next) => {
  try {
    const { type, payload, priority } = req.body;

    // 1. Validate job type
    if (!type || !handlers[type]) {
      return res.status(400).json({ error: `Unknown or missing job type: "${type}"` });
    }

    // 2. Validate payload
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid payload. Must be an object.' });
    }

    // 3. Resolve priority (Ensure 0 is processed correctly and doesn't fall back to 5)
    const resolvedPriority = (priority !== undefined && !isNaN(priority)) ? parseInt(priority, 10) : 5;

    // 4. Enqueue the job
    const jobId = await enqueueJob({
      type,
      payload,
      priority: resolvedPriority
    });

    return res.status(201).json({ jobId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});

// GET /api/jobs/:id - Retrieve status and details of a specific job
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await getJobById(id);

    if (!job) {
      return res.status(404).json({ error: `Job with ID "${id}" not found.` });
    }

    return res.json(job);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
