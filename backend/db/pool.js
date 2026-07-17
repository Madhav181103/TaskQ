const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Idle clients can encounter errors due to network interruptions or backend database timeouts.
// Logging the error prevents the idle client error from propagating upwards and crashing the Node.js process.
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = pool;
