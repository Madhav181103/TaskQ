const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { createJobRecord } = require('./jobStoreService');

// Initialize the Redis client using configuration URL
const redis = new Redis(config.redisUrl);

// Constants for Redis keys
const QUEUE_KEY = 'taskq:queue';
const PROCESSING_KEY = 'taskq:processing';
const JOB_DATA_PREFIX = 'taskq:job:';

/**
 * DESIGN & ALGORITHM NOTE:
 * 
 * Why we store priority as the ZSET score directly:
 * 
 * Implementing a custom priority queue or heap in Node.js memory would be highly inefficient and
 * impossible to coordinate across multiple decentralized worker processes.
 * 
 * Instead, we use Redis Sorted Sets (ZSETs). A ZSET acts as a distributed heap-like structure
 * out-of-the-box. Inserts (ZADD) and Popping the minimum element (ZPOPMIN) operate at O(log N) time
 * complexity, which scales perfectly.
 * 
 * By using the priority number as the ZSET score, we implement a min-priority queue:
 * - Lower priority number (e.g. 1) = higher priority (processed first).
 * - Higher priority number (e.g. 10) = lower priority (processed later).
 * - A job with priority=1 will jump ahead of a job with priority=5.
 */

/**
 * Enqueues a new job into the priority queue.
 * @param {Object} job
 * @param {string} job.type - The type of task (e.g. "sendEmail")
 * @param {Object} job.payload - Data parameters required by the job
 * @param {number} [job.priority=5] - Priority score (lower = processed sooner)
 * @returns {Promise<string>} The generated UUID of the enqueued job
 */
async function enqueueJob({ type, payload, priority = 5 }) {
  const id = uuidv4();

  // 1. Create the permanent job record in Postgres (default status 'queued')
  await createJobRecord({ id, type, payload, priority });

  // 2. Save the quick-access job payload string in Redis
  const jobDetails = JSON.stringify({ id, type, payload, priority });
  await redis.set(`${JOB_DATA_PREFIX}${id}`, jobDetails);

  // 3. Push to priority queue (ZSET) in Redis using priority as the score
  await redis.zadd(QUEUE_KEY, priority, id);

  return id;
}

module.exports = {
  redis,
  QUEUE_KEY,
  PROCESSING_KEY,
  JOB_DATA_PREFIX,
  enqueueJob
};
