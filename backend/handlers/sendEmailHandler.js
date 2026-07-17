/**
 * Simulated handler for sending emails.
 * Uses an artificial delay and a random failure rate to mimic realistic behavior (e.g., SMTP network timeouts).
 */
async function sendEmailHandler(payload) {
  console.log(`[sendEmailHandler] Starting job. Target: ${payload.to || payload.email || 'unknown'}`);
  
  // Await a 500ms artificial delay to simulate SMTP network connection
  await new Promise(resolve => setTimeout(resolve, 500));

  // Simulate a flaky dependency (20% failure rate) for testing retries/DLQ
  if (Math.random() < 0.2) {
    throw new Error('SMTP connection timed out. Service temporarily unavailable.');
  }

  console.log(`[sendEmailHandler] Success! Email sent successfully.`);
}

module.exports = sendEmailHandler;
