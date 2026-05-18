require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const { logger } = require('./middleware/logger');

// Read configuration from the environment with sensible local defaults.
const port = process.env.COST_SERVICE_PORT || 3001;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cost-manager';

/**
 * Logs the cost service startup port.
 * @returns {void}
 */
function logCostServiceStarted() {
  // Log the bound port for local development and operations.
  logger.info(`cost service listening on port ${port}`);
}

/**
 * Connects MongoDB and starts the cost HTTP server.
 * @returns {Promise<void>} Resolves after the startup attempt finishes.
 */
async function start() {
  try {
    // Connect before listening so the service fails fast on database errors.
    await mongoose.connect(mongoUri);

    app.listen(port, logCostServiceStarted);
  } catch (error) {
    // Exit with a failure code when startup cannot complete.
    logger.error({ err: error.message }, 'failed to start cost service');
    process.exit(1);
  }
}

// Start the service when this entrypoint is executed directly.
start();
