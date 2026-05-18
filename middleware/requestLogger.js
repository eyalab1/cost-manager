const mongoose = require('mongoose');
const logger = require('../logger');

/**
 * Builds the persisted request log document.
 * @param {Object} req - The Express request object.
 * @param {number} statusCode - The HTTP response status code.
 * @param {number} durationMs - The request duration in milliseconds.
 * @returns {Object} The log document stored in MongoDB.
 */
function buildRequestLog(req, statusCode, durationMs) {
    // Store endpoint access with enough metadata for audit checks.
    return {
        method: req.method,
        path: req.originalUrl,
        status: statusCode,
        duration_ms: durationMs,
        created_at: new Date(),
    };
}

/**
 * Persists one request log document when MongoDB is connected.
 * @param {Object} requestLog - The request log document.
 * @returns {Promise<void>} Resolves after the best-effort write completes.
 */
async function saveRequestLog(requestLog) {
    // Tests may import apps before a database connection exists.
    if (mongoose.connection.readyState !== 1) {
        return;
    }

    // Write directly to the required logs collection.
    await mongoose.connection.collection('logs').insertOne(requestLog);
}

/**
 * Logs every HTTP request to Pino and MongoDB.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The Express next callback.
 * @returns {void}
 */
function requestLogger(req, res, next) {
    // Measure endpoint duration from middleware entry to response finish.
    const startedAt = Date.now();

    // Persist and emit the log only after the final status code is known.
    res.on('finish', () => {
        const requestLog = buildRequestLog(req, res.statusCode, Date.now() - startedAt);
        logger.info(requestLog, 'http request');

        // Logging must not break endpoint responses.
        saveRequestLog(requestLog).catch((error) => {
            logger.error({ error: error.message }, 'failed to save request log');
        });
    });

    // Continue normal request handling after registering the listener.
    next();
}

// Export middleware and helpers for services and tests.
module.exports = {
    buildRequestLog,
    requestLogger,
    saveRequestLog,
};
