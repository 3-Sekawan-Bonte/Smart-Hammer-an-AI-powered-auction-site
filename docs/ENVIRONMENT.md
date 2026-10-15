# Environment variable reference

Never commit local environment files or place server secrets in the frontend. Vite embeds every `VITE_*` value into the browser bundle, where users can inspect it. The API key, database connection, and JWT signing secret must stay server-side.

The checked-in examples are `client/.env.example`, `server/.env.example`, and `server/.env.test.example`. In development, backend dotenv loads `server/.env`; in production, the host must inject environment variables. Vite reads its `.env` files at start/build time.

## Frontend (`client/`)

| Variable | Purpose | Required | Example / environment | Secret? |
|---|---|---:|---|---:|
| `VITE_API_BASE_URL` | Axios REST origin, without `/api` prefix | Optional for local dev (defaults to localhost); required by production build check | `http://localhost:3000` locally; `https://smart-hammer-server.ilham.bond` in production | No; bundled publicly |
| `VITE_SOCKET_URL` | Socket.IO origin | Optional for local dev (falls back to API origin); required by production build check | `http://localhost:3000` locally; `https://smart-hammer-server.ilham.bond` in production | No; bundled publicly |

Production checks require absolute HTTPS URLs (HTTPS or WSS for the socket value), reject loopback/credentials, and verify the configured URLs are embedded in the build. Never put JWT secrets, passwords, database URLs, or `GROQ_API_KEY` in Vite variables.

## Backend runtime (`server/`)

| Variable | Purpose | Required | Example / environment | Secret? |
|---|---|---:|---|---:|
| `PORT` | Express/Socket.IO HTTP listen port; default 3000 | Optional | `3000`; local and GCE internal service | No |
| `DATABASE_URL` | PostgreSQL connection URL; takes precedence over split `DB_*` values | One database configuration required | `postgres://<user>:<password>@<host>:5432/<database>?sslmode=require`; local/production | Yes; contains credentials |
| `DB_NAME` | Database name when not using URL | Alternative required | `smart_hammer_development`; local | No |
| `DB_USERNAME` | Database user when not using URL | Alternative required | `<local-postgres-user>` | Yes in practice |
| `DB_PASSWORD` | Database password when not using URL | Optional if role has no password; normally required | `<local-postgres-password>` | Yes |
| `DB_HOST` | PostgreSQL hostname; defaults to `localhost` | Optional | `localhost`; local | No |
| `DB_PORT` | PostgreSQL port; defaults to 5432 | Optional | `5432` | No |
| `DB_SSL` | Enables PostgreSQL TLS options when exactly `true` | Optional; enable for Supabase | `true`; production | No |
| `JWT_SECRET` | Signs and verifies access JWTs | Required for auth | `<long-random-server-secret>`; all backend environments | Yes |
| `JWT_EXPIRES_IN` | JWT expiry passed to jsonwebtoken; defaults to `7d` | Optional | `7d` | No |
| `CLIENT_ORIGIN` | Comma-separated exact browser origins allowed by Express and Socket.IO CORS | Operationally required for production browser access; development has localhost defaults | `https://smart-hammer.ilham.bond` | No |
| `GROQ_API_KEY` | Authenticates server HTTP requests to Groq for Q&A/commentary | Optional to start server; required for AI answers | `<Groq API key>`; server only | Yes |
| `GROQ_MODEL` | Groq model name; defaults to `openai/gpt-oss-120b` | Optional | `openai/gpt-oss-120b`; server only | No |
| `NODE_ENV` | Controls runtime behavior, dotenv loading, and seed safety | Optional | `development`, `test`, or `production` | No |

When `DATABASE_URL` is absent, the server requires `DB_NAME` and `DB_USERNAME`; `DB_PASSWORD` may be empty, and host/port have local defaults. The current `DB_SSL=true` Sequelize option requests TLS but sets `rejectUnauthorized: false`; confirm whether the production database connection policy requires stronger certificate verification.

On the specified production topology, use the Supabase PostgreSQL URL as a server-side secret and enable `DB_SSL=true`. Set `CLIENT_ORIGIN` to the exact frontend origin. Do not put these values into Vercel's `VITE_*` variables.

## Demo seed (`server/`)

| Variable | Purpose | Required | Example / environment | Secret? |
|---|---|---:|---|---:|
| `DEMO_SEED_ENABLED` | Explicitly opts into local demo seed | Required to run seed; must not be true in production | `false` by default; `true` only for local dev/test | No |
| `DEMO_SEED_PASSWORD` | Password hashed for newly inserted demo users | Required when seeding; 8–72 UTF-8 bytes | `<private-local-demo-password>`; local only | Yes |

The seeder rejects `NODE_ENV=production`, requires the explicit opt-in, is not run at application startup, and does not overwrite existing demo users/auctions. The supported `npm run seed:demo` script explicitly selects Sequelize's development environment. The seeder's guard checks `NODE_ENV`, not Sequelize CLI's `--env` flag; do not manually run it with `--env production`. See [SEEDING.md](../server/SEEDING.md).

## Automated test database (`server/`)

Jest database tests use a dedicated PostgreSQL database only. Supply either `TEST_DATABASE_URL` or `TEST_DB_NAME` (must end in `_test`) and `TEST_DB_USERNAME`. Optional values are `TEST_DB_PASSWORD`, `TEST_DB_HOST` (default localhost), `TEST_DB_PORT` (default 5432), and `TEST_DB_SSL` (exactly `true` enables TLS options). These do not fall back to development `DATABASE_URL`/`DB_NAME`. Do not point them at production or the development database. See [TESTING.md](../server/TESTING.md).

## Optional frontend mock variables

These apply only to `client/mock`, never the real backend:

| Variable | Purpose |
|---|---|
| `BIDWAR_MOCK_DB` | JSON state file path |
| `BIDWAR_MOCK_PORT` | Mock HTTP/Socket.IO port (default 3001) |
| `BIDWAR_MOCK_JWT_SECRET` | Optional mock JWT secret; configured value must be at least 32 bytes |
| `BIDWAR_MOCK_FAULTS` | Enables mock fault controls when set to `1` outside tests |
| `AI_PROVIDER` | Mock AI provider selection; defaults to `mock` |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | Optional credentials/model/base URL for mock's compatible provider mode; never used by the real backend |
| `AI_MOCK_DELAY_MS`, `AI_MOCK_SCENARIO` | Mock response delay and test scenario controls |

Do not reuse mock-specific variables as production backend configuration. The production AI variables are `GROQ_API_KEY` and `GROQ_MODEL`.
