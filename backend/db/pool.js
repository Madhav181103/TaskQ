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

// Auto-initialize the database schema if running in production or on a new setup
pool.initSchema = async () => {
  const fs = require('fs');
  const path = require('path');
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('[Postgres] Database schema verified/initialized successfully.');
  } catch (err) {
    console.error('[Postgres] Schema initialization error:', err.message);
  }
};

module.exports = pool;
