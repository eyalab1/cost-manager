const request = require('supertest');

const app = require('../app');

// Preserve the process environment so tests do not leak configuration changes.
const originalTeamMembers = process.env.TEAM_MEMBERS;

/**
 * Restores TEAM_MEMBERS after each about service test.
 * @returns {void}
 */
function resetTeamMembers() {
    // Delete the variable if it did not exist before the test file ran.
    if (originalTeamMembers === undefined) {
        delete process.env.TEAM_MEMBERS;
        return;
    }

    // Restore the original configured value for the next test file.
    process.env.TEAM_MEMBERS = originalTeamMembers;
}

/**
 * Registers all about endpoint tests.
 * @returns {void}
 */
function registerAboutTests() {
    afterEach(resetTeamMembers);

    /**
     * Verifies team names can come from environment configuration.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsConfiguredTeamMembers() {
        // Configure three names through the environment boundary.
        process.env.TEAM_MEMBERS = 'Dana,Eli,Noa';

        const response = await request(app).get('/api/about').expect(200);
        expect(response.body).toEqual({ team: ['Dana', 'Eli', 'Noa'] });
    }

    /**
     * Verifies the hardcoded fallback team list.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function returnsFallbackTeamMembers() {
        // Remove configuration so the route uses the fallback list.
        delete process.env.TEAM_MEMBERS;

        const response = await request(app).get('/api/about').expect(200);
        expect(response.body).toEqual({ team: ['Alice', 'Bob', 'Charlie'] });
    }

    /**
     * Verifies comma-separated names are trimmed before response.
     * @returns {Promise<void>} Resolves after the assertion completes.
     */
    async function trimsTeamMemberNames() {
        // Include extra spaces to confirm request-independent normalization.
        process.env.TEAM_MEMBERS = ' Dana, Eli , Noa ';

        const response = await request(app).get('/api/about').expect(200);
        expect(response.body).toEqual({ team: ['Dana', 'Eli', 'Noa'] });
    }

    test('returns team members from TEAM_MEMBERS', returnsConfiguredTeamMembers);
    test('falls back to hardcoded team members when TEAM_MEMBERS is missing', returnsFallbackTeamMembers);
    test('trims comma-separated team member names', trimsTeamMemberNames);
}

describe('GET /api/about', registerAboutTests);
