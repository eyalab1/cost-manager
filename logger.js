const pino = require('pino');

// Create one shared structured logger for both services.
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

// Export the logger so services avoid console logging.
module.exports = logger;
