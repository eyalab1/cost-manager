const mongoose = require('mongoose');

// Define the persisted user document shape for MongoDB.
const userSchema = new mongoose.Schema(
  {
    // Store the public numeric user identifier required by the API.
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    // Store the user's given name.
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    // Store the user's family name.
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    // Store the birthday as a native MongoDB date.
    birthday: {
      type: Date,
      required: true,
    },
  },
  {
    // Keep persisted output focused on the required public schema fields.
    versionKey: false,
  }
);

// Export one shared Mongoose model for route handlers and tests.
module.exports = mongoose.model('User', userSchema);
