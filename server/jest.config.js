module.exports = {
  testEnvironment: 'node',
  setupFiles: ['dotenv/config', '<rootDir>/tests/loadTestEnvironment.js'],
  testMatch: ['**/tests/**/*.test.js'],
};
