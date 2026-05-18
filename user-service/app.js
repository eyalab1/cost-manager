const express = require('express');
const mongoose = require('mongoose');
const { requestLogger } = require('../middleware/requestLogger');
const User = require('./models/User');

// Create one Express app that can be imported by tests without opening a port.
const app = express();

// Parse JSON request bodies at the HTTP boundary.
app.use(express.json());

// Log every endpoint access through Pino and MongoDB.
app.use(requestLogger);

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
  const requiredFields = ['id', 'first_name', 'last_name', 'birthday'];

  // Collect every missing field in one pass over the required names.
  const missingFields = requiredFields.filter((field) => isMissing(body[field]));

  // Return all missing fields so clients can fix the request once.
  if (missingFields.length > 0) {
    return `Missing required field: ${missingFields[0]}`;
  }

  // Parse and validate the public numeric id at the HTTP boundary.
  if (!Number.isInteger(Number(body.id))) {
    return 'id must be a number';
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
    id: Number(body.id),
    first_name: body.first_name,
    last_name: body.last_name,
    birthday: body.birthday,
  });

  return user;
}

/**
 * Converts a user document to the public API shape.
 * @param {Object} user - The Mongoose user document.
 * @returns {Object} The user fields exposed by the API.
 */
function toPublicUser(user) {
  // Do not expose MongoDB _id or internal Mongoose fields in API responses.
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    birthday: user.birthday,
  };
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
    return res.status(400).json({ id: 400, message: validationError });
  }

  try {
    // Delegate persistence to a focused database helper.
    const user = await createUser(req.body);

    return res.status(201).json(toPublicUser(user));
  } catch (error) {
    // Mongoose validation errors are returned as client errors.
    return res.status(400).json({ id: 400, message: error.message });
  }
}

/**
 * Calculates a user's total cost from the costs collection.
 * @param {number} userId - The public numeric user id.
 * @returns {Promise<number>} The summed cost total for the user.
 */
async function getUserTotal(userId) {
  // Aggregate directly from the required costs collection.
  const totals = await mongoose.connection.collection('costs').aggregate([
    { $match: { $or: [{ user_id: userId }, { id: userId }] } },
    { $group: { _id: null, total: { $sum: '$cost' } } },
  ]).toArray();

  // Missing cost rows mean the user currently has a zero total.
  return totals.length > 0 ? totals[0].total : 0;
}

/**
 * Handles requests for the complete user list.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Promise<Object>} The Express JSON response.
 */
async function getUsersHandler(req, res) {
  // Sort by public id for stable API responses without timestamp fields.
  const users = await User.find().sort({ id: 1 });

  // Return only the fields defined by the project user contract.
  return res.json(users.map(toPublicUser));
}

/**
 * Handles requests for one user and their current cost total.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @returns {Promise<Object>} The Express JSON response.
 */
async function getUserByIdHandler(req, res) {
  // Parse the API id as a number, not as MongoDB _id.
  const userId = Number(req.params.id);

  // Reject non-numeric route parameters before querying MongoDB.
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ id: 400, message: 'invalid user id' });
  }

  // Fetch the requested user document by its public numeric id.
  const user = await User.findOne({ id: userId });

  if (!user) {
    return res.status(404).json({ id: 404, message: 'user not found' });
  }

  // Compute the total from costs every time so the response stays current.
  const total = await getUserTotal(userId);

  // Return only the fields required by the project API contract.
  return res.json({
    first_name: user.first_name,
    last_name: user.last_name,
    id: user.id,
    total,
  });
}

// Register the public user service routes.
app.post('/api/add', addUserHandler);
app.get('/api/users', getUsersHandler);
app.get('/api/users/:id', getUserByIdHandler);

// Export the app for both the server entrypoint and tests.
module.exports = app;
