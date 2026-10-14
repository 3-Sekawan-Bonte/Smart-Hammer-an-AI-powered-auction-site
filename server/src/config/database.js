const { Sequelize } = require('sequelize');
const { resolveTestDatabaseConfig } = require('./testDatabaseConfig');

function createSequelize(env = process.env) {
  if (env.NODE_ENV === 'test') {
    const config = resolveTestDatabaseConfig(env);
    if (config.url) {
      return new Sequelize(config.url, {
        dialect: config.dialect,
        logging: config.logging,
        dialectOptions: config.dialectOptions,
      });
    }
    return new Sequelize(config.database, config.username, config.password, {
      host: config.host,
      port: config.port,
      dialect: config.dialect,
      logging: config.logging,
      dialectOptions: config.dialectOptions,
    });
  }

  if (env.DATABASE_URL) {
    return new Sequelize(env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    });
  }
  if (!env.DB_NAME || !env.DB_USERNAME) {
    throw new Error('Database configuration is required (DATABASE_URL or DB_NAME and DB_USERNAME).');
  }
  return new Sequelize(env.DB_NAME, env.DB_USERNAME, env.DB_PASSWORD || '', {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: false,
    dialectOptions: env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  });
}

module.exports = { createSequelize };
