const { resolveTestDatabaseConfig } = require('../src/config/testDatabaseConfig');

describe('dedicated integration-test database configuration', () => {
  test('does not fall back to development or general DATABASE_URL values', () => {
    expect(() => resolveTestDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/smart_hammer_development',
      DB_NAME: 'smart_hammer_development',
      DB_USERNAME: 'local',
    })).toThrow('Test database configuration is required');
  });

  test('requires database names ending in _test for URL and split configuration', () => {
    expect(() => resolveTestDatabaseConfig({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgres://localhost/smart_hammer_development',
    })).toThrow('must end in _test');
    expect(() => resolveTestDatabaseConfig({
      NODE_ENV: 'test',
      TEST_DB_NAME: 'smart_hammer_development',
      TEST_DB_USERNAME: 'local',
    })).toThrow('must end in _test');
  });

  test('rejects test database connections while the process is in production mode', () => {
    expect(() => resolveTestDatabaseConfig({
      NODE_ENV: 'production',
      TEST_DB_NAME: 'smart_hammer_test',
      TEST_DB_USERNAME: 'local',
    })).toThrow('disabled when NODE_ENV=production');
  });

  test('accepts only explicitly named dedicated test databases', () => {
    expect(resolveTestDatabaseConfig({
      NODE_ENV: 'test',
      TEST_DB_NAME: 'smart_hammer_test',
      TEST_DB_USERNAME: 'local',
      TEST_DB_PASSWORD: 'local-only',
    })).toMatchObject({ database: 'smart_hammer_test', username: 'local' });
    expect(resolveTestDatabaseConfig({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgres://localhost/smart_hammer_test',
    })).toMatchObject({ url: 'postgres://localhost/smart_hammer_test' });
  });
});
