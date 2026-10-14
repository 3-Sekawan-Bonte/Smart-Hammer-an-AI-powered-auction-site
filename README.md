# Smart Hammer

Frontend auction marketplace for electronics. FE-01 and FE-02 foundations plus the FE-03 seller auction lifecycle are implemented against a development-only mock API. Production authentication, transactional bidding, realtime synchronization, and AI features depend on their backend phases.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 requirement)
- npm

## Setup and run

From the repository root:

```sh
npm run setup
npm run mock
```

In a second terminal:

```sh
npm run dev
```

The frontend runs at `http://localhost:5173`; the mock API listens at `http://localhost:3001`. Set `BIDWAR_MOCK_PORT` to change the mock port. Set `BIDWAR_MOCK_DB` to use a separate local database file for isolated demos or QA.

Copy `client/.env.example` to `client/.env.local` to override `VITE_API_BASE_URL`. `VITE_SOCKET_URL` stays blank because realtime bidding is outside FE-03. Do not put secrets in Vite variables; they are exposed to the browser.

## Demo accounts

The local fixture has a buyer account (`demo@smart-hammer.id`) and seller account (`seller@smart-hammer.id`); both use password `smart123`. These credentials are only for the local mock. Registering creates an account but does not sign the user in; log in after registration.

Authenticated users can browse public live and ended auctions, view auction details, and create private seller drafts. Owners can edit their own drafts and start them. Drafts do not appear in the public listing. `/my-auctions` remembers auctions created from the current browser for that user and retrieves each through the owner-protected detail endpoint; this local list is not a cross-device seller dashboard because `/me/auctions` is not part of the available API. Mock changes persist to `client/mock/db.json` by default; use `BIDWAR_MOCK_DB` for a disposable database.

The mock supports authentication, auction listing/details, draft creation/editing, and draft start. It deliberately does not implement bidding or AI questions. Socket.IO is not used to claim realtime state. The mock is for local development and is not production persistence or authorization infrastructure.

## FE-03 routes and API

- `/` — public auction catalog from `GET /auctions`, including response pagination metadata.
- `/auctions/new` — create a draft with `POST /auctions`.
- `/auctions/:id/edit` — owner-only draft editing with `PATCH /auctions/:id`.
- `/auctions/:id` — auction snapshot from `GET /auctions/:id`; owner draft actions include edit and `POST /auctions/:id/start`.
- `/my-auctions` — browser-known auctions retrieved through authenticated detail requests.

Auction category is always `electronics`. Draft forms validate the documented API limits for title, description, condition, HTTPS image URL, integer IDR prices, duration, and product facts. PATCH replaces the complete `productFacts` object, so the form submits all fact fields to preserve unchanged values. The server determines the seller, status, and start/end timestamps.

See [FE03_IMPLEMENTATION_REPORT.md](FE03_IMPLEMENTATION_REPORT.md) for verified scope, tests, visual checks, compliance, and limitations.

## Verification

```sh
cd client
npm test
npm run build
```

Tests use temporary mock databases and remove them afterwards. See [FE01_CHANGELOG.md](FE01_CHANGELOG.md), [FE02_CHANGELOG.md](FE02_CHANGELOG.md), and [FE03_IMPLEMENTATION_REPORT.md](FE03_IMPLEMENTATION_REPORT.md) for the respective scopes. Existing UI audit screenshots are in [`client/ui-audit/screenshots/`](client/ui-audit/screenshots/).

## Remaining roadmap

Production database-backed auction APIs are still tracked under Phase 3 in `TASKS.md`. FE-04 room state, socket synchronization, bidding, auction closure, and AI are not marked complete by FE-03.
