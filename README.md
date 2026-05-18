# cost-manager
Final project - Async Server Side Development

## Services

This project contains two Express services:

- User service: `user-service`, port `3002`
- About service: `about-service`, port `3003`

Both services connect to MongoDB using `MONGODB_URI`. The user service stores users, reads totals from the `costs` collection, and writes HTTP request logs to the `logs` collection. The about service also connects to MongoDB and writes request logs.

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
TEAM_MEMBERS=Ofek,Eyal,Guy
LOG_LEVEL=info
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
  "id": 123123,
  "first_name": "mosh",
  "last_name": "israeli",
  "birthday": "1990-01-01"
}
```

Required fields are `id`, `first_name`, `last_name`, and `birthday`. The `id` field is the public numeric user id and is different from MongoDB `_id`.

Get all users:

```http
GET /api/users
```

Get a specific user with total costs:

```http
GET /api/users/:id
```

Example response:

```json
{
  "first_name": "mosh",
  "last_name": "israeli",
  "id": 123123,
  "total": 245
}
```

The `total` value is calculated from the MongoDB `costs` collection by summing `cost` values for matching `user_id` or `id`.

Error responses use this format:

```json
{
  "id": 400,
  "message": "Missing required field: id"
}
```

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
[
  { "first_name": "Ofek", "last_name": "" },
  { "first_name": "Eyal", "last_name": "" },
  { "first_name": "Guy", "last_name": "" }
]
```

If `TEAM_MEMBERS` is configured with full names, use comma-separated values:

```env
TEAM_MEMBERS=Ofek Igud,Eyal Cohen,Guy Levi
```

## Logging

Both services use Pino for structured logging. Every HTTP request is also written to the MongoDB `logs` collection with method, path, status, duration, and creation time.

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
