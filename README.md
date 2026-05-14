# cost-manager
Final project - Async Server Side Development

## Services

This project contains two Express services:

- User service: `user-service`, port `3002`
- About service: `about-service`, port `3003`

Both services use MongoDB configuration from `MONGODB_URI`. The user service stores users in MongoDB. The about service connects to MongoDB on startup to match the project database requirement, but its endpoint returns team metadata from configuration.

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file based on `.env.example`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/cost-manager
USER_SERVICE_PORT=3002
ABOUT_SERVICE_PORT=3003
TEAM_MEMBERS=Alice,Bob,Charlie
```

## Run

Start the user service:

```bash
npm run start:users
```

Start the about service:

```bash
npm run start:about
```

Development mode with auto-reload:

```bash
npm run dev:users
npm run dev:about
```

## User Service API

Base URL:

```text
http://localhost:3002
```

Create a user:

```http
POST /api/add
Content-Type: application/json
```

Example body:

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "birthday": "1995-01-01",
  "marital_status": "single"
}
```

Get all users:

```http
GET /api/users
```

Get a specific user with total expenses:

```http
GET /api/users/:id
```

The `total_expenses` value is currently `0` because there is no expenses service or expenses collection yet.

## About Service API

Base URL:

```text
http://localhost:3003
```

Get team information:

```http
GET /api/about
```

Example response:

```json
{
  "team": ["Alice", "Bob", "Charlie"]
}
```

## Tests

Run all endpoint tests:

```bash
npm test
```

Run only user service tests:

```bash
npm run test:users
```

Run only about service tests:

```bash
npm run test:about
```

The user service tests use an in-memory MongoDB instance, so they do not require a local MongoDB server.
