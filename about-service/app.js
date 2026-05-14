const express = require('express');

// Create one Express app that tests can import directly.
const app = express();

// Fallback names keep the endpoint useful without environment configuration.
const defaultTeamMembers = ['Alice', 'Bob', 'Charlie'];

/**
 * Normalizes one configured team member name.
 * @param {string} member - The raw comma-separated team member value.
 * @returns {string} The trimmed team member name.
 */
function trimTeamMember(member) {
  // Remove spaces around names from environment configuration.
  return member.trim();
}

/**
 * Gets configured team member names from the environment.
 * @returns {string[]} The configured or fallback team member names.
 */
function getTeamMembers() {
  // Missing configuration uses the hardcoded project fallback.
  if (!process.env.TEAM_MEMBERS) {
    return defaultTeamMembers;
  }

  // Split comma-separated values and remove accidental whitespace.
  const members = process.env.TEAM_MEMBERS.split(',')
    .map(trimTeamMember)
    .filter(Boolean);

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
  return res.json({ team: getTeamMembers() });
}

// Register the about service endpoint.
app.get('/api/about', aboutHandler);

// Export the app for both the server entrypoint and tests.
module.exports = app;
