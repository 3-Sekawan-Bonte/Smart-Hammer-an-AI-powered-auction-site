# Smart Hammer

Smart Hammer is an electronics auction application for sellers and buyers. Sellers create and start listings; authenticated buyers place rupiah bids and follow the auction in real time. Product Q&A uses stored listing facts and, for selected external questions, Groq Browser Search. AI Auctioneer commentary accompanies important auction events.

The project demonstrates a complete auction lifecycle with persistent PostgreSQL state, server-side bid validation, Socket.IO updates, AI-assisted product information, and a winner-only Midtrans Snap Sandbox checkout. Payment testing is limited to BCA Virtual Account and Mandiri Bill Payment; production payments, wallets, and delivery are not supported.

Server deployed at: [https://smart-hammer-server.ilham.bond](https://smart-hammer-server.ilham.bond)

Client deployed at: [https://smart-hammer.ilham.bond](https://smart-hammer.ilham.bond)

## Features

- Username, email, and password registration; JWT login and session restoration.
- Auction drafts, seller-owned editing, category and title search, and 1, 3, or 7 day durations.
- Real-time bids with server-checked minimum increments, request idempotency, bidder usernames, and deadline extension.
- Auction countdown, automatic backend closure, winner/no-bid result, and recovery after server restart.
- Private Product Q&A per signed-in user, with saved answers and validated source links when Groq Browser Search is selected; AI uses Groq GPT-OSS 120B by default.
- Public AI Auctioneer commentary at auction start, every third accepted bid, and auction end.
- Winner-only Midtrans Snap Sandbox payment initiation and server-verified payment status for BCA Virtual Account and Mandiri Bill Payment.
- Light and dark theme preference managed with React Context.

The seller supplies listing details; those statements are not independently verified. PostgreSQL and the backend decide whether a bid is accepted, the current price, auction status and deadline, and the final result. AI output is informational and cannot modify auction state.

## Technology

React 19, Vite, Tailwind CSS 4, React Router, Redux Toolkit, React Context, Axios, Socket.IO Client, Node.js, Express, Socket.IO, Sequelize, PostgreSQL, JWT, bcryptjs, Groq Chat Completions API, Jest, and Supertest.

## Third-Party APIs and Services

This section describes integrations confirmed in the current source. Hosting targets are documented separately below; their presence in project configuration does not verify a live deployment. The application does not use Supabase REST APIs or Supabase Auth.

### • Groq API

**Purpose:** Generate private Product Q&A answers and public AI Auctioneer commentary. Selected external product research questions can use Groq's built-in Browser Search tool; this is part of the Groq request, not a separate search provider.

**Integration location:** `server/src/services/groqProvider.js`, called by `server/src/services/aiInteractionService.js` and `server/src/services/auctioneerService.js`.

**Endpoint or connection method:** Raw HTTP `POST https://api.groq.com/openai/v1/chat/completions` using Node's `fetch`; no Groq SDK is installed. The default model is `openai/gpt-oss-120b`, overridable with `GROQ_MODEL`. Listing-grounded Q&A and Auctioneer prompts request structured JSON. When the question classifier selects external research, the request includes Groq's `browser_search` built-in tool and the response parser validates the answer and citation metadata.

**Authentication:** `Authorization: Bearer <GROQ_API_KEY>` is sent by the backend only. Never put `GROQ_API_KEY` in a `VITE_*` variable, frontend source, or frontend bundle.

**Environment variables:** `GROQ_API_KEY` (required for provider requests; optional for starting the server) and `GROQ_MODEL` (optional; defaults to `openai/gpt-oss-120b`).

**Environment:** Groq hosted API. This repository does not configure a separate Groq sandbox environment.

**Data flow:** Product Q&A sends the user question plus bounded auction/listing facts captured by the backend. Selected external product questions also request browser search; validated answer and citation metadata are persisted as a private interaction for the asking user. Auctioneer requests send persisted auction facts and lifecycle/bid context; validated commentary is stored as public auction commentary. The provider does not decide bids, prices, deadlines, auction status, or winners.

**Failure handling:** Requests use an 18-second timeout for structured responses and a 45-second timeout for Browser Search. HTTP, network, timeout, malformed-response, and output-validation failures are mapped to safe internal codes. Q&A persists a failed interaction when possible and returns a generic unavailable response; Auctioneer generation is best effort and does not block auction lifecycle operations. Provider response bodies and keys are not returned to clients.

**Official documentation:** [Groq API Reference](https://console.groq.com/docs/api-reference), [Chat Completions](https://console.groq.com/docs/text-chat), and [Built-in Tools](https://console.groq.com/docs/tool-use/built-in-tools).

### • Midtrans Snap

**Purpose:** Let the verified winner of an ended auction test payment for the persisted final auction price.

**Integration location:** `server/src/services/midtransGateway.js` and `server/src/services/paymentService.js` create and verify payment transactions; `server/src/routes/paymentNotificationRoutes.js` receives notifications; `client/src/components/AuctionPayment.jsx` loads Snap.js and opens checkout.

**Endpoint or connection method:** The backend uses the official `midtrans-client` Node.js SDK. In Sandbox mode it creates transactions through `https://app.sandbox.midtrans.com/snap/v1/transactions` and retrieves status through `https://api.sandbox.midtrans.com/v2/{order_id}/status`. The frontend loads `https://app.sandbox.midtrans.com/snap/snap.js` and launches checkout with the Snap token returned by the backend. The application notification endpoint is `POST /payments/midtrans/notifications`.

**Authentication:** `MIDTRANS_SERVER_KEY` is used only by the backend SDK and for notification signature verification; it must never be sent to the client or included in logs. `MIDTRANS_CLIENT_KEY` is the public Sandbox key and is returned only to the authenticated winner when a pending checkout is available, for Snap.js initialization.

**Environment variables:** `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, and `MIDTRANS_IS_PRODUCTION` (must be exactly `false`). `MIDTRANS_PAYMENT_EXPIRY_HOURS` is optional and defaults to 24 (accepted range 1–72).

**Environment:** Sandbox only. Backend configuration rejects production mode. Production payment processing is not enabled. Only BCA Virtual Account (`bca_va`) and Mandiri Bill Payment (`echannel`) are enabled.

**Data flow:** The backend verifies the caller is the persisted winner of an ended auction, then uses the saved final auction price and creates a unique IDR order. The frontend receives the Snap token and opens checkout. Browser callbacks trigger a backend status refresh; they do not establish payment success. The webhook validates Midtrans's SHA-512 signature, then the backend fetches transaction status from Midtrans and persists verified order, amount, currency, method, transaction ID, and status. Payment data is restricted to the winner.

**Failure handling:** Snap requests have a 10-second HTTP timeout. Invalid signatures and mismatched order details are rejected; provider verification failures return a generic service error. Repeated notifications are safe, and a stale status does not downgrade an already verified paid record. Automated tests use mocked provider responses. Actual BCA and Mandiri Sandbox simulator transactions have not been verified in this environment.

**Official documentation:** [Midtrans Node.js SDK](https://github.com/Midtrans/midtrans-nodejs-client), [Snap integration guide](https://docs.midtrans.com/docs/snap-snap-integration-guide), [HTTP(S) notifications and signature verification](https://docs.midtrans.com/docs/https-notification-webhooks), [Get transaction status](https://docs.midtrans.com/reference/get-transaction-status), and [Sandbox payment testing](https://docs.midtrans.com/docs/testing-payment-on-sandbox).

### • PostgreSQL through Sequelize (Supabase deployment target)

**Purpose:** Persist users, auctions, bids, AI interactions, and payments.

**Integration location:** `server/src/config/database.js`, `server/config/database.js`, Sequelize models in `server/src/models/`, and migrations in `server/migrations/`.

**Endpoint or connection method:** The backend uses Sequelize's PostgreSQL dialect and `pg` driver. It accepts a PostgreSQL `DATABASE_URL`, or split `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` settings. `DATABASE_URL` takes precedence. `DB_SSL=true` enables TLS options in the backend runtime configuration. The repository does not contain a live connection string, so it does not establish whether the target Supabase connection is direct or uses a pooler; that choice belongs to the supplied URL.

**Authentication:** Database credentials are supplied to the backend process through server environment variables. Never put them in frontend variables, source code, or this README.

**Environment variables:** `DATABASE_URL` or the split `DB_*` values; `DB_SSL` is optional and is set to `true` for the documented Supabase deployment target. Database test suites use separate `TEST_DATABASE_URL` or `TEST_DB_*` settings.

**Environment:** The deployment documentation names Supabase PostgreSQL as the target. Runtime code is generic PostgreSQL and can connect to another compatible PostgreSQL service. The repository does not prove that the Supabase project or production database is currently provisioned or reachable.

**Data flow:** Sequelize authenticates to PostgreSQL and reads/writes through model queries and explicit migrations. The backend uses database transactions and row locks for bid and auction closure consistency. This is a direct PostgreSQL connection through a Node.js driver, not Supabase's REST Data API, Supabase client library, or Supabase Auth.

**Failure handling:** Database connectivity is checked during backend startup; startup recovery completes before the HTTP server begins listening. Database errors are handled by backend services/middleware, with generic public errors. `DB_SSL=true` currently configures TLS with `rejectUnauthorized: false`; certificate verification should be reviewed against deployment requirements.

**Official documentation:** [Supabase PostgreSQL connection options](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

### Hosting and Infrastructure

Project deployment documentation names [Vercel](https://vercel.com/docs) for the React frontend, [Google Compute Engine](https://cloud.google.com/compute/docs) for the Express/Socket.IO backend, and [Supabase PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) for the database. These are documented deployment targets, not verified live services. The repository includes frontend static hosting/reverse-proxy examples, but no Vercel deployment manifest or automated GCE deployment script; it does not prove that DNS, TLS, cloud resources, or a production release are active. No Vercel, Google Cloud, or Supabase management API is called by the application.

## Architecture

The `client/` Vite SPA calls the authenticated REST API and joins Socket.IO auction rooms. Redux Toolkit holds serializable authentication and auction state; a separate service owns the socket connection. The `server/` Express application routes requests through middleware, controllers, services, and Sequelize models. PostgreSQL is the durable source of truth. See [Architecture](docs/ARCHITECTURE.md) for component boundaries and data relationships.

## Run locally

Prerequisites: Node.js 20.19+ or 22.12+, npm, and PostgreSQL. Install each application's dependencies with `npm ci`, configure `server/.env` from `server/.env.example` and `client/.env` from `client/.env.example`, create and migrate a local database, then start the backend and frontend in separate terminals. The browser app defaults to `http://localhost:5173`; the backend defaults to `http://localhost:3000`.

Follow [Local setup](docs/SETUP.md) for exact commands, demo seeding, and test database setup. Environment variable meanings are in [Environment reference](docs/ENVIRONMENT.md).

## Documentation

- [Local setup](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [REST API and Socket.IO](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [User guide](docs/USER_GUIDE.md)
- [Environment reference](docs/ENVIRONMENT.md)
- [Backend testing guide](server/TESTING.md)
- [Demo seeding guide](server/SEEDING.md)
- [Project requirements](PROJECT.md), [PRD](PRD.md), [implementation architecture](ARCHITECTURE.md), and [task checklist](TASKS.md)

## Tests and production build

```sh
(cd client && npm test)
(cd client && npm run build:production)
(cd server && npm test)
```

Frontend tests use the local mock API and Socket.IO server for integration scenarios. The complete backend test command migrates and uses a dedicated PostgreSQL database; see the [testing guide](server/TESTING.md). Production frontend builds require valid HTTPS API and Socket.IO URLs.

## Current deployment target

The configured target is the frontend at [smart-hammer.ilham.bond](https://smart-hammer.ilham.bond), the backend at [smart-hammer-server.ilham.bond](https://smart-hammer-server.ilham.bond), PostgreSQL on Supabase, and Groq for AI. These target URLs are project-provided configuration, not a claim that a production deployment was verified in this repository. See [Deployment](docs/DEPLOYMENT.md).

## Limitations and planned work

Smart Hammer's auction values are simulated. Midtrans integration is Sandbox-only and must not be switched to production; it supports payment-flow testing for BCA Virtual Account and Mandiri Bill Payment but does not provide shipping or wallets. Product condition and seller claims are not independently verified; external AI research does not authenticate the item being auctioned. Production payment integration, production deployment, two-account browser verification against the live backend, and several responsive/browser checks remain tracked in `TASKS.md`. Upload-based images, auto-bidding, watchlists, and multi-server scaling are not implemented.

## REST API Reference

The backend mounts REST routes at `/users` and `/auctions` with no additional `/api` prefix. Examples use `http://localhost:3000`; substitute the backend URL for another environment. Send JSON mutation bodies with `Content-Type: application/json`. Authenticated routes require `Authorization: Bearer <JWT>` using the access token returned by login. The API derives the caller's identity from that verified token.

Successful responses use a JSON object with `message` and `data`; paginated responses also include `meta`. Errors use `{ "message": "...", "error": { "code": "...", "fields": {}, "details": {} } }`. Validation errors use HTTP 400 and put field-specific messages in `error.fields`. Unexpected server errors use HTTP 500 and the generic message `An unexpected error occurred.`. The examples below show the implemented response fields; IDs, timestamps, and generated AI text are illustrative.

### Authentication and Users

#### Register

**Method:** POST\
**Path:** `/users/register`\
**Purpose:** Create an account. Email is trimmed and lowercased; passwords are hashed before storage.\
**Authentication:** Not required.\
**Required headers:** `Content-Type: application/json`.

**Path parameters:** None.\
**Query parameters:** None.

**Request body:** JSON object; all fields are required. Unknown fields are rejected.

| Field | Type | Required | Validation |
|---|---|---:|---|
| `username` | string | Yes | Trimmed; 2–40 characters. |
| `email` | string | Yes | Valid email address; at most 254 characters; normalized to lowercase. |
| `password` | string | Yes | At least 8 characters and at most 72 UTF-8 bytes. |

**Example request:**

```bash
curl -X POST "http://localhost:3000/users/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"Rina","email":"rina@example.test","password":"example-pass-123"}'
```

**Success response:** HTTP 201.

```json
{
  "message": "User registered successfully.",
  "data": { "user": { "id": 41, "username": "Rina", "email": "rina@example.test" } }
}
```

The returned user contains `id` (integer), `username`, and normalized `email`. Passwords and hashes are not returned.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid, missing, or unknown fields; HTTP 409 `EMAIL_EXISTS` when the email is already registered; HTTP 500 `INTERNAL_ERROR` for an unexpected server or database failure.

**Additional behavior:** Registration does not create a login token. Log in separately to receive one.

#### Login

**Method:** POST\
**Path:** `/users/login`\
**Purpose:** Verify account credentials and issue a signed JWT.\
**Authentication:** Not required.\
**Required headers:** `Content-Type: application/json`.

**Path parameters:** None.\
**Query parameters:** None.

**Request body:** JSON object; both fields are required. Unknown fields are rejected.

| Field | Type | Required | Validation |
|---|---|---:|---|
| `email` | string | Yes | Valid email address; trimmed and lowercased before lookup. |
| `password` | string | Yes | Nonempty string. |

**Example request:**

```bash
curl -X POST "http://localhost:3000/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"rina@example.test","password":"example-pass-123"}'
```

**Success response:** HTTP 200.

```json
{
  "message": "Login successful.",
  "data": {
    "user": { "id": 41, "username": "Rina", "email": "rina@example.test" },
    "accessToken": "<JWT>"
  }
}
```

`accessToken` is the bearer token for protected requests. Its signing secret is server-side; expiration is configured by `JWT_EXPIRES_IN` (defaults to seven days).

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid fields; HTTP 401 `INVALID_CREDENTIALS` for an unknown email or incorrect password; HTTP 500 `INTERNAL_ERROR` for unexpected failures, including unavailable JWT configuration.

**Additional behavior:** Unknown email and wrong password use the same response to avoid distinguishing those cases.

#### Get current user

**Method:** GET\
**Path:** `/users/me`\
**Purpose:** Return the user represented by the verified JWT.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** None.\
**Query parameters:** None.\
**Request body:** No request body is required.

**Example request:**

```bash
curl "http://localhost:3000/users/me" -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200.

```json
{
  "message": "Authenticated user retrieved successfully.",
  "data": { "user": { "id": 41, "username": "Rina", "email": "rina@example.test" } }
}
```

**Error responses:** HTTP 401 `UNAUTHORIZED` for a missing, invalid, or expired token, or when its user no longer exists; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

### Auction Listings and Details

Auction objects use integer rupiah values and contain `id`, `sellerId`, `title`, `description`, `condition`, `category`, `productFacts`, `imageUrl`, `startingPrice`, `currentPrice`, `bidCount`, `nextMinimumBid`, `minIncrement`, `durationSeconds`, `startsAt`, `endsAt`, `status`, `finalPrice`, `highestBidderId`, `winnerId`, `version`, `createdAt`, `updatedAt`, and public `seller`, `highestBidder`, and `winner` summaries (`{id, username}` or `null`). `bidCount` and `nextMinimumBid` may be `null` when not available or applicable. `productFacts` contains `specifications`, `defects`, `accessories`, and `warranty`.

#### List auctions

**Method:** GET\
**Path:** `/auctions`\
**Purpose:** Return a paginated auction listing with optional filters.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** None.\
**Query parameters:** All are optional; unknown parameters are rejected.

| Parameter | Type | Default | Validation and behavior |
|---|---|---:|---|
| `page` | positive integer | `1` | Page number. |
| `limit` | positive integer | `10` | Maximum `50`. |
| `status` | string | None | `draft`, `live`, or `ended`. Drafts are only listed when `seller=me`. |
| `category` | string | None | `smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, or `accessories`. |
| `seller` | string | None | Only `me` is accepted; returns the authenticated seller's auctions, including drafts. Arbitrary seller IDs are not supported. |
| `search` | string | None | Case-insensitive title substring search; at most 120 characters. |

Without `seller=me`, the default listing includes live and ended auctions and excludes drafts. Results sort by creation time descending, then ID descending.

**Request body:** No request body is required.

**Example request:**

```bash
curl "http://localhost:3000/auctions?status=live&category=camera&page=1&limit=10&search=Sony" \
  -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200.

```json
{
  "message": "Auctions retrieved successfully.",
  "data": [
    {
      "id": 8, "sellerId": 41, "title": "Sony Alpha camera",
      "description": "Mirrorless camera in good working condition.",
      "condition": "used_good", "category": "camera",
      "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": [], "warranty": null },
      "imageUrl": null, "startingPrice": 1000000, "currentPrice": 1000000,
      "bidCount": 0, "nextMinimumBid": 1000000, "minIncrement": 50000,
      "durationSeconds": 86400, "startsAt": "2026-10-15T10:00:00.000Z",
      "endsAt": "2026-10-16T10:00:00.000Z", "status": "live", "finalPrice": null,
      "highestBidderId": null, "winnerId": null, "version": 1,
      "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T10:00:00.000Z",
      "seller": { "id": 41, "username": "Rina" }, "highestBidder": null, "winner": null
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

`data` is an array of auction objects. `meta` provides integer `page`, `limit`, `total`, and `totalPages` values. Public user summaries omit email and credentials.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid pagination, filters, or unknown query parameters; HTTP 401 `UNAUTHORIZED`; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** An empty result is HTTP 200 with an empty `data` array and zero totals.

#### Get auction details

**Method:** GET\
**Path:** `/auctions/:id`\
**Purpose:** Return an auction's current serialized state and server timestamp.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.\
**Request body:** No request body is required.

**Example request:**

```bash
curl "http://localhost:3000/auctions/8" -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200; `data.auction` has the auction fields described above, and `serverNow` is the server's ISO 8601 UTC time.

```json
{
  "message": "Auction retrieved successfully.",
  "data": {
    "auction": { "id": 8, "sellerId": 41, "title": "Sony Alpha camera", "description": "Mirrorless camera in good working condition.", "condition": "used_good", "category": "camera", "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": [], "warranty": null }, "imageUrl": null, "startingPrice": 1000000, "currentPrice": 1100000, "bidCount": 2, "nextMinimumBid": 1150000, "minIncrement": 50000, "durationSeconds": 86400, "startsAt": "2026-10-15T10:00:00.000Z", "endsAt": "2026-10-16T10:00:00.000Z", "status": "live", "finalPrice": null, "highestBidderId": 52, "winnerId": null, "version": 3, "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T10:05:00.000Z", "seller": { "id": 41, "username": "Rina" }, "highestBidder": { "id": 52, "username": "Dimas" }, "winner": null },
    "serverNow": "2026-10-15T10:05:01.000Z"
  }
}
```

**Error responses:** HTTP 400 `VALIDATION_ERROR` for a non-positive or invalid ID; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` if absent or if it is another user's private draft; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** Auction state and timestamps come from the backend. The endpoint does not include bid-history rows; use the bid-history endpoint for those.

### Auction Draft Management

Auction create and update bodies accept only the fields in the table below. The same validations apply to an update when a field is supplied; updates are partial. Unknown fields and server-controlled lifecycle fields are rejected.

| Field | Type | Required on create | Validation |
|---|---|---:|---|
| `title` | string | Yes | Trimmed; 3–120 characters. |
| `description` | string | Yes | Trimmed; 10–3000 characters. |
| `condition` | string | Yes | `new`, `used_good`, or `used_fair`. |
| `category` | string | Yes | `smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, or `accessories`. |
| `productFacts` | object | No | Only `specifications`, `defects`, `accessories`, and `warranty`. Text fields are string or `null` (maxima: 2000, 1000, and 500 characters); `accessories` is at most 10 strings of at most 100 characters each. Omitted facts default to null text fields and an empty accessories array. |
| `imageUrl` | string or null | No | Valid HTTPS URL, maximum 2048 characters; omitted or null becomes null. |
| `startingPrice` | integer | Yes | Rupiah amount from 1 through 2,000,000,000. |
| `minIncrement` | integer | Yes | Rupiah amount from 1 through 2,000,000,000; starting price plus increment may not exceed 2,000,000,000. |
| `durationSeconds` | integer | Yes | 60 through 604,800 seconds. |

Clients may not set `sellerId`, `currentPrice`, `status`, `startsAt`, `endsAt`, `highestBidderId`, `winnerId`, or `version`.

#### Create auction draft

**Method:** POST\
**Path:** `/auctions`\
**Purpose:** Create a seller-owned draft.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>` and `Content-Type: application/json`.

**Path parameters:** None.\
**Query parameters:** None.

**Request body:** JSON object containing all fields marked required in the draft field table. Optional `imageUrl` may be omitted or null. Unknown and protected fields are rejected.

**Example request:**

```bash
curl -X POST "http://localhost:3000/auctions" \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"title":"Sony Alpha camera","description":"Mirrorless camera in good working condition.","condition":"used_good","category":"camera","productFacts":{"specifications":"24 MP sensor","defects":null,"accessories":["Body cap"],"warranty":null},"imageUrl":"https://example.test/camera.jpg","startingPrice":1000000,"minIncrement":50000,"durationSeconds":86400}'
```

**Success response:** HTTP 201.

```json
{
  "message": "Auction draft created successfully.",
  "data": { "auction": { "id": 8, "sellerId": 41, "title": "Sony Alpha camera", "description": "Mirrorless camera in good working condition.", "condition": "used_good", "category": "camera", "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": ["Body cap"], "warranty": null }, "imageUrl": "https://example.test/camera.jpg", "startingPrice": 1000000, "currentPrice": 1000000, "bidCount": null, "nextMinimumBid": null, "minIncrement": 50000, "durationSeconds": 86400, "startsAt": null, "endsAt": null, "status": "draft", "finalPrice": null, "highestBidderId": null, "winnerId": null, "version": 0, "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T09:00:00.000Z", "seller": { "id": 41, "username": "Rina" }, "highestBidder": null, "winner": null } }
}
```

The auction has `status: "draft"`, `currentPrice` equal to `startingPrice`, `version: 0`, null `startsAt`/`endsAt`, and the authenticated user as seller.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid, missing, unknown, or protected fields, or if starting price plus increment exceeds the monetary maximum; HTTP 401 `UNAUTHORIZED`; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** The seller ID is taken from the JWT, not the body. Creation does not start the auction.

#### Update auction draft

**Method:** PATCH\
**Path:** `/auctions/:id`\
**Purpose:** Partially edit an owned draft.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>` and `Content-Type: application/json`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.

**Request body:** A nonempty JSON object with one or more allowed draft fields from the create-auction field table. Supplied values use the same validation rules; omitted values are preserved. Protected and unknown fields are rejected.

**Example request:**

```bash
curl -X PATCH "http://localhost:3000/auctions/8" \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"title":"Sony Alpha camera with body cap"}'
```

**Success response:** HTTP 200.

```json
{
  "message": "Auction draft updated successfully.",
  "data": { "auction": { "id": 8, "sellerId": 41, "title": "Sony Alpha camera with body cap", "description": "Mirrorless camera in good working condition.", "condition": "used_good", "category": "camera", "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": ["Body cap"], "warranty": null }, "imageUrl": "https://example.test/camera.jpg", "startingPrice": 1000000, "currentPrice": 1000000, "bidCount": null, "nextMinimumBid": null, "minIncrement": 50000, "durationSeconds": 86400, "startsAt": null, "endsAt": null, "status": "draft", "finalPrice": null, "highestBidderId": null, "winnerId": null, "version": 0, "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T09:10:00.000Z", "seller": { "id": 41, "username": "Rina" }, "highestBidder": null, "winner": null } }
}
```

**Error responses:** HTTP 400 `VALIDATION_ERROR`; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or one not owned by the caller; HTTP 409 `AUCTION_NOT_DRAFT` if the owned auction is live or ended; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** Ownership and draft status are checked in the backend within the update transaction.

#### Delete auction draft

**Method:** DELETE\
**Path:** `/auctions/:id`\
**Purpose:** Delete an owned draft.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.\
**Request body:** No request body is required.

**Example request:**

```bash
curl -X DELETE "http://localhost:3000/auctions/8" -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200.

```json
{ "message": "Auction draft deleted successfully.", "data": { "id": 8 } }
```

**Error responses:** HTTP 400 `VALIDATION_ERROR` for an invalid ID; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or one not owned by the caller; HTTP 409 `AUCTION_NOT_DRAFT` if the auction is live or ended; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** Only the auction draft is deleted. The endpoint does not delete live or ended auctions.

### Auction Lifecycle

#### Start auction

**Method:** POST\
**Path:** `/auctions/:id/start`\
**Purpose:** Transition an owned draft to live.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`. `Content-Type: application/json` may be sent when using the optional empty object body.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.

**Request body:** No body is required; an empty JSON object is accepted. Nonempty bodies are rejected because lifecycle fields are server-controlled.

**Example request:**

```bash
curl -X POST "http://localhost:3000/auctions/8/start" -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200, `{ "message": "Auction started successfully.", "data": { "auction": <auction> } }`.

```json
{
  "message": "Auction started successfully.",
  "data": { "auction": { "id": 8, "sellerId": 41, "title": "Sony Alpha camera", "description": "Mirrorless camera in good working condition.", "condition": "used_good", "category": "camera", "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": [], "warranty": null }, "imageUrl": null, "startingPrice": 1000000, "currentPrice": 1000000, "bidCount": 0, "nextMinimumBid": 1000000, "minIncrement": 50000, "durationSeconds": 86400, "startsAt": "2026-10-15T10:00:00.000Z", "endsAt": "2026-10-16T10:00:00.000Z", "status": "live", "finalPrice": null, "highestBidderId": null, "winnerId": null, "version": 1, "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T10:00:00.000Z", "seller": { "id": 41, "username": "Rina" }, "highestBidder": null, "winner": null } }
}
```

**Error responses:** HTTP 400 `VALIDATION_ERROR` for an invalid ID or nonempty body; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or one not owned by the caller; HTTP 409 `AUCTION_NOT_DRAFT` for a repeated start or non-draft auction; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** The server sets `startsAt` and computes `endsAt` from `durationSeconds`, sets status to live, and increments `version` in a transaction. Starting also publishes `auction:started` and triggers Auctioneer commentary after the state change; realtime delivery and AI failure do not undo the start.

### Bidding and Bid History

#### Submit bid

**Method:** POST\
**Path:** `/auctions/:id/bids`\
**Purpose:** Submit an authenticated bid on a live auction.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>` and `Content-Type: application/json`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.

**Request body:** JSON object with exactly these fields; unknown or server-controlled fields are rejected.

| Field | Type | Required | Validation |
|---|---|---:|---|
| `amount` | integer | Yes | Rupiah amount from 1 through 2,000,000,000; must meet the current minimum bid. |
| `clientRequestId` | UUID string | Yes | Identifies this caller's request for idempotent retry. |

**Example request:**

```bash
curl -X POST "http://localhost:3000/auctions/8/bids" \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"amount":1000000,"clientRequestId":"8c26b81b-aea6-4fe7-a183-7c9941beaf12"}'
```

**Success response:** HTTP 201 for a newly accepted bid; HTTP 200 when returning the result of an identical idempotent retry.

```json
{
  "message": "Bid accepted successfully.",
  "data": {
    "auction": { "id": 8, "sellerId": 41, "title": "Sony Alpha camera", "description": "Mirrorless camera in good working condition.", "condition": "used_good", "category": "camera", "productFacts": { "specifications": "24 MP sensor", "defects": null, "accessories": [], "warranty": null }, "imageUrl": null, "startingPrice": 1000000, "currentPrice": 1000000, "bidCount": 1, "nextMinimumBid": 1050000, "minIncrement": 50000, "durationSeconds": 86400, "startsAt": "2026-10-15T10:00:00.000Z", "endsAt": "2026-10-16T10:00:00.000Z", "status": "live", "finalPrice": null, "highestBidderId": 52, "winnerId": null, "version": 2, "createdAt": "2026-10-15T09:00:00.000Z", "updatedAt": "2026-10-15T10:00:00.000Z", "seller": { "id": 41, "username": "Rina" }, "highestBidder": { "id": 52, "username": "Dimas" }, "winner": null },
    "bid": { "id": 93, "auctionId": 8, "userId": 52, "amount": 1000000, "clientRequestId": "8c26b81b-aea6-4fe7-a183-7c9941beaf12", "createdAt": "2026-10-15T10:00:00.000Z", "bidder": { "id": 52, "username": "Dimas" } },
    "clientRequestId": "8c26b81b-aea6-4fe7-a183-7c9941beaf12",
    "replayed": false
  }
}
```

On replay the message is `Original bid result returned.` and `replayed` is `true`; the original bid and auction result are returned.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid ID/body; HTTP 401 `UNAUTHORIZED`; HTTP 403 `SELF_BID_FORBIDDEN` if the seller bids on their own auction; HTTP 404 `NOT_FOUND` for a missing auction; HTTP 409 `AUCTION_NOT_LIVE`, `AUCTION_ENDED`, `BID_TOO_LOW`, `BID_LIMIT_REACHED`, or `IDEMPOTENCY_CONFLICT` for the corresponding state, minimum, price ceiling, or reused request ID with different bid data; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** Acceptance and auction price/highest bidder/deadline/version updates are transactional. Repeating the same `clientRequestId` for the same user, auction, and amount does not create another bid or extend the deadline again. A newly accepted bid may extend the deadline; the response is authoritative. Accepted bids publish `bid:updated` after commit. Every third accepted bid may trigger public AI Auctioneer commentary.

#### Get bid history

**Method:** GET\
**Path:** `/auctions/:id/bids`\
**Purpose:** Return paginated bid history, newest first, with public bidder usernames.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** `page` is a positive integer defaulting to `1`; `limit` is a positive integer defaulting to `20`, maximum `50`. Unknown parameters are rejected.\
**Request body:** No request body is required.

**Example request:**

```bash
curl "http://localhost:3000/auctions/8/bids?page=1&limit=20" -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200.

```json
{
  "message": "Bids retrieved successfully.",
  "data": [
    { "id": 93, "auctionId": 8, "userId": 52, "amount": 1000000, "createdAt": "2026-10-15T10:00:00.000Z", "bidder": { "id": 52, "username": "Dimas" } }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Each history bid has integer IDs and amount, ISO `createdAt`, and `bidder` as `{id, username}` or `null`. The public history omits the idempotency key.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid ID, pagination, or unknown query parameters; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or another user's private draft; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** Draft history is visible only to its seller. Live and ended auction history is available to authenticated users.

### Product Q&A and AI Interactions

#### Ask a product question

**Method:** POST\
**Path:** `/auctions/:id/ai/questions`\
**Purpose:** Submit a question about an auction product and persist the private AI interaction.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>` and `Content-Type: application/json`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** None.

**Request body:** JSON object with exactly one field: `question` (string, required), trimmed to 3–500 characters. Unknown fields are rejected.

**Example request:**

```bash
curl -X POST "http://localhost:3000/auctions/8/ai/questions" \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"question":"What accessories are included?"}'
```

**Success response:** HTTP 202.

```json
{
  "message": "AI interaction processed.",
  "data": {
    "interaction": {
      "id": 204, "auctionId": 8, "userId": 52, "kind": "question", "visibility": "private",
      "question": "What accessories are included?", "answer": "The listing does not specify any accessories.",
      "missingInformation": ["accessories"], "sources": [], "status": "completed",
      "sourceVersion": 2, "snapshotAt": "2026-10-15T10:01:00.000Z", "errorCode": null,
      "createdAt": "2026-10-15T10:01:00.000Z", "updatedAt": "2026-10-15T10:01:02.000Z", "user": null
    }
  }
}
```

The interaction includes `id`, `auctionId`, nullable `userId`, `kind`, `visibility`, `question`, nullable `answer`, arrays `missingInformation` and `sources`, `status`, `sourceVersion`, ISO `snapshotAt`/timestamps, nullable `errorCode`, and an optional public `{id, username}` user summary. Question interactions are private to their asker. Source entries, when present, contain `reference`, `title`, and validated HTTPS `url`.

**Error responses:** HTTP 400 `VALIDATION_ERROR`; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or another user's private draft; HTTP 409 `AUCTION_NOT_LIVE` when questions are requested for a draft; HTTP 429 `RATE_LIMITED` when the per-user question interval applies (`details.retryAfterSeconds` is `10`); HTTP 503 `AI_UNAVAILABLE` when the provider fails; HTTP 500 `INTERNAL_ERROR` if the interaction cannot be saved or an unexpected failure occurs. Error responses retain the common `fields` and `details` objects.

**Additional behavior:** Questions are available for live and ended auctions. A request is rate-limited per user; persisted private interactions are listed only to that user. The response uses HTTP 202 even though this server currently awaits the provider before responding. `ai:pending`, `ai:message`, and `ai:error` broadcasts, when connected, target the asking user's private socket room; delivery is best effort and persisted interaction history is authoritative. Groq configuration and keys remain server-side.

#### List AI interactions

**Method:** GET\
**Path:** `/auctions/:id/ai/interactions`\
**Purpose:** List the caller's private Product Q&A interactions together with public AI Auctioneer commentary.\
**Authentication:** Required.\
**Required headers:** `Authorization: Bearer <JWT>`.

**Path parameters:** `id` — positive integer auction ID.\
**Query parameters:** `page` is a positive integer defaulting to `1`; `limit` is a positive integer defaulting to `10`, maximum `50`. Unknown parameters are rejected.\
**Request body:** No request body is required.

**Example request:**

```bash
curl "http://localhost:3000/auctions/8/ai/interactions?page=1&limit=10" \
  -H "Authorization: Bearer <JWT>"
```

**Success response:** HTTP 200.

```json
{
  "message": "AI interactions retrieved successfully.",
  "data": [
    { "id": 204, "auctionId": 8, "userId": 52, "kind": "question", "visibility": "private", "question": "What accessories are included?", "answer": "The listing does not specify any accessories.", "missingInformation": ["accessories"], "sources": [], "status": "completed", "sourceVersion": 2, "snapshotAt": "2026-10-15T10:01:00.000Z", "errorCode": null, "createdAt": "2026-10-15T10:01:00.000Z", "updatedAt": "2026-10-15T10:01:02.000Z", "user": { "id": 52, "username": "Dimas" } }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

`data` contains serialized interactions and `meta` contains pagination totals. Private question rows are scoped to the authenticated user; public commentary can be included for all authorized viewers.

**Error responses:** HTTP 400 `VALIDATION_ERROR` for invalid ID, pagination, or unknown query parameters; HTTP 401 `UNAUTHORIZED`; HTTP 404 `NOT_FOUND` for a missing auction or another user's private draft; HTTP 500 `INTERNAL_ERROR` for unexpected failures.

**Additional behavior:** The list is newest first. There is no implemented REST endpoint for fetching one interaction by its ID; interaction detail is available through this collection response.

### Winner payments — Midtrans Sandbox

Payment endpoints are Sandbox-only. `POST /auctions/:id/payments` and `GET /auctions/:id/payments` require a JWT and are available only to the verified winner of an ended auction. The create request has no body fields; the backend derives amount from the persisted final auction price and winning bid. New checkout returns HTTP 201; a reused pending or paid record returns HTTP 200. Pending checkout includes `snapToken`, `redirectUrl`, and the public `clientKey`; the server key is never returned. Enabled methods are BCA Virtual Account (`bca_va`) and Mandiri Bill Payment (`echannel`).

```bash
curl -X POST "http://localhost:3000/auctions/8/payments" \
  -H "Authorization: Bearer <WINNER_JWT>" -H "Content-Type: application/json" -d '{}'

curl "http://localhost:3000/auctions/8/payments" \
  -H "Authorization: Bearer <WINNER_JWT>"
```

The public `POST /payments/midtrans/notifications` endpoint accepts provider notifications without a user JWT, but verifies the Sandbox signature and fetches the transaction status from Midtrans before persisting any status. Browser checkout callbacks only refresh status. Non-winners receive 404 `NOT_FOUND`; invalid bodies/IDs return 400 `VALIDATION_ERROR`; unsafe/missing payment configuration and provider errors return generic 503 responses. Configure `MIDTRANS_IS_PRODUCTION=false`, `MIDTRANS_SERVER_KEY`, and `MIDTRANS_CLIENT_KEY` only with Sandbox credentials. See [API Reference](docs/API.md) and [Environment reference](docs/ENVIRONMENT.md) for details.

## Socket.IO Reference

Socket.IO connects to the backend origin (local default `http://localhost:3000`; production target `https://smart-hammer-server.ilham.bond`) on the default `/socket.io` path. The frontend uses `VITE_SOCKET_URL`, then `VITE_API_BASE_URL`, then the local default. Authenticate with the same JWT as REST, passed directly without the `Bearer ` prefix:

```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });
```

Missing, invalid, or expired JWTs are rejected. On connect, the server joins the authenticated socket to `user:<userId>`. Clients join and leave auction rooms using only `{ "auctionId": 8 }`:

```js
socket.emit('auction:join', { auctionId: 8 }, (ack) => console.log(ack));
socket.emit('auction:leave', { auctionId: 8 }, (ack) => console.log(ack));
```

Acknowledgements are `{ "ok": true, "data": { "auctionId": 8 } }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`. Joining validates auction access and sends `auction:snapshot` to that socket. Snapshot payloads use `{ "auctionId", "version", "serverNow", "data" }`; `data` contains the shared serialized `auction`, the 20 newest `bids` (with safe `{id, username}` bidder summaries), up to 20 public `aiInteractions`, and `bidsMeta` and `aiMeta` pagination objects.

The server emits these auction events. State-change events are broadcast to `auction:<auctionId>`; the snapshot is sent only to the socket that joined:

| Event | Payload data |
|---|---|
| `auction:snapshot` | `auction`, recent `bids`, public `aiInteractions`, and their pagination metadata. |
| `auction:started` | `auction` with persisted start/deadline state. |
| `bid:updated` | `auction`, accepted public `bid`, and `bidCount`. |
| `auction:ended` | `auction`, `winner`, `finalPrice`, and `bidCount`. |

Each event includes `auctionId`, persisted `version`, and ISO UTC `serverNow` around its `data`. State-change events follow successful database commits. Public bid payloads omit email, credentials, and `clientRequestId`.

AI events use `{ "auctionId", "version", "serverNow", "data": { "interaction", "message?" } }`, with `version` taken from the interaction's captured source version:

- Private Product Q&A `ai:pending`, `ai:message`, and `ai:error` events go to the asker's `user:<userId>` room only.
- Public AI Auctioneer commentary uses those same event names in `auction:<auctionId>`; only public `commentary` interactions are published there.
- `ai:message` follows persisted completion. `ai:error` follows persisted failure when persistence succeeds. Delivery is best effort; REST history is authoritative.

After reconnecting, the client reauthenticates, rejoins the desired room, and receives a fresh snapshot. Socket.IO does not replay missed events. The frontend compares auction versions and can load a REST snapshot if it detects a gap. See [the detailed REST and Socket.IO contracts](docs/API.md#socketio) for the full snapshot example and additional behavior.
