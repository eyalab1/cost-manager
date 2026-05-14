require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');

// Read configuration from the environment with local defaults.
const port = process.env.ABOUT_SERVICE_PORT || 3003;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cost-manager';

/**
 * Logs the about service startup port.
 * @returns {void}
 */
function logAboutServiceStarted() {
  // Log the bound port for local development.
  console.log(`About service listening on port ${port}`);
}

/**
 * Connects MongoDB and starts the about HTTP server.
 * @returns {Promise<void>} Resolves after the startup attempt finishes.
 */
async function start() {
  try {
    // Connect to MongoDB to satisfy the service database requirement.
    await mongoose.connect(mongoUri);

    app.listen(port, logAboutServiceStarted);
  } catch (error) {
    // Exit with a failure code when startup cannot complete.
    console.error('Failed to start about service:', error.message);
    process.exit(1);
  }
}

// Start the service when this entrypoint is executed.
start();
