# REST API and Socket.IO

The backend defaults to `http://localhost:3000`. Routes are mounted directly at `/users` and `/auctions` (there is no `/api` prefix). The production target is `https://smart-hammer-server.ilham.bond`.

## REST conventions

Send and receive JSON. Successful responses use `{ "message", "data" }`; collection responses also include `meta`. Errors use `{ "message", "error": { "code", "fields", "details" } }`. A server error message is deliberately generic. Unknown fields on mutation bodies are rejected.

Except registration and login, all REST routes require:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

JWT subject identifies the user. Client-supplied ownership IDs are not trusted. Auction responses expose safe user objects such as `{ "id": 12, "username": "demo.bidder" }`; they do not include user email or password data.

## Authentication

### `POST /users/register` — public

Body: `username` (2–40 characters), `email` (valid, normalized to lowercase, max 254 characters), and `password` (8–72 UTF-8 bytes). Unknown keys are rejected.

```json
{
  "username": "demo.bidder",
  "email": "buyer@example.test",
  "password": "example-only-password"
}
```

Success is HTTP 201: `{ "message": "...", "data": { "user": { "id", "username", "email" } } }`. Password is hashed with bcryptjs and is never returned. Duplicate email returns 409 `EMAIL_EXISTS`; invalid fields return 400 `VALIDATION_ERROR`.

### `POST /users/login` — public

Body: `email`, `password`. Success is HTTP 200 with `data.user` and `data.accessToken`; token lifetime is `JWT_EXPIRES_IN` (default `7d`). Invalid credentials return 401 `INVALID_CREDENTIALS` without distinguishing unknown email from wrong password. Invalid body returns 400.

### `GET /users/me` — authenticated

Returns the caller's own `{ id, username, email }` profile. Used by the frontend to restore a persisted session. Missing, expired, malformed, or invalid JWT returns 401 `UNAUTHORIZED`.

## Auctions

All `/auctions` routes require JWT authentication.

### `GET /auctions`

Query: `page` (default 1), `limit` (default 10, maximum 50), optional `status` (`draft`, `live`, `ended`), `category`, `seller=me`, and `search` (title substring, at most 120 characters). Invalid or unknown query parameters return 400 `VALIDATION_ERROR`.

Without `seller=me`, the public list contains live/ended auctions; drafts are not searchable or enumerable. `seller=me` returns the caller's auctions, including drafts, with any additional filters applied. Stable newest-first ordering is used.

Success: `data` is an array of serialized auction objects and `meta` is `{ page, limit, total, totalPages }`. Public seller identity is `{ id, username }`.

### `POST /auctions`

Creates a draft owned by the JWT user; HTTP 201. Allowed fields:

```json
{
  "title": "Mirrorless camera body",
  "description": "Used camera body in working condition.",
  "condition": "used_good",
  "category": "camera",
  "productFacts": {
    "specifications": "24 MP sensor",
    "defects": null,
    "accessories": ["Body cap"],
    "warranty": null
  },
  "imageUrl": "https://images.example.test/camera.jpg",
  "startingPrice": 4500000,
  "minIncrement": 100000,
  "durationSeconds": 86400
}
```

Title is 3–120 characters; description is 10–3000; condition is `new`, `used_good`, or `used_fair`; category is one of `smartphone`, `laptop`, `pc`, `camera`, `tablet`, `monitor`, `audio`, `gaming_console`, `accessories`. Product facts allow specifications (max 2000), defects (max 1000), warranty (max 500), and up to 10 accessories (each max 100); omitted text facts become null and omitted accessories become an empty array. Image URL may be null/omitted or a valid HTTPS URL up to 2048 characters. Prices are integer rupiah from 1 to 2,000,000,000; duration is 60–604800 seconds. Starting price plus increment cannot exceed the maximum price.

The server assigns `sellerId`, initializes `currentPrice` to `startingPrice`, sets status to `draft`, version to 0, and leaves `startsAt`/`endsAt` null. Client-supplied lifecycle or ownership fields are rejected.

### `GET /auctions/:id`

Returns `data: { auction, serverNow }`. The auction contains product fields, current state, version, bid count, computed `nextMinimumBid`, and safe seller/highest-bidder/winner identities. A nonexistent auction or another user's draft returns 404 `NOT_FOUND`.

This REST detail endpoint returns the auction state, not the bid list. Fetch bid history separately or join the Socket.IO room for the combined snapshot.

### `PATCH /auctions/:id`

Accepts a non-empty partial set of the allowed creation fields. Omitted values remain unchanged. Only the owner of a `draft` may edit it. Live/ended auctions return 409 `AUCTION_NOT_DRAFT`; non-owner/missing drafts return 404. Protected fields and unknown keys return 400 `VALIDATION_ERROR`.

### `DELETE /auctions/:id`

Deletes only the caller's draft. Success returns `data: { id }`. Non-owner/missing drafts return 404; live or ended auctions return 409 `AUCTION_NOT_DRAFT`.

### `POST /auctions/:id/start`

Accepts no body fields (an empty JSON object is allowed). Only the owner can start a draft. On success, server time sets `startsAt`; `endsAt = startsAt + durationSeconds`, status becomes `live`, and version increments. The response is `data: { auction }`. Repeated/invalid transitions return 409 `AUCTION_NOT_DRAFT`.

## Bids

### `POST /auctions/:id/bids` — authenticated

Body contains only an integer `amount` (1–2,000,000,000 rupiah) and a UUID `clientRequestId`.

```json
{ "amount": 4550000, "clientRequestId": "550e8400-e29b-41d4-a716-446655440000" }
```

