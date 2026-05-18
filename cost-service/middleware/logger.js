const pino = require('pino');
const Log = require('../models/Log');

// Single Pino instance used for stdout logging across the service.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Identify the originating service when writing log entries to MongoDB.
const serviceName = process.env.SERVICE_NAME || 'cost-service';

/**
 * Builds the persisted log entry for one completed HTTP request.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {number} startMs - The timestamp when the request started.
 * @returns {Object} The log entry to persist in MongoDB.
 */
function buildLogEntry(req, res, startMs) {
  // Compose a single record matching the project's logs schema.
  return {
    level: 'info',
    time: new Date(),
    msg: `${req.method} ${req.originalUrl}`,
    service: serviceName,
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration_ms: Date.now() - startMs,
  };
}

/**
 * Express middleware that writes one log per HTTP request to MongoDB.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 * @returns {void}
 */
function loggerMiddleware(req, res, next) {
  // Capture the start time before any handler runs.
  const startMs = Date.now();

  // Defer log persistence until the response has been sent.
  res.on('finish', async () => {
    const entry = buildLogEntry(req, res, startMs);

    try {
      // Persist the entry to the shared logs collection.
      await Log.create(entry);
      logger.info(entry);
    } catch (error) {
      // Never crash the request flow because logging failed.
      logger.error({ err: error.message }, 'failed to write log to MongoDB');
    }
  });

  // Continue with the regular request pipeline.
  next();
}

module.exports = { logger, loggerMiddleware };
