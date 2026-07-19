/**
 * demoSubmit.js — TaskQ 12-Job Interview Demonstration Script
 * ==========================================================
 * Submits exactly 12 pre-configured jobs to demonstrate:
 *   - Priority sorting (1 to 10)
 *   - Flaky retries with exponential backoff
 *   - Max attempts exhaustion and move to DLQ
 *   - Immediate DLQ routing for invalid types
 *
 * Usage:
 *   node backend/scripts/demoSubmit.js
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 8000;
const API_PATH = '/api/jobs';

const JOBS = [
  // Priority sorting demonstration targets
  { type: 'resizeImage', priority: 8, payload: { src: 'success1.png', width: 200 } },
  { type: 'sendEmail', priority: 9, payload: { to: 'success2@demo.com' } },
  { type: 'resizeImage', priority: 5, payload: { src: 'success3.png', width: 300 } },
  { type: 'sendEmail', priority: 2, payload: { to: 'success4@demo.com' } },
  { type: 'resizeImage', priority: 1, payload: { src: 'success5.png', width: 500 } },
  
  // Fail-once retry target (Temporary failure)
  { type: 'sendEmail', priority: 4, payload: { to: 'retry-once@demo.com' } },
  
  // Permanent failure target (Will exhaust attempts and go to DLQ)
  { type: 'sendEmail', priority: 3, payload: { to: 'always-fail@demo.com' } },
  
  // Unregistered type target (Moves directly to DLQ immediately)
  { type: 'invalidType', priority: 6, payload: { info: 'Trigger immediate DLQ' } },
  
  // More priority metrics targets
  { type: 'sendEmail', priority: 7, payload: { to: 'success6@demo.com' } },
  { type: 'resizeImage', priority: 10, payload: { src: 'success7.png', width: 600 } },
  { type: 'sendEmail', priority: 3, payload: { to: 'success8@demo.com' } },
  { type: 'resizeImage', priority: 2, payload: { src: 'success9.png', width: 400 } },
];

function postJob(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('       TaskQ — 12-Job Interview Demo Submission       ');
  console.log('======================================================\n');
  
  for (let i = 0; i < JOBS.length; i++) {
    const job = JOBS[i];
    try {
      await postJob(job);
      const targetName = job.payload.to || job.payload.src || job.payload.info || 'N/A';
      console.log(`  [+] Job ${i + 1}/12 submitted -> Type: ${job.type.padEnd(12)} | Priority: ${job.priority.toString().padEnd(2)} | Target: ${targetName}`);
    } catch (err) {
      console.error(`  [X] Error enqueuing job ${i + 1}:`, err.message);
    }
  }
  
  console.log('\n✅ All 12 demo jobs successfully queued! Start the worker process to process.');
  console.log('   Watch the dashboard UI at http://localhost:5173/\n');
}

main().catch(console.error);
