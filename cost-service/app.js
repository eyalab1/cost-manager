const express = require('express');

const Cost = require('./models/Cost');
const Report = require('./models/Report');
const User = require('./models/User');
const { loggerMiddleware } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

// Create one Express app that can be imported by tests without opening a port.
const app = express();

// Parse JSON request bodies at the HTTP boundary.
app.use(express.json());

// Log every HTTP request to the shared logs collection.
app.use(loggerMiddleware);

// Allowed categories sourced from the Cost model for consistency.
const ALLOWED_CATEGORIES = Cost.ALLOWED_CATEGORIES;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a required request field is missing.
 * @param {*} field - The field received from the request body.
 * @returns {boolean} True when the field should be treated as missing.
 */
function isMissing(field) {
  // Empty strings are also rejected for required cost fields.
  return field === undefined || field === null || field === '';
}

/**
 * Builds a Date instance from a request field, validating it strictly.
 * @param {*} rawDate - The raw date field supplied in the request.
 * @returns {Date|null} The parsed Date, or null when invalid or missing.
 */
function parseDate(rawDate) {
  // Treat missing fields as "use server time" by returning null.
  if (isMissing(rawDate)) {
    return null;
  }

  // Build the Date explicitly at the system boundary.
  const parsed = new Date(rawDate);

  // Invalid dates are reported with null so callers can reject the request.
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Returns the first day of the current month, used to reject past dates.
 * @returns {Date} The first millisecond of the current month.
 */
function startOfCurrentMonth() {
  // Build the boundary using local time, matching how clients send dates.
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ---------------------------------------------------------------------------
// POST /api/add - add one cost item
// ---------------------------------------------------------------------------

/**
 * Validates the cost item payload before any database write.
 * @param {Object} body - The parsed request body.
 * @returns {string|null} A validation message, or null when the body is valid.
 */
function validateCostPayload(body) {
  // Required scalar fields per the project specification.
  const requiredFields = ['description', 'category', 'userid', 'sum'];

  // Report every missing field together so the client can fix once.
  const missingFields = requiredFields.filter((field) => isMissing(body[field]));
  if (missingFields.length > 0) {
    return `${missingFields.join(', ')} required`;
  }

  // Restrict category to the project's enumerated list.
  if (!ALLOWED_CATEGORIES.includes(body.category)) {
    return `category must be one of ${ALLOWED_CATEGORIES.join(', ')}`;
  }

  // Convert userid explicitly to a number for the validation check.
  const userid = Number(body.userid);
  if (!Number.isInteger(userid)) {
    return 'userid must be an integer';
  }

  // Convert sum explicitly to a number; the project type is Double.
  const sum = Number(body.sum);
  if (!Number.isFinite(sum) || sum < 0) {
    return 'sum must be a non-negative number';
  }

  // The description must be a non-empty string after trimming.
  if (typeof body.description !== 'string' || body.description.trim() === '') {
    return 'description must be a non-empty string';
  }

  // Optional date must parse to a real instant when provided.
  if (!isMissing(body.date) && parseDate(body.date) === null) {
    return 'date must be a valid date';
  }

  return null;
}

/**
 * Verifies that the userid refers to a real user in the users collection.
 * @param {number} userid - The numeric user identifier.
 * @returns {Promise<boolean>} True when the user exists.
 */
async function userExists(userid) {
  // A lightweight existence check using the indexed public id field.
  const user = await User.findOne({ id: userid }).select({ _id: 1 }).lean();
  return user !== null;
}

/**
 * Persists a validated cost item to MongoDB.
 * @param {Object} body - The validated request body.
 * @returns {Promise<Object>} The persisted cost document.
 */
async function persistCost(body) {
  // Honor a client-supplied date when present, otherwise the schema default.
  const providedDate = parseDate(body.date);

  // Build the document with explicit type conversions at the boundary.
  const payload = {
    description: String(body.description).trim(),
    category: String(body.category),
    userid: Number(body.userid),
    sum: Number(body.sum),
  };

  // Only include date when the client provided a valid one.
  if (providedDate !== null) {
    payload.date = providedDate;
  }

  return Cost.create(payload);
}

/**
 * Handles cost item creation requests.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware (for error forwarding).
 * @returns {Promise<Object>} The Express JSON response.
 */
async function addCostHandler(req, res, next) {
  // Validate the payload before touching the database at all.
  const validationError = validateCostPayload(req.body);
  if (validationError) {
    return res.status(400).json({ id: 400, message: validationError });
  }

  try {
    // Reject costs whose date belongs to a past month (Computed Pattern rule).
    const providedDate = parseDate(req.body.date);
    if (providedDate !== null && providedDate < startOfCurrentMonth()) {
      return res
        .status(400)
        .json({ id: 400, message: 'date must not belong to a past month' });
    }

    // Verify the user exists before persisting any cost for them.
    const userid = Number(req.body.userid);
    const exists = await userExists(userid);
    if (!exists) {
      return res
        .status(404)
        .json({ id: 404, message: `user ${userid} does not exist` });
    }

    // Persist the cost and return the saved document to the client.
    const cost = await persistCost(req.body);
    return res.status(201).json({
      description: cost.description,
      category: cost.category,
      userid: cost.userid,
      sum: cost.sum,
      date: cost.date,
    });
  } catch (error) {
    // Forward unexpected errors to the central error handler.
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/report - monthly grouped report with Computed Pattern
// ---------------------------------------------------------------------------

/**
 * Validates the report query parameters.
 * @param {Object} query - The Express query object.
 * @returns {string|null} A validation message, or null when valid.
 */
function validateReportQuery(query) {
  // Every report request must identify the user, the year, and the month.
  const requiredParams = ['id', 'year', 'month'];

  // Surface missing parameters together for a clearer client experience.
  const missing = requiredParams.filter((field) => isMissing(query[field]));
  if (missing.length > 0) {
    return `${missing.join(', ')} required`;
  }

  // Coerce all three values to numbers at the query string boundary.
  const userid = Number(query.id);
  const year = Number(query.year);
  const month = Number(query.month);

  // Each value must be an integer; year and month also have ranges.
  if (!Number.isInteger(userid)) {
    return 'id must be an integer';
  }
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return 'year must be a 4-digit integer';
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return 'month must be an integer between 1 and 12';
  }

  return null;
}

/**
 * Returns true when (year, month) is strictly before the current month.
 * @param {number} year - The calendar year of the report.
 * @param {number} month - The calendar month (1..12) of the report.
 * @returns {boolean} True when the requested month is in the past.
 */
function isPastMonth(year, month) {
  // Build the first day of the requested month, then compare to today.
  const now = new Date();
  const currentYear = now.getFullYear();
  // JavaScript months are zero-based, so add one for the comparison.
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) {
    return true;
  }
  if (year === currentYear && month < currentMonth) {
    return true;
  }
  return false;
}

/**
 * Builds the empty costs structure with every required category present.
 * @returns {Array<Object>} One object per category, each mapping to an empty array.
 */
function emptyCategoryBuckets() {
  // The project requires every category in the response, even when empty.
  return ALLOWED_CATEGORIES.map((category) => ({ [category]: [] }));
}

/**
 * Groups raw cost documents into the project's required response shape.
 * @param {Array<Object>} costs - The cost documents for one user-month.
 * @returns {Array<Object>} The grouped costs payload for the API response.
 */
function groupCostsByCategory(costs) {
  // Initialize the bucket array so every category has a slot up front.
  const buckets = emptyCategoryBuckets();

  // Build a lookup map from category name to its array for O(1) inserts.
  const indexByCategory = new Map();
  buckets.forEach((bucket, index) => {
    const [category] = Object.keys(bucket);
    indexByCategory.set(category, index);
  });

  // Place each cost into its category bucket as a trimmed projection.
  costs.forEach((cost) => {
    const bucketIndex = indexByCategory.get(cost.category);
    // Defensive: skip costs whose category is not in the allowed list.
    if (bucketIndex === undefined) {
      return;
    }
    // Resolve the bucket key once so the push is unambiguous.
    const [category] = Object.keys(buckets[bucketIndex]);
    // The report only exposes sum, description, and day for each cost.
    buckets[bucketIndex][category].push({
      sum: cost.sum,
      description: cost.description,
      day: new Date(cost.date).getDate(),
    });
  });

  return buckets;
}

/**
 * Loads all costs for one user during one calendar month.
 * @param {number} userid - The numeric user identifier.
 * @param {number} year - The calendar year of the report.
 * @param {number} month - The calendar month (1..12) of the report.
 * @returns {Promise<Array<Object>>} The matching cost documents.
 */
async function loadCostsForMonth(userid, year, month) {
  // Build the half-open interval [start, end) covering the entire month.
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  // Query by userid and the date range, sorted for deterministic output.
  return Cost.find({
    userid,
    date: { $gte: start, $lt: end },
  })
    .sort({ date: 1 })
    .lean();
}

/*
 * Computed Design Pattern implementation for the monthly report.
 *
 * The grouped monthly report for a past month never changes, because the
 * server rejects cost items whose date falls in a past month. The report
 * is therefore computed once from the costs collection and cached as a
 * document in the reports collection keyed by (userid, year, month). Any
 * subsequent request for the same past month reads the pre-computed
 * document directly, avoiding repeated aggregation work.
 *
 * For the current month or any future month the report must always be
 * computed fresh, because new cost items can still arrive and would
 * otherwise invalidate a cached copy.
 */

/**
 * Builds the monthly report payload, using the report cache when allowed.
 * @param {number} userid - The numeric user identifier.
 * @param {number} year - The calendar year of the report.
 * @param {number} month - The calendar month (1..12) of the report.
 * @returns {Promise<Object>} The full report payload sent to the client.
 */
async function buildMonthlyReport(userid, year, month) {
  const past = isPastMonth(year, month);

  // Fast path: past months can be served from the report cache directly.
  if (past) {
    const cached = await Report.findOne({ userid, year, month }).lean();
    if (cached) {
      return {
        userid,
        year,
        month,
        costs: cached.costs,
      };
    }
  }

  // Slow path: aggregate the raw cost documents into the required shape.
  const rawCosts = await loadCostsForMonth(userid, year, month);
  const grouped = groupCostsByCategory(rawCosts);

  // Persist the computed report so future requests hit the fast path.
  if (past) {
    try {
      await Report.create({ userid, year, month, costs: grouped });
    } catch (error) {
      // A duplicate key error means a concurrent request already cached it.
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  return { userid, year, month, costs: grouped };
}

/**
 * Handles monthly report requests.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware (for error forwarding).
 * @returns {Promise<Object>} The Express JSON response.
 */
async function getReportHandler(req, res, next) {
  // Validate the query string before touching the database.
  const validationError = validateReportQuery(req.query);
  if (validationError) {
    return res.status(400).json({ id: 400, message: validationError });
  }

  try {
    // Parse the validated query string into numeric values.
    const userid = Number(req.query.id);
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    // Delegate the heavy work to the Computed Pattern implementation.
    const report = await buildMonthlyReport(userid, year, month);
    return res.json(report);
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.post('/api/add', addCostHandler);
app.get('/api/report', getReportHandler);

// Central error handler must be registered after all routes.
app.use(errorHandler);

// Export the app so tests can mount it without opening a port.
module.exports = app;
