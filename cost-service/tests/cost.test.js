const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../app');
const Cost = require('../models/Cost');
const Report = require('../models/Report');
const User = require('../models/User');

// A known user id reused by tests so the seeded user always exists.
const TEST_USER_ID = 123123;

/**
 * Builds a valid cost payload for endpoint tests.
 * @param {Object} overrides - Field values that should replace defaults.
 * @returns {Object} A valid cost request body.
 */
function validCost(overrides = {}) {
  // Keep defaults aligned with the public schema and validation rules.
  return {
    userid: TEST_USER_ID,
    description: 'milk',
    category: 'food',
    sum: 8,
    ...overrides,
  };
}

/**
 * Sends a POST /api/add request expecting a validation failure.
 * @param {Object} payload - The body to send to the endpoint.
 * @returns {Promise<Object>} The Supertest response object.
 */
async function postExpectingBadRequest(payload) {
  // Use the public route so the central error format is exercised end-to-end.
  return request(app).post('/api/add').send(payload).expect(400);
}

/**
 * Registers all cost service endpoint tests.
 * @returns {void}
 */
function registerCostServiceTests() {
  let mongoServer;

  /**
   * Starts an isolated in-memory MongoDB instance for tests.
   * @returns {Promise<void>} Resolves after MongoDB is connected.
   */
  async function connectTestDatabase() {
    // Use an in-memory database so tests never touch local data.
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }

  /**
   * Seeds the canonical test user before each test.
   * @returns {Promise<void>} Resolves after the seed user is inserted.
   */
  async function seedTestUser() {
    // Match the user that the project specification requires at submission.
    await User.create({
      id: TEST_USER_ID,
      first_name: 'mosh',
      last_name: 'israeli',
      birthday: new Date('1990-01-01'),
    });
  }

  /**
   * Clears all collections after each test to keep cases isolated.
   * @returns {Promise<void>} Resolves after the database is empty.
   */
  async function clearCollections() {
    // Remove documents without dropping the database connection.
    await Cost.deleteMany({});
    await Report.deleteMany({});
    await User.deleteMany({});
  }

  /**
   * Stops the in-memory database after all tests finish.
   * @returns {Promise<void>} Resolves after all database resources close.
   */
  async function disconnectTestDatabase() {
    // Disconnect Mongoose before stopping the backing server.
    await mongoose.disconnect();
    await mongoServer.stop();
  }

  beforeAll(connectTestDatabase);
  beforeEach(seedTestUser);
  afterEach(clearCollections);
  afterAll(disconnectTestDatabase);

  describe('POST /api/add', registerAddCostTests);
  describe('GET /api/report', registerReportTests);
}

/**
 * Registers tests for the POST /api/add endpoint.
 * @returns {void}
 */
