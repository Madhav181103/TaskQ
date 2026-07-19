'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');

const jobRoutes = require('./routes/jobRoutes');
const statsRoutes = require('./routes/statsRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Enable CORS for dashboard client
app.use(cors({
  origin: config.clientUrl,
}));

// Parse JSON request bodies
app.use(express.json());

// API Routes
app.use('/api', jobRoutes);
app.use('/api', statsRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'TaskQ API running' });
});

// Global error handler — must be the LAST app.use() so that errors
// forwarded via next(err) from any route or middleware land here.
app.use(errorHandler);

const pool = require('./db/pool');

// Listen on configured port
app.listen(config.port, async () => {
  console.log(`Server is running on port ${config.port}`);
  await pool.initSchema();
});
