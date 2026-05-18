const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../app');
const User = require('../models/User');

/**
 * Builds a valid user payload for endpoint tests.
 * @param {Object} overrides - Field values that should replace defaults.
 * @returns {Object} A valid user request body.
 */
function validUser(overrides = {}) {
    // Keep the default payload aligned with the public schema.
    return {
        id: 123123,
        first_name: 'John',
        last_name: 'Doe',
        birthday: '1995-01-01',
        ...overrides,
    };
}

/**
 * Sends a request with one omitted required field.
 * @param {string} requiredField - The field removed from the valid payload.
 * @returns {Promise<Object>} The Supertest response object.
 */
async function requestWithoutRequiredField(requiredField) {
    // Start from a valid payload so only one validation rule is tested.
    const payload = validUser();
    delete payload[requiredField];

    // Return the validation response for the caller's assertion.
    return request(app).post('/api/add').send(payload).expect(400);
}

/**
 * Reads the first name from a user response object.
 * @param {Object} user - The user response object.
 * @returns {string} The user's first name.
 */
function getFirstName(user) {
    // Keep response mapping explicit for the assertion.
    return user.first_name;
}

/**
 * Registers all user service endpoint tests.
 * @returns {void}
 */
function registerUserServiceTests() {
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
     * Clears collections after each test to keep cases isolated.
     * @returns {Promise<void>} Resolves after test collections are empty.
     */
    async function clearDatabase() {
        // Remove test documents without dropping the database connection.
        await User.deleteMany({});
        await mongoose.connection.collection('costs').deleteMany({});
        await mongoose.connection.collection('logs').deleteMany({});
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
    afterEach(clearDatabase);
    afterAll(disconnectTestDatabase);

    describe('POST /api/add', registerAddUserTests);
    describe('GET /api/users', registerGetUsersTests);
    describe('GET /api/users/:id', registerGetUserByIdTests);
    describe('request logging', registerRequestLoggingTests);
}

/**
 * Registers tests for user creation.
 * @returns {void}
 */
function registerAddUserTests() {
    /**
     * Verifies that a valid user can be created.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function createsValidUser() {
        // Send the minimum valid body accepted by the endpoint.
        const response = await request(app).post('/api/add').send(validUser()).expect(201);

        // The response should expose only the public user fields.
        expect(response.body).toEqual({
            id: 123123,
            first_name: 'John',
            last_name: 'Doe',
            birthday: '1995-01-01T00:00:00.000Z',
        });
    }

    /**
     * Verifies validation for a missing id.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingId() {
        // The error should name the missing field using the required shape.
        const response = await requestWithoutRequiredField('id');
        expect(response.body).toEqual({ id: 400, message: 'Missing required field: id' });
    }

    /**
     * Verifies validation for a missing first name.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingFirstName() {
        // The error should name the missing field using the required shape.
        const response = await requestWithoutRequiredField('first_name');
        expect(response.body).toEqual({ id: 400, message: 'Missing required field: first_name' });
    }

    /**
     * Verifies validation for a missing last name.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingLastName() {
        // The error should name the missing field using the required shape.
        const response = await requestWithoutRequiredField('last_name');
        expect(response.body).toEqual({ id: 400, message: 'Missing required field: last_name' });
    }

    /**
     * Verifies validation for a missing birthday.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingBirthday() {
        // The error should name the missing field using the required shape.
        const response = await requestWithoutRequiredField('birthday');
        expect(response.body).toEqual({ id: 400, message: 'Missing required field: birthday' });
    }

    /**
     * Verifies validation for a non-numeric id.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsInvalidId() {
        // Numeric ids are required by the project API contract.
        const response = await request(app)
            .post('/api/add')
            .send(validUser({ id: 'not-a-number' }))
            .expect(400);

        expect(response.body).toEqual({ id: 400, message: 'id must be a number' });
    }

    /**
     * Verifies validation for an invalid birthday value.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsInvalidBirthday() {
        // Invalid dates are rejected before Mongoose writes anything.
        const response = await request(app)
            .post('/api/add')
            .send(validUser({ birthday: 'not-a-date' }))
            .expect(400);

        expect(response.body).toEqual({ id: 400, message: 'birthday must be a valid date' });
    }

    test('creates a valid user', createsValidUser);
    test('rejects missing id', rejectsMissingId);
    test('rejects missing first_name', rejectsMissingFirstName);
    test('rejects missing last_name', rejectsMissingLastName);
    test('rejects missing birthday', rejectsMissingBirthday);
    test('rejects a non-numeric id', rejectsInvalidId);
    test('rejects an invalid birthday', rejectsInvalidBirthday);
}

/**
 * Registers tests for retrieving all users.
 * @returns {void}
 */
function registerGetUsersTests() {
    /**
     * Verifies the empty list response.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsEmptyUsersArray() {
        // The endpoint should return an array even when there are no users.
        const response = await request(app).get('/api/users').expect(200);
        expect(response.body).toEqual([]);
    }

    /**
     * Verifies the endpoint returns persisted users.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsCreatedUsers() {
        // Seed two users directly so this test focuses on the GET endpoint.
        await User.create([
            validUser({ id: 1, first_name: 'John' }),
            validUser({ id: 2, first_name: 'Jane' }),
        ]);

        const response = await request(app).get('/api/users').expect(200);

        // Both persisted users should be returned in a stable shape.
        expect(response.body).toHaveLength(2);
        expect(response.body.map(getFirstName).sort()).toEqual(['Jane', 'John']);
        expect(response.body[0]._id).toBeUndefined();
    }

    test('returns an empty array when no users exist', returnsEmptyUsersArray);
    test('returns all created users', returnsCreatedUsers);
}

/**
 * Registers tests for retrieving one user by id.
 * @returns {void}
 */
function registerGetUserByIdTests() {
    /**
     * Verifies a found user response includes computed total.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsSpecificUserWithTotal() {
        // Seed one user and two costs for the numeric id lookup.
        await User.create(validUser({ id: 123123, first_name: 'Jane' }));
        await mongoose.connection.collection('costs').insertMany([
            { user_id: 123123, cost: 100 },
            { user_id: 123123, cost: 145 },
            { user_id: 777777, cost: 999 },
        ]);

        const response = await request(app).get('/api/users/123123').expect(200);

        // The endpoint contract is a flat user object with total.
        expect(response.body).toEqual({
            first_name: 'Jane',
            last_name: 'Doe',
            id: 123123,
            total: 245,
        });
    }

    /**
     * Verifies users without costs receive a zero total.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsZeroWhenNoCostsExist() {
        // Seed one user without any cost rows.
        await User.create(validUser({ id: 555555, first_name: 'NoCost' }));

        const response = await request(app).get('/api/users/555555').expect(200);

        // Missing cost rows should not break the user response.
        expect(response.body.total).toBe(0);
    }

    /**
     * Verifies malformed numeric identifiers are rejected.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsInvalidNumericId() {
        // Invalid identifiers should fail before a database lookup.
        const response = await request(app).get('/api/users/not-an-id').expect(400);
        expect(response.body).toEqual({ id: 400, message: 'invalid user id' });
    }

    /**
     * Verifies unknown numeric identifiers return not found.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsUnknownUserId() {
        // Query an id that is not stored in the database.
        const response = await request(app).get('/api/users/999999').expect(404);
        expect(response.body).toEqual({ id: 404, message: 'user not found' });
    }

    test('returns a specific user with computed total', returnsSpecificUserWithTotal);
    test('returns zero total when no costs exist', returnsZeroWhenNoCostsExist);
    test('returns 400 for invalid numeric id format', rejectsInvalidNumericId);
    test('returns 404 for an unknown user id', rejectsUnknownUserId);
}

/**
 * Registers tests for MongoDB request logging.
 * @returns {void}
 */
function registerRequestLoggingTests() {
    /**
     * Verifies endpoint access is persisted to the logs collection.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function storesHttpRequestLog() {
        // Trigger one endpoint request that should be logged after response finish.
        await request(app).get('/api/users').expect(200);
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Logs are stored in the required MongoDB logs collection.
        const log = await mongoose.connection.collection('logs').findOne({ path: '/api/users' });
        expect(log).toMatchObject({ method: 'GET', path: '/api/users', status: 200 });
    }

    test('stores each HTTP request in MongoDB logs', storesHttpRequestLog);
}

describe('User service endpoints', registerUserServiceTests);
