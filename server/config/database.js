require('dotenv').config();

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

module.exports = {
  development: { ...common, logging: false },
  test: { ...common, logging: false },
  production: { ...common, logging: false, dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : undefined },
};
