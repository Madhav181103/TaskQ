const sendEmailHandler = require('./sendEmailHandler');
const resizeImageHandler = require('./resizeImageHandler');

/**
 * HANDLER REGISTRY DESIGN NOTE:
 * 
 * We map job type string keys directly to their execution handler functions.
 * 
 * Rationale:
 * By looking up handlers dynamically using strings in a central registry, the queue infrastructure
 * and worker runner remain completely decoupled from the specific tasks.
 * The core worker process doesn't need to know what "sendEmail" or "resizeImage" actually does;
 * it only needs to dequeue a job, match the type string against this registry, and execute the handler.
 * 
 * This design makes the system highly extensible. Adding a new task type (e.g., "generateReport")
 * only requires:
 * 1. Creating a new handler file.
 * 2. Adding one entry mapping "generateReport" to the new handler in this registry.
 * 
 * No queue orchestration or worker lifecycle code has to be modified!
 */
const handlers = {
  sendEmail: sendEmailHandler,
  resizeImage: resizeImageHandler,
};

module.exports = handlers;
