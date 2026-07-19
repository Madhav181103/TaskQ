// Track attempts count per email address for deterministic retry demonstrations
const emailAttemptsMap = new Map();

/**
 * Simulated handler for sending emails.
 * Uses an artificial delay and a random failure rate to mimic realistic behavior (e.g., SMTP network timeouts).
 */
async function sendEmailHandler(payload) {
  const email = payload.to || payload.email || 'unknown';
  console.log(`[sendEmailHandler] Starting job. Target: ${email}`);
  
  // Await a 500ms artificial delay to simulate SMTP network connection
  await new Promise(resolve => setTimeout(resolve, 500));

  const currentAttempts = emailAttemptsMap.get(email) || 0;
  emailAttemptsMap.set(email, currentAttempts + 1);

  // ── Deterministic Demo Rules ──
  if (email.includes('always-fail') || email.includes('always_fail')) {
    throw new Error('SMTP server permanently down (550 User Unknown).');
  }
  
  if (email.includes('retry-thrice') || email.includes('retry_thrice')) {
    if (currentAttempts < 3) {
      throw new Error('Temporary SMTP connection timeout (421 Service Busy).');
    }
  } else if (email.includes('retry-twice') || email.includes('retry_twice')) {
    if (currentAttempts < 2) {
      throw new Error('Temporary SMTP connection timeout (421 Service Busy).');
    }
  } else if (email.includes('retry-once') || email.includes('retry_once')) {
    if (currentAttempts < 1) {
      throw new Error('Temporary SMTP connection timeout (421 Service Busy).');
    }
  }

  // Normal behavior fallback (20% random failure for non-demo addresses)
  const isDemoSuccessEmail = ['success2@demo.com', 'success4@demo.com', 'success6@demo.com', 'success8@demo.com'].includes(email);
  if (!isDemoSuccessEmail && Math.random() < 0.2) {
    throw new Error('SMTP connection timed out. Service temporarily unavailable.');
  }

  console.log(`[sendEmailHandler] Success! Email sent successfully.`);
}

module.exports = sendEmailHandler;
