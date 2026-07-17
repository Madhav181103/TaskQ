/**
 * Simulated handler for resizing images.
 * Uses an artificial delay and a random failure rate to mimic realistic CPU-bound image manipulation.
 */
async function resizeImageHandler(payload) {
  console.log(`[resizeImageHandler] Starting job. Resizing: ${payload.src || 'unknown'}`);

  // Await a 600ms artificial delay to simulate image processing workloads
  await new Promise(resolve => setTimeout(resolve, 600));

  // Simulate a flaky dependency (10% failure rate) for testing retries
  if (Math.random() < 0.1) {
    throw new Error('Failed to read image buffer. File may be corrupted.');
  }

  console.log(`[resizeImageHandler] Success! Image resized to ${payload.width || 'default'}px.`);
}

module.exports = resizeImageHandler;
