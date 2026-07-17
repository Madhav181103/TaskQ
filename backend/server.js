const express = require('express');
const cors = require('cors');
const config = require('./config');

const app = express();

// Enable CORS for dashboard client
app.use(cors({
  origin: config.clientUrl,
}));

// Parse JSON request bodies
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'TaskQ API running' });
});

// Listen on configured port
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
