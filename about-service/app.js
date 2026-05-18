const express = require('express');
const { requestLogger } = require('../middleware/requestLogger');

// Create one Express app that tests can import directly.
const app = express();

// Log every endpoint access through Pino and MongoDB.
app.use(requestLogger);

// Fallback names keep the endpoint useful without environment configuration.
const defaultTeamMembers = [
  { first_name: 'Ofek', last_name: '' },
  { first_name: 'Eyal', last_name: '' },
  { first_name: 'Guy', last_name: '' },
];

/**
 * Normalizes one configured team member name.
 * @param {string} member - The raw comma-separated team member value.
 * @returns {Object} The normalized team member object.
 */
function parseTeamMember(member) {
  // Split optional first-name/last-name pairs from environment configuration.
  const nameParts = member.trim().split(/\s+/).filter(Boolean);

  // Preserve the required object shape even when only a first name is given.
  return {
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' '),
  };
}

/**
 * Gets configured team member names from the environment.
 * @returns {Object[]} The configured or fallback team member names.
 */
function getTeamMembers() {
  // Missing configuration uses the hardcoded project fallback.
  if (!process.env.TEAM_MEMBERS) {
    return defaultTeamMembers;
  }

  // Split comma-separated values and remove accidental whitespace.
  const members = process.env.TEAM_MEMBERS.split(',')
    .map(parseTeamMember)
    .filter((member) => member.first_name !== '');

  // Empty comma-only configuration should still return useful data.
  return members.length > 0 ? members : defaultTeamMembers;
}

/**
 * Handles team metadata requests.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Object} The Express JSON response.
 */
function aboutHandler(req, res) {
  // Return the team list using the API response contract.
  return res.json(getTeamMembers());
}

// Register the about service endpoint.
app.get('/api/about', aboutHandler);

// Export the app for both the server entrypoint and tests.
module.exports = app;
