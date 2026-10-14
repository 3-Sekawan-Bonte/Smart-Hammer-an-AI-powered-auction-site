function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || !name.toLowerCase().endsWith('_test')) {
    throw new Error('The dedicated test database name must end in _test.');
  }
  return name;
}

function resolveTestDatabaseConfig(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Database integration tests are disabled when NODE_ENV=production.');
  }

  if (env.TEST_DATABASE_URL) {
    let databaseName;
    try {
      databaseName = decodeURIComponent(new URL(env.TEST_DATABASE_URL).pathname.replace(/^\//, ''));
    } catch (_error) {
      throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    assertTestDatabaseName(databaseName);
    return {
      url: env.TEST_DATABASE_URL,
      dialect: 'postgres',
      logging: false,
      dialectOptions: env.TEST_DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    };
  }

  if (!env.TEST_DB_NAME || !env.TEST_DB_USERNAME) {
    throw new Error('Test database configuration is required (TEST_DATABASE_URL or TEST_DB_NAME and TEST_DB_USERNAME).');
  }
  const database = assertTestDatabaseName(env.TEST_DB_NAME);

  return {
    database,
    username: env.TEST_DB_USERNAME,
    password: env.TEST_DB_PASSWORD || '',
    host: env.TEST_DB_HOST || 'localhost',
    port: Number(env.TEST_DB_PORT || 5432),
    dialect: 'postgres',
    logging: false,
    dialectOptions: env.TEST_DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  };
}

module.exports = { assertTestDatabaseName, resolveTestDatabaseConfig };
