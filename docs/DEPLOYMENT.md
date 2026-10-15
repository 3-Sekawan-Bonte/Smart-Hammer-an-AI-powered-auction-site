# Deployment guide

## Target topology

| Component | Target |
|---|---|
| Frontend SPA | Vercel — `https://smart-hammer.ilham.bond` |
| Express and Socket.IO | Google Compute Engine — `https://smart-hammer-server.ilham.bond` |
| PostgreSQL | Supabase PostgreSQL |
| AI | Groq Chat Completions, default model `openai/gpt-oss-120b` |

These are the supplied production targets. Repository configuration does not prove that DNS, TLS certificates, cloud resources, Vercel settings, or a production release are provisioned or working. A build or local test is not production deployment verification.

## Vercel frontend

Configure the Vercel project for the `client/` root directory. Use the lockfile in that directory, build command `npm run build:production`, and output directory `dist`. The production build script checks both required public URL variables and then verifies assets and known secret/mock markers.

Set these Vercel build environment variables for each relevant deployment environment:

```text
VITE_API_BASE_URL=https://smart-hammer-server.ilham.bond
VITE_SOCKET_URL=https://smart-hammer-server.ilham.bond
```

These values are public and included in the bundle. Do not add `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, or database credentials to Vercel frontend variables. Build with `npm run build:production` locally after supplying the same public URLs to validate configuration. A new build is required after changing Vite variables.

React Router uses nested SPA routes. The repository includes `client/public/_redirects` and `client/nginx.conf` for static-hosting fallback examples, but no `vercel.json` is present. Verify direct navigation/refresh for `/auctions/:id` and `/my-auctions` in Vercel; configure a Vercel rewrite only if its SPA fallback does not handle these routes.

## Google Compute Engine backend

Provision a supported Node.js runtime (Node 20.19+ or 22.12+), install dependencies from `server/package-lock.json`, and run the backend as a persistent process. The repo has no backend Dockerfile, PM2 ecosystem file, systemd unit, or automated GCE deployment script. PM2 is not a project dependency; if you choose it, install it as VM-level tooling and configure it outside the repository. For example, from `server/` after secrets have been securely injected into the process environment:

```sh
pm2 start npm --name smart-hammer-server -- start
pm2 save
pm2 startup
pm2 logs smart-hammer-server
```

Review and execute the platform-specific command printed by `pm2 startup`. After updating server environment values, restart the process with its updated environment. Do not put secrets in shell command arguments, committed scripts, or logs.

The application listens on `PORT`, default 3000. The checked-in backend example also uses 3000. `PORT=80` is not the application default and is not shown as an active production setting in repository configuration. Prefer a private application port behind a TLS-terminating reverse proxy or load balancer. The supplied `deploy/nginx.conf.example` is generic: it uses placeholder hostnames/upstreams, points to a backend port of 3001 (which must be aligned with `PORT`), and does not provide certificate paths. It is not a ready-to-run production proxy configuration. Configure TLS, certificates, DNS, firewall rules, and WebSocket upgrade support for `/socket.io/` in the chosen edge layer.

Set server environment values through the VM's secure runtime configuration:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=<Supabase PostgreSQL URL>
DB_SSL=true
JWT_SECRET=<long random private value>
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=https://smart-hammer.ilham.bond
GROQ_API_KEY=<server-side Groq key>
GROQ_MODEL=openai/gpt-oss-120b
```

`DATABASE_URL` takes precedence over `DB_*`. Use Supabase's PostgreSQL connection URL appropriate to the chosen network/pooler setup and require TLS. The current Sequelize SSL option is encrypted but sets `rejectUnauthorized: false`; review certificate verification against the organization's security requirements. Never enable demo seeding in production.

## Database migration

Take a verified backup and review pending migrations before applying them to production. From `server/`, with production database settings available to Sequelize CLI:

```sh
npx sequelize-cli db:migrate --env production
```

The application does not automatically run schema migrations at startup. Do not run `db:drop`, reset, truncate, or demo seeding against production. No production migration has been executed as part of preparing this documentation.

## CORS, HTTPS, and Socket.IO

Set `CLIENT_ORIGIN` to the exact Vercel origin (no path). Express and Socket.IO use this allowlist. The browser should connect to the backend hostname with HTTPS; Socket.IO can upgrade to WebSocket through that TLS origin. If a proxy or load balancer is used, preserve HTTP/1.1 upgrade headers for `/socket.io/`, forward the `Host`/forwarded protocol as appropriate, and allow long-lived WebSocket connections. Confirm both polling handshake and websocket upgrade from the deployed browser.

The repository also has `client/nginx.conf` for serving the static SPA on port 8080 and `deploy/nginx.conf.example` for a generic two-host reverse proxy. These files are examples, not a GCE/Vercel deployment implementation.

## Operations and verification

After deployment, inspect the process manager/service logs without printing environment values. Confirm database connectivity, migration status, and server listen startup. Verify:

1. The HTTPS frontend loads, including direct refresh of nested routes.
2. Registration/login and an authenticated auction listing work against the backend URL.
3. A socket authenticates with the JWT, joins an auction, receives a snapshot, and receives a bid event from a second session.
4. CORS rejects unrelated origins while allowing the configured Vercel origin.
5. Groq Q&A and commentary work with server-side key configuration, with private Q&A isolated per user.
6. Expired auctions recover/close after backend restart.

Do not seed production demo users. Successful local suites, build output, and configuration checks do not prove TLS, hosting, database persistence, Groq access, or production deployment behavior.
