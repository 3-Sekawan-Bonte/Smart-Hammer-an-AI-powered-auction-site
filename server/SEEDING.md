# Local demo database seeding

The demo seeder creates two demo users and three sample auction drafts. It is
intended for local development and isolated test databases only. The application
does not run seeders during startup.

## Configure

Set database connection values in `server/.env` using the development database
configuration. Set a private local password for the demo accounts; the same
password is used for both accounts and is hashed with bcryptjs before insertion:

```dotenv
DEMO_SEED_ENABLED=true
DEMO_SEED_PASSWORD=choose-a-local-password-of-at-least-8-characters
```

Never use a production password. `DEMO_SEED_PASSWORD` must be 8–72 UTF-8 bytes.
The seeder refuses to run when `NODE_ENV=production`, and it also requires the
explicit `DEMO_SEED_ENABLED=true` opt-in.

## Run

From `server/`, first apply the migrations, then run the demo seeder:

```sh
npx sequelize-cli db:migrate --env development
npm run seed:demo
```

The demo accounts are `demo.seller@smart-hammer.local` and
`demo.buyer@smart-hammer.local`; use the password configured above. Existing
demo users are left untouched, including their password hashes. If an email
already belongs to a different username, the transaction stops without changing
records. Existing sample auctions owned by the demo seller are left untouched.

The seeder inserts only missing rows. It never deletes or updates existing user
or auction records. Re-running it safely fills in any missing demo data. Its
`down` operation is intentionally non-destructive and refuses to delete records.
