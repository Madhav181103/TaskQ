/**
 * Simulated handler for resizing images.
 * Uses an artificial delay and a random failure rate to mimic realistic CPU-bound image manipulation.
 */
async function resizeImageHandler(payload) {
  const src = payload.src || 'unknown';
  console.log(`[resizeImageHandler] Starting job. Resizing: ${src}`);

  // Await a 600ms artificial delay to simulate image processing workloads
  await new Promise(resolve => setTimeout(resolve, 600));

  // ── Deterministic Demo Rules ──
  if (src === 'always-fail.png') {
    throw new Error('Failed to read image header. Image file is corrupted.');
  }

  // Normal behavior fallback (10% random failure for non-demo files)
  const isDemoSuccessSrc = src.startsWith('success');
  if (!isDemoSuccessSrc && Math.random() < 0.1) {
    throw new Error('Failed to read image buffer. File may be corrupted.');
  }

  console.log(`[resizeImageHandler] Success! Image resized to ${payload.width || 'default'}px.`);
}

module.exports = resizeImageHandler;
