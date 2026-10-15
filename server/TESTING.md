# Backend database integration tests

The database-backed Jest suites use a dedicated PostgreSQL test database. They
never fall back to `DATABASE_URL` or the development `DB_NAME`. The test
database name must end in `_test`; production mode is rejected.

## Configure a local test database

From `server/`, copy `.env.test.example` to `.env.test` and fill in the local
PostgreSQL credentials. Alternatively, configure `TEST_DATABASE_URL` with a
dedicated database whose name ends in `_test`. `.env.test` is ignored by Git.

Pending Sequelize migrations are applied automatically by `npm test`
before Jest starts. To provision an empty test database for the first time,
run:

```sh
npm run db:create:test
npm test
```

To inspect migration status without changing schema:

```sh
npm run db:migrate:status:test
```

`npm test` runs only pending migrations; it does not drop, reset, truncate, or
seed the test database. Each database integration suite creates uniquely identified
records and deletes only records associated with those IDs/emails. Do not set
`TEST_DATABASE_URL` to a development or production database.

Required variables are `TEST_DATABASE_URL`, or `TEST_DB_NAME` (ending in
`_test`) plus `TEST_DB_USERNAME`; optional variables are `TEST_DB_PASSWORD`,
`TEST_DB_HOST`, `TEST_DB_PORT`, and `TEST_DB_SSL`.