function registerAddCostTests() {
  /**
   * Verifies a valid cost item can be created and is echoed back.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function createsValidCost() {
    // Send a minimal valid body and confirm the saved fields.
    const response = await request(app)
      .post('/api/add')
      .send(validCost())
      .expect(201);

    expect(response.body).toMatchObject({
      userid: TEST_USER_ID,
      description: 'milk',
      category: 'food',
      sum: 8,
    });
    // The server should attach a date even when the client omitted one.
    expect(response.body.date).toBeDefined();
  }

  /**
   * Verifies a missing required field returns a 400 with the project shape.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsMissingRequiredField() {
    // Drop description, which is a hard required field.
    const payload = validCost();
    delete payload.description;

    const response = await postExpectingBadRequest(payload);

    // The error response must include both id and message.
    expect(response.body).toHaveProperty('id', 400);
    expect(response.body.message).toContain('description');
  }

  /**
   * Verifies category values outside the allowed list are rejected.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsUnknownCategory() {
    // The string "movies" is not one of the five allowed categories.
    const response = await postExpectingBadRequest(validCost({ category: 'movies' }));

    expect(response.body.message).toContain('category');
  }

  /**
   * Verifies negative sums are rejected before the database is touched.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsNegativeSum() {
    const response = await postExpectingBadRequest(validCost({ sum: -5 }));
    expect(response.body.message).toContain('sum');
  }

  /**
   * Verifies that requests for unknown users are rejected with 404.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsUnknownUser() {
    // Use a userid that was never seeded into the users collection.
    const response = await request(app)
      .post('/api/add')
      .send(validCost({ userid: 999999 }))
      .expect(404);

    expect(response.body).toEqual({
      id: 404,
      message: 'user 999999 does not exist',
    });
  }

  /**
   * Verifies that cost dates in a past month are rejected.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsPastMonthDate() {
    // Anchor the test against a clearly historical date.
    const response = await postExpectingBadRequest(
      validCost({ date: '2000-01-15' })
    );

    expect(response.body.message).toContain('past month');
  }

  test('creates a valid cost item', createsValidCost);
  test('rejects a request missing a required field', rejectsMissingRequiredField);
  test('rejects a request with an unknown category', rejectsUnknownCategory);
  test('rejects a negative sum value', rejectsNegativeSum);
  test('rejects a cost for an unknown user', rejectsUnknownUser);
  test('rejects a date that belongs to a past month', rejectsPastMonthDate);
}

/**
 * Registers tests for the GET /api/report endpoint.
 * @returns {void}
 */
function registerReportTests() {
  /**
   * Returns the current calendar year and month used by the service.
   * @returns {{year: number, month: number}} The current year and month.
   */
  function currentYearMonth() {
    // The service compares against the local current month, so do the same.
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  /**
   * Sends one valid cost into the database via the public endpoint.
   * @param {Object} overrides - Cost fields to override.
   * @returns {Promise<Object>} The Supertest response object.
   */
  async function postCost(overrides) {
    return request(app)
      .post('/api/add')
      .send(validCost(overrides))
      .expect(201);
  }

  /**
   * Verifies the empty report still contains every allowed category.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function returnsAllCategoriesEvenWhenEmpty() {
    const { year, month } = currentYearMonth();

    const response = await request(app)
      .get(`/api/report?id=${TEST_USER_ID}&year=${year}&month=${month}`)
      .expect(200);

    // The response must include userid, year, month, and costs.
    expect(response.body.userid).toBe(TEST_USER_ID);
    expect(response.body.year).toBe(year);
    expect(response.body.month).toBe(month);

    // Each of the five allowed categories must appear at least as an empty list.
    const categoryNames = response.body.costs.map((bucket) => Object.keys(bucket)[0]);
    expect(categoryNames.sort()).toEqual(
      ['education', 'food', 'health', 'housing', 'sports'].sort()
    );
    response.body.costs.forEach((bucket) => {
      const [name] = Object.keys(bucket);
      expect(bucket[name]).toEqual([]);
    });
  }

  /**
   * Verifies that costs appear under the right category in the report.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function groupsCostsByCategory() {
    const { year, month } = currentYearMonth();

    // Seed two food costs and one education cost for the current month.
    await postCost({ description: 'choco', category: 'food', sum: 12 });
    await postCost({ description: 'baigale', category: 'food', sum: 14 });
    await postCost({ description: 'math book', category: 'education', sum: 82 });

    const response = await request(app)
      .get(`/api/report?id=${TEST_USER_ID}&year=${year}&month=${month}`)
      .expect(200);

    // Find the food bucket and assert both food items are present.
    const foodBucket = response.body.costs.find((bucket) => bucket.food !== undefined);
    expect(foodBucket.food).toHaveLength(2);
    expect(foodBucket.food.map((cost) => cost.description).sort()).toEqual([
      'baigale',
      'choco',
    ]);

    // The education bucket should contain exactly one entry.
    const educationBucket = response.body.costs.find(
      (bucket) => bucket.education !== undefined
    );
    expect(educationBucket.education).toHaveLength(1);
    expect(educationBucket.education[0].description).toBe('math book');
  }

  /**
   * Verifies that requesting a report for a past month writes the cache.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function cachesReportsForPastMonths() {
    // Seed one cost directly into a past month, bypassing the validation rule.
    await Cost.create({
      userid: TEST_USER_ID,
      description: 'old shoes',
      category: 'sports',
      sum: 99,
      date: new Date('2000-03-10'),
    });

    // First request should populate the report cache.
    const first = await request(app)
      .get(`/api/report?id=${TEST_USER_ID}&year=2000&month=3`)
      .expect(200);

    expect(
      first.body.costs.find((bucket) => bucket.sports !== undefined).sports
    ).toHaveLength(1);

    // The Computed Pattern must have persisted exactly one cached report.
    const cachedCount = await Report.countDocuments({
      userid: TEST_USER_ID,
      year: 2000,
      month: 3,
    });
    expect(cachedCount).toBe(1);

    // Add another cost into the same past month directly in the database.
    // The cached report should still be returned, proving the cache is used.
    await Cost.create({
      userid: TEST_USER_ID,
      description: 'should not appear',
      category: 'sports',
      sum: 50,
      date: new Date('2000-03-12'),
    });

    const second = await request(app)
      .get(`/api/report?id=${TEST_USER_ID}&year=2000&month=3`)
      .expect(200);

    // The second response must match the first, ignoring the new cost.
    const secondSports = second.body.costs.find(
      (bucket) => bucket.sports !== undefined
    ).sports;
    expect(secondSports).toHaveLength(1);
    expect(secondSports[0].description).toBe('old shoes');
  }

  /**
   * Verifies that missing query parameters are rejected.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsMissingQueryParams() {
    const response = await request(app).get('/api/report?id=123123').expect(400);
    expect(response.body).toHaveProperty('id', 400);
  }

  /**
   * Verifies that out-of-range months are rejected.
   * @returns {Promise<void>} Resolves after the assertion completes.
   */
  async function rejectsOutOfRangeMonth() {
    const response = await request(app)
      .get(`/api/report?id=${TEST_USER_ID}&year=2026&month=13`)
      .expect(400);
    expect(response.body.message).toContain('month');
  }

  test('returns all categories even when there are no costs', returnsAllCategoriesEvenWhenEmpty);
  test('groups multiple costs by their category', groupsCostsByCategory);
  test('caches reports for past months (Computed Pattern)', cachesReportsForPastMonths);
  test('rejects requests with missing query parameters', rejectsMissingQueryParams);
  test('rejects month values outside the 1..12 range', rejectsOutOfRangeMonth);
}

describe('Cost service endpoints', registerCostServiceTests);
