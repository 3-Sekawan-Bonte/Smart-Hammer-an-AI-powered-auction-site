const { createSequelize } = require('../config/database');
const User = require('./user');

const sequelize = createSequelize();
User.initModel(sequelize);

module.exports = { sequelize, User };
