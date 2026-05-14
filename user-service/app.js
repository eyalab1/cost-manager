const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User');

// Create one Express app that can be imported by tests without opening a port.
const app = express();

// Parse JSON request bodies at the HTTP boundary.
app.use(express.json());

/**
 * Checks whether a required request value is missing.
 * @param {*} value - The value received from the request body.
 * @returns {boolean} True when the value should be treated as missing.
 */
function isMissing(value) {
  // Empty strings are invalid for required user profile fields.
  return value === undefined || value === null || value === '';
}

/**
 * Validates the user payload before it reaches MongoDB.
 * @param {Object} body - The parsed request body.
 * @returns {string|null} A validation message, or null when valid.
 */
function validateUserPayload(body) {
  // Keep required field names aligned with the public API contract.
  const requiredFields = ['first_name', 'last_name', 'birthday', 'marital_status'];

  // Collect every missing field in one pass over the required names.
  const missingFields = requiredFields.filter((field) => isMissing(body[field]));

  // Return all missing fields so clients can fix the request once.
  if (missingFields.length > 0) {
    return `${missingFields.join(', ')} required`;
  }

  // Parse dates explicitly at the system boundary.
  const birthday = new Date(body.birthday);

  // Reject invalid dates before creating a Mongoose document.
  if (Number.isNaN(birthday.getTime())) {
    return 'birthday must be a valid date';
  }

  // Null marks a valid payload for the route handler.
  return null;
}

/**
 * Creates a user document from the validated request body.
 * @param {Object} body - The parsed request body.
 * @returns {Promise<Object>} The created user document.
 */
async function createUser(body) {
  // Only persist fields that belong to the user schema.
  const user = await User.create({
    first_name: body.first_name,
    last_name: body.last_name,
    birthday: body.birthday,
    marital_status: body.marital_status,
  });

  return user;
}

/**
 * Handles user creation requests.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Promise<Object>} The Express JSON response.
 */
async function addUserHandler(req, res) {
  // Validate user input before any database write is attempted.
  const validationError = validateUserPayload(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    // Delegate persistence to a focused database helper.
    const user = await createUser(req.body);

    return res.status(201).json(user);
  } catch (error) {
    // Mongoose validation errors are returned as client errors.
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Handles requests for the complete user list.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Promise<Object>} The Express JSON response.
 */
async function getUsersHandler(req, res) {
  // Sort by creation time for stable API responses.
  const users = await User.find().sort({ createdAt: 1 });

  return res.json(users);
}

/**
 * Handles requests for one user and their current expense total.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Promise<Object>} The Express JSON response.
 */
async function getUserByIdHandler(req, res) {
  // Validate MongoDB identifiers before querying the database.
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'invalid user id' });
  }

  // Fetch the requested user document by its unique identifier.
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  // Expenses are not implemented yet, so the current total is zero.
  return res.json({
    user,
    total_expenses: 0,
  });
}

// Register the public user service routes.
app.post('/api/add', addUserHandler);
app.get('/api/users', getUsersHandler);
app.get('/api/users/:id', getUserByIdHandler);

// Export the app for both the server entrypoint and tests.
module.exports = app;
