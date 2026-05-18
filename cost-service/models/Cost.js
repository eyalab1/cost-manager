const mongoose = require('mongoose');

// Allowed cost categories as defined by the project specification.
// A cost item must belong to exactly one of these categories.
const ALLOWED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];

/*
 * Cost schema for the costs collection.
 * Stores one expense entry created by a user. The userid field references
 * the public id of a user (Number) and is never linked to the MongoDB _id.
 * The sum is stored as a JavaScript Number which BSON persists as a 64-bit
 * double, fulfilling the project requirement for a Double type.
 */
const costSchema = new mongoose.Schema(
  {
    // Human-readable description of the purchase.
    description: {
      type: String,
      required: true,
      trim: true,
    },
    // Cost category, restricted to the allowed list above.
    category: {
      type: String,
      required: true,
      enum: ALLOWED_CATEGORIES,
    },
    // Public numeric user identifier (not MongoDB _id).
    userid: {
      type: Number,
      required: true,
    },
    // Monetary value of the cost (stored as BSON double).
    sum: {
      type: Number,
      required: true,
      min: 0,
    },
    // Date the cost item refers to; defaults to the request reception time.
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Expose the model and the list of allowed categories together.
const CostModel = mongoose.models.Cost || mongoose.model('Cost', costSchema);
CostModel.ALLOWED_CATEGORIES = ALLOWED_CATEGORIES;

module.exports = CostModel;