First minimum is `startingPrice`; later minimum is `currentPrice + minIncrement`. Sellers cannot bid on their own auctions. The auction must be live and server time must be before its deadline. The locked transaction writes the bid and updates the auction; an accepted bid may slide the deadline to at least accepted bid time plus one hour.

New acceptance returns HTTP 201; an identical retry for the same user, request ID, auction, and amount returns HTTP 200 with `replayed: true`. Reusing a request ID with a different payload returns 409 `IDEMPOTENCY_CONFLICT`. Other lifecycle/minimum errors use codes including `AUCTION_ENDED`, `AUCTION_NOT_LIVE`, `SELF_BID_FORBIDDEN`, `BID_TOO_LOW`, and `BID_LIMIT_REACHED`.

Response `data` includes `auction`, `bid`, top-level `clientRequestId`, and `replayed`. `bid.bidder` is `{ id, username }` or null if the associated account is unavailable. This public identity is consistent with history and live events; email and password fields are excluded.

### `GET /auctions/:id/bids` — authenticated

Query: `page` default 1; `limit` default 20, maximum 50. Returns newest-first bid records in `data` and `{ page, limit, total, totalPages }` in `meta`. Each record includes `id`, `auctionId`, `userId`, `amount`, `createdAt`, and safe `bidder: { id, username }` (or null). It excludes the idempotency key. Another user's private draft returns 404.

## Product Q&A

### `POST /auctions/:id/ai/questions` — authenticated

Body: `{ "question": "Does the listing mention a warranty?" }`; question length is 3–500 characters. Questions are available for live or ended auctions. Per-user requests are initially limited to one every 10 seconds (429 `RATE_LIMITED`). The server stores a private `pending` interaction, calls Groq, then persists `completed` or `failed`. The current controller returns HTTP 202 after successful processing; provider failure returns 503 `AI_UNAVAILABLE` after recording failed state when possible.

Success `data.interaction` includes IDs, kind/visibility, question, answer, missing information, validated sources, status, source version/time, error code, and timestamps. Q&A belongs to the authenticated user.

### `GET /auctions/:id/ai/interactions` — authenticated

Query: `page` default 1; `limit` default 10, maximum 50. Returns only the caller's private questions and public Auctioneer commentary, newest first, with pagination metadata. Other users' private questions/answers/sources are excluded.

## Common errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body, query, identifier, or unsupported field; details are field-specific. |
| 401 | `UNAUTHORIZED` | A valid Bearer token is required. |
| 403 | `SELF_BID_FORBIDDEN` | Seller attempted to bid on their own auction. |
| 404 | `NOT_FOUND` | Resource is missing or intentionally hidden by ownership/privacy rules. |
| 409 | Lifecycle, minimum, or idempotency code | Request conflicts with current auction state. |
| 429 | `RATE_LIMITED` | Product Q&A rate limit was reached. |
| 500 | `INTERNAL_ERROR` | Generic server failure; internal details are not returned. |
| 503 | `AI_UNAVAILABLE` | Product Q&A provider failed. |

## Socket.IO

Socket.IO attaches to the same HTTP server as Express. Connect to the backend origin with the JWT directly in the handshake (without `Bearer `):

```js
const socket = io('https://smart-hammer-server.ilham.bond', {
  auth: { token: accessToken }
});
```

Missing, malformed, expired, invalid, or revoked-by-account-deletion tokens are rejected. A successful socket joins the server-controlled `user:<userId>` room. Clients join an auction with `auction:join` and leave with `auction:leave`; the only accepted payload is `{ "auctionId": 123 }`. Auction access is checked on the server. Acknowledgements use `{ "ok": true, "data": { "auctionId": 123 } }` or `{ "ok": false, "error": { "code", "message" } }`.

### Snapshot and auction events

Auction join emits a fresh persisted snapshot to the joining socket:

```json
{
  "auctionId": 123,
  "version": 4,
  "serverNow": "2026-10-14T06:00:00.000Z",
  "data": {
    "auction": { "id": 123, "status": "live", "version": 4 },
    "bids": [{ "id": 88, "auctionId": 123, "userId": 12, "amount": 4550000, "createdAt": "2026-10-14T05:59:00.000Z", "bidder": { "id": 12, "username": "demo.bidder" } }],
    "aiInteractions": [],
    "bidsMeta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
    "aiMeta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

`auction:started`, `bid:updated`, and `auction:ended` are emitted to `auction:<id>` only after their database transaction commits. State events have `{ auctionId, version, serverNow, data }`; `data.auction` is the shared public auction serializer. Bid updates also carry `data.bid` and `data.bidCount`; bid identity uses `bidder: { id, username }`. End events include `data.winner`, `data.finalPrice`, and `data.bidCount`. No private account fields or idempotency key are broadcast.

Clients compare versions, ignore older state, deduplicate bids by ID, and request a fresh REST snapshot if the version sequence has a gap. Socket.IO does not replay missed events; reconnect and rejoin to resynchronize.

### AI lifecycle events

All AI events have the same envelope with `auctionId`, `version` (the captured `sourceVersion`), and `serverNow`; their data includes `interaction`, and may include a safe `message`.

- Private Product Q&A `ai:pending`, `ai:message`, and `ai:error` events go only to the authenticated owner's `user:<id>` room. Interactions carry `kind: "question"`, `visibility: "private"`, status, and validated sources as applicable.
- Public Auctioneer events with the same names go to `auction:<id>` only for `kind: "commentary"`, `visibility: "public"` interactions.
- `ai:message` follows successful persistence. `ai:error` is published only after the failed status is persisted. Provider details and secrets are never included.

Frontend listeners are owned by `client/src/lib/socket.js` and dispatch normalized events to Redux. REST remains the mutation authority; clients cannot use socket events to place bids or alter auction state.
