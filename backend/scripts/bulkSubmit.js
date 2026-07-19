/**
 * bulkSubmit.js — TaskQ Bulk Job Submission Script
 * =================================================
 * Submits 100 jobs (mix of sendEmail + resizeImage, random priorities 1–10)
 * via HTTP POST to /api/jobs and measures total enqueue time.
 *
 * Usage:
 *   node backend/scripts/bulkSubmit.js
 *
 * Prerequisites:
 *   - backend server must be running on localhost:8000
 *   - No extra npm packages required — uses Node's built-in `http` module
 */

'use strict';

const http = require('http');

// ── Configuration ────────────────────────────────────────────────────────────

const API_HOST     = 'localhost';
const API_PORT     = 8000;
const API_PATH     = '/api/jobs';
const TOTAL_JOBS   = 100;

// Sample payloads — realistic but lightweight so handler latency doesn't
// inflate the enqueue-speed measurement unfairly
const JOB_TEMPLATES = [
  {
    type: 'sendEmail',
    makePayload: (i) => ({
      to: `user${i}@loadtest.internal`,
      subject: `TaskQ Load Test — Job #${i}`,
    }),
  },
  {
    type: 'resizeImage',
    makePayload: (i) => ({
      src: `https://picsum.photos/seed/${i}/800/600`,
      width: 200 + (i % 5) * 100,   // 200 | 300 | 400 | 500 | 600
    }),
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a random integer in [min, max] inclusive.
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sends a single POST /api/jobs request.
 * @param {object} body - The JSON body to send.
 * @returns {Promise<object>} Resolves with the parsed JSON response body.
 */
function postJob(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const options = {
      hostname: API_HOST,
      port:     API_PORT,
      path:     API_PATH,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         TaskQ — Bulk Job Submission Script               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Target : http://${API_HOST}:${API_PORT}${API_PATH}`);
  console.log(`  Jobs   : ${TOTAL_JOBS} (mix of sendEmail + resizeImage)`);
  console.log(`  Prio   : random 1–10 per job`);
  console.log('');
  console.log('  Submitting...');
  console.log('');

  let successCount = 0;
  let failCount    = 0;
  const errors     = [];

  // ── Time the entire submission batch ──────────────────────────────────────
  const startMs = Date.now();

  for (let i = 1; i <= TOTAL_JOBS; i++) {
    // Alternate between the two job types for a 50/50 mix
    const template = JOB_TEMPLATES[i % 2];
    const priority = randInt(1, 10);
    const body = {
      type:     template.type,
      payload:  template.makePayload(i),
      priority,
    };

    try {
      const { statusCode, body: responseBody } = await postJob(body);

      if (statusCode === 201 || statusCode === 200) {
        successCount++;
        // Log every 10th submission so the terminal isn't a wall of text
        if (i % 10 === 0) {
          const jobId = responseBody.jobId || '?';
          console.log(`  [${i.toString().padStart(3, ' ')}/${TOTAL_JOBS}] ✓ ${template.type.padEnd(14)} priority=${priority}  jobId=${jobId}`);
        }
      } else {
        failCount++;
        errors.push(`Job ${i}: HTTP ${statusCode} — ${JSON.stringify(responseBody)}`);
      }
    } catch (err) {
      failCount++;
      errors.push(`Job ${i}: Network error — ${err.message}`);
    }
  }

  const elapsedMs  = Date.now() - startMs;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);
  const avgMs      = (elapsedMs / TOTAL_JOBS).toFixed(1);

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('──────────────────────────────────────────────────────────');
  console.log('  SUBMISSION COMPLETE');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  ✓ Submitted successfully : ${successCount}`);
  console.log(`  ✗ Failed                 : ${failCount}`);
  console.log(`  ⏱  Total enqueue time    : ${elapsedSec}s  (${elapsedMs}ms)`);
  console.log(`  ⚡ Average per job       : ${avgMs}ms`);
  console.log('');

  if (errors.length > 0) {
    console.log('  Errors:');
    errors.forEach((e) => console.log(`    • ${e}`));
    console.log('');
  }

  console.log('  ✅  100 jobs submitted — watch the dashboard or run:');
  console.log('      GET http://localhost:8000/api/stats');
  console.log('      to see them processed in real-time.');
  console.log('');
  console.log('  📋  Benchmark tip:');
  console.log('      Note the wall-clock time from NOW until the');
  console.log('      "completed" count in /api/stats stops changing.');
  console.log('      That is your "Time to Complete All" figure for benchmark.md.');
  console.log('');
  console.log('  Submission start timestamp (copy into benchmark.md):');
  console.log(`      ${new Date(startMs).toISOString()}`);
  console.log('');
}

main().catch((err) => {
  console.error('[bulkSubmit] Fatal error:', err.message);
  process.exit(1);
});
