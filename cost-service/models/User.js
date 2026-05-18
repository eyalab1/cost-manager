const mongoose = require('mongoose');

/*
 * User schema used by the cost service for read-only lookups only.
 * The cost service must verify a userid exists before persisting a cost,
 * and must read the user's costs to compute monthly reports. The user
 * service owns the canonical schema; this definition mirrors it so the
 * cost service can run as an independent process.
 */
const userSchema = new mongoose.Schema(
  {
    // Public numeric identifier (distinct from MongoDB _id).
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    // User's given name.
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    // User's family name.
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    // User's date of birth as a native MongoDB date.
    birthday: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Reuse the existing model if another module already registered it.
module.exports = mongoose.models.User || mongoose.model('User', userSchema);
