require('dotenv').config();
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env.test') });
const { resolveTestDatabaseConfig } = require('../src/config/testDatabaseConfig');

const args = process.argv.slice(2);
const testEnvironmentRequested = args.some((arg, index) => (
  arg === '--env' && args[index + 1] === 'test'
) || arg === '--env=test');

const common = process.env.DATABASE_URL
  ? { use_env_variable: 'DATABASE_URL', dialect: 'postgres' }
  : {
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      dialect: 'postgres',
    };

const testConfig = testEnvironmentRequested || process.env.NODE_ENV === 'test'
  ? (() => {
    const config = resolveTestDatabaseConfig(process.env);
    if (config.url) {
      return { use_env_variable: 'TEST_DATABASE_URL', dialect: 'postgres', logging: false, dialectOptions: config.dialectOptions };
    }
    return {
      username: config.username,
      password: config.password,
      database: config.database,
      host: config.host,
      port: config.port,
      dialect: config.dialect,
      logging: false,
      dialectOptions: config.dialectOptions,
    };
  })()
  : { dialect: 'postgres', logging: false };

module.exports = {
  development: { ...common, logging: false },
  test: testConfig,
  production: { ...common, logging: false, dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : undefined },
};
