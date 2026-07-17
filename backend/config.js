const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the .env file in the current directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

// DATABASE_URL is strictly required
if (!process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL environment variable is missing.');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 8000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 3,
  retryBackoffBaseSeconds: parseInt(process.env.RETRY_BACKOFF_BASE_SECONDS, 10) || 2,
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 3,
  processingTimeoutSeconds: parseInt(process.env.PROCESSING_TIMEOUT_SECONDS, 10) || 30,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

module.exports = config;
