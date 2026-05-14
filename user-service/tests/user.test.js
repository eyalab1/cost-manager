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
        first_name: 'John',
        last_name: 'Doe',
        birthday: '1995-01-01',
        marital_status: 'single',
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
     * Clears users after each test to keep cases isolated.
     * @returns {Promise<void>} Resolves after the user collection is empty.
     */
    async function clearUsers() {
        // Remove test documents without dropping the database connection.
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
    afterEach(clearUsers);
    afterAll(disconnectTestDatabase);

    describe('POST /api/add', registerAddUserTests);
    describe('GET /api/users', registerGetUsersTests);
    describe('GET /api/users/:id', registerGetUserByIdTests);
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

        expect(response.body).toMatchObject({
            first_name: 'John',
            last_name: 'Doe',
            marital_status: 'single',
        });
        expect(response.body._id).toBeDefined();
        expect(response.body.birthday).toBe('1995-01-01T00:00:00.000Z');
    }

    /**
     * Verifies validation for a missing first name.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingFirstName() {
        // The error should name the missing field.
        const response = await requestWithoutRequiredField('first_name');
        expect(response.body.error).toContain('first_name');
    }

    /**
     * Verifies validation for a missing last name.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingLastName() {
        // The error should name the missing field.
        const response = await requestWithoutRequiredField('last_name');
        expect(response.body.error).toContain('last_name');
    }

    /**
     * Verifies validation for a missing birthday.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingBirthday() {
        // The error should name the missing field.
        const response = await requestWithoutRequiredField('birthday');
        expect(response.body.error).toContain('birthday');
    }

    /**
     * Verifies validation for a missing marital status.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsMissingMaritalStatus() {
        // The error should name the missing field.
        const response = await requestWithoutRequiredField('marital_status');
        expect(response.body.error).toContain('marital_status');
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

        expect(response.body.error).toBe('birthday must be a valid date');
    }

    test('creates a valid user', createsValidUser);
    test('rejects missing first_name', rejectsMissingFirstName);
    test('rejects missing last_name', rejectsMissingLastName);
    test('rejects missing birthday', rejectsMissingBirthday);
    test('rejects missing marital_status', rejectsMissingMaritalStatus);
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
            validUser({ first_name: 'John' }),
            validUser({ first_name: 'Jane', marital_status: 'married' }),
        ]);

        const response = await request(app).get('/api/users').expect(200);

        expect(response.body).toHaveLength(2);
        expect(response.body.map(getFirstName).sort()).toEqual(['Jane', 'John']);
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
     * Verifies a found user response includes total expenses.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsSpecificUserWithExpenses() {
        // Seed one user so the lookup has a known target.
        const user = await User.create(validUser({ first_name: 'Jane' }));

        const response = await request(app).get(`/api/users/${user._id}`).expect(200);

        expect(response.body.user).toMatchObject({
            _id: user._id.toString(),
            first_name: 'Jane',
            last_name: 'Doe',
        });
        expect(response.body.total_expenses).toBe(0);
    }

    /**
     * Verifies malformed MongoDB identifiers are rejected.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsInvalidMongoId() {
        // Invalid identifiers should fail before a database lookup.
        const response = await request(app).get('/api/users/not-an-id').expect(400);
        expect(response.body.error).toBe('invalid user id');
    }

    /**
     * Verifies valid but unknown MongoDB identifiers return not found.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function rejectsUnknownUserId() {
        // Generate a valid identifier that is not stored in the database.
        const unknownId = new mongoose.Types.ObjectId();

        const response = await request(app).get(`/api/users/${unknownId}`).expect(404);
        expect(response.body.error).toBe('user not found');
    }

    test('returns a specific user with total expenses', returnsSpecificUserWithExpenses);
    test('returns 400 for invalid MongoDB id format', rejectsInvalidMongoId);
    test('returns 404 for a valid but unknown user id', rejectsUnknownUserId);
}

describe('User service endpoints', registerUserServiceTests);
