const mongoose = require('mongoose');

/*
 * Report schema implementing the Computed Design Pattern.
 * For months that have already passed, the grouped monthly report is
 * computed once from the costs collection and persisted here. Subsequent
 * requests for the same (userid, year, month) read directly from this
 * collection, avoiding repeated aggregations over the costs collection.
 */
const reportSchema = new mongoose.Schema({
  // Public numeric user identifier the report belongs to.
  userid: {
    type: Number,
    required: true,
  },
  // Calendar year of the report (e.g. 2026).
  year: {
    type: Number,
    required: true,
  },
  // Calendar month of the report in the 1..12 range.
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  // Pre-computed grouped costs payload exactly as returned by the API.
  costs: {
    type: Array,
    required: true,
  },
});

// Ensure exactly one cached report per (userid, year, month) tuple.
reportSchema.index({ userid: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
