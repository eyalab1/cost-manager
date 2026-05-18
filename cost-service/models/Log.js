const mongoose = require('mongoose');

/*
 * Log schema for the logs collection.
 * Every HTTP request handled by any service writes one log document here.
 * The schema is intentionally non-strict so that extra Pino fields are
 * preserved as well as the explicit project fields below.
 */
const logSchema = new mongoose.Schema(
  {
    // Pino severity level (info, warn, error, etc.).
    level: {
      type: String,
    },
    // Timestamp the log was created at.
    time: {
      type: Date,
      default: Date.now,
    },
    // Human-readable log message.
    msg: {
      type: String,
    },
    // Originating service name (e.g. cost-service).
    service: {
      type: String,
    },
    // HTTP method of the logged request.
    method: {
      type: String,
    },
    // HTTP url of the logged request.
    url: {
      type: String,
    },
    // HTTP status code returned to the client.
    status: {
      type: Number,
    },
  },
  {
    strict: false,
  }
);

module.exports = mongoose.models.Log || mongoose.model('Log', logSchema);
