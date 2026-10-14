const { createSequelize } = require('../config/database');
const User = require('./user');
const Auction = require('./auction');

const sequelize = createSequelize();
User.initModel(sequelize);
Auction.initModel(sequelize);

User.hasMany(Auction, { foreignKey: 'sellerId', as: 'auctions', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'sellerId', as: 'seller', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'highestBidderId', as: 'highestBidder', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'winnerId', as: 'winner', onDelete: 'SET NULL', onUpdate: 'CASCADE' });

module.exports = { sequelize, User, Auction };
