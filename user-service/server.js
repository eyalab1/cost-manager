require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');

// Read configuration from the environment with local defaults.
const port = process.env.USER_SERVICE_PORT || 3002;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cost-manager';

/**
 * Logs the user service startup port.
 * @returns {void}
 */
function logUserServiceStarted() {
  // Log the bound port for local development.
  console.log(`User service listening on port ${port}`);
}

/**
 * Connects MongoDB and starts the user HTTP server.
 * @returns {Promise<void>} Resolves after the startup attempt finishes.
 */
async function start() {
  try {
    // Connect before listening so the service fails fast on database errors.
    await mongoose.connect(mongoUri);

    app.listen(port, logUserServiceStarted);
  } catch (error) {
    // Exit with a failure code when startup cannot complete.
    console.error('Failed to start user service:', error.message);
    process.exit(1);
  }
}

// Start the service when this entrypoint is executed.
start();
