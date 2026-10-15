# Local development setup

## Prerequisites

- Node.js 20.19+ or 22.12+ (Vite's supported engine range), npm, and PostgreSQL.
- A PostgreSQL role allowed to create the local development and dedicated test databases.
- A Groq API key only if you want live Product Q&A and AI Auctioneer output. The application can start without it; AI requests will fail safely.

Use the package lockfiles with `npm ci`. Install separately in each application:

```sh
cd server
npm ci
cd ../client
npm ci
```

## Configure local environment

Create local files from the checked-in examples; never commit the resulting files:

```sh
cd server
cp .env.example .env
cd ../client
cp .env.example .env
```

In `server/.env`, set a local PostgreSQL database and role, a private random `JWT_SECRET`, and (optionally) `GROQ_API_KEY`. To test winner checkout, set the Midtrans Sandbox server/client keys and `MIDTRANS_IS_PRODUCTION=false`; leave payment credentials empty if you do not need checkout. Never use production payment credentials. Do not use production database credentials. The example server listens on port 3000; PostgreSQL defaults to port 5432. In `client/.env`, keep the API and socket URLs pointed at `http://localhost:3000`.

The backend loads `server/.env` when `NODE_ENV` is not `production`. Production configuration must be supplied by the hosting environment. Vite reads `client/.env` when starting or building the frontend; restart Vite after changing it.

## Create and migrate a development database

From `server/`, confirm `.env` points only to your local development database, then run:

```sh
npx sequelize-cli db:create --env development
npx sequelize-cli db:migrate --env development
```

The migration creates the `Payments` table for winner-only Sandbox payment attempts. It does not contact Midtrans or create transactions. Do not reset the database to apply it.

Migrations create the schema. They do not require a reset or table truncation. The server does not automatically migrate or seed at startup.

## Optional demo data

Demo data is opt-in and prohibited in production. In `server/.env`, set `DEMO_SEED_ENABLED=true` and replace the example `DEMO_SEED_PASSWORD` with a private local value of 8–72 UTF-8 bytes. From `server/`:

```sh
npm run seed:demo
```

This adds two demo accounts and three sample draft auctions when missing; existing demo rows are not overwritten. Both accounts use the configured demo password. See [Demo seeding](../server/SEEDING.md) for safeguards and account names. Do not enable this in a production environment.

## Start the applications

Use separate terminals from the repository root:

```sh
cd server && npm run dev
```

```sh
cd client && npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. `npm start` starts the backend without watch mode. The optional `npm run mock` in `client/` launches the JSON-backed development mock, not the production backend or PostgreSQL service.

## Tests

Frontend:

```sh
cd client
npm test
npm run build:production
```

Backend integration tests require a dedicated PostgreSQL database whose name ends in `_test`. Configure `server/.env.test` from `.env.test.example`; do not point it at development or production. From `server/`, provision and test:

```sh
npm run db:create:test
npm test
```

`npm test` applies pending migrations before running Jest. It does not reset the test database. Read [Backend testing](../server/TESTING.md) for cleanup and variables. Tests mock Groq; no live provider key is needed for normal tests.

## Configuration summary

The local frontend uses `VITE_API_BASE_URL=http://localhost:3000` and `VITE_SOCKET_URL=http://localhost:3000`. Backend development uses either `DATABASE_URL` or `DB_NAME`, `DB_USERNAME`, and related `DB_*` values, plus `JWT_SECRET`. `CLIENT_ORIGIN` should include the exact Vite origin when overriding development defaults. See the [environment reference](ENVIRONMENT.md) for required values and production settings.
