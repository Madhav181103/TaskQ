'use strict';

/**
 * errorHandler.js — Global Express Error Handler
 *
 * Must be registered as the LAST app.use() in server.js so that
 * errors forwarded via next(err) from any route land here.
 *
 * Behaviour:
 *   - Logs the full error (with stack) server-side for debugging.
 *   - Returns a sanitised JSON response to the client so raw stack
 *     traces and internal details are never exposed.
 *   - Respects err.statusCode if the throwing code set one (e.g. 400/404),
 *     otherwise defaults to 500.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // ── Server-side logging ───────────────────────────────────────────────────
  // Log the full error so developers can diagnose issues without needing
  // to read it from the HTTP response.
  console.error(`[ErrorHandler] ${req.method} ${req.path} →`, err);

  // ── Determine status code ────────────────────────────────────────────────
  // Allow route handlers to signal a specific HTTP status (e.g. 400, 404)
  // by attaching a statusCode property to the thrown error object.
  // Fall back to 500 for all unexpected / uncaught errors.
  const statusCode = (err.statusCode && Number.isInteger(err.statusCode))
    ? err.statusCode
    : 500;

  // ── Build client-safe response ───────────────────────────────────────────
  // Never expose err.message or stack traces to the client in production.
  // For known operational errors (4xx), the message is deliberately safe
  // to surface — it was authored by the route handler.
  const clientMessage = statusCode < 500
    ? (err.message || 'Request error.')
    : 'Something went wrong. Please try again.';

  res.status(statusCode).json({ error: clientMessage });
}

module.exports = errorHandler;
