const { createSequelize } = require('../config/database');
const User = require('./user');
const Auction = require('./auction');
const Bid = require('./bid');

const sequelize = createSequelize();
User.initModel(sequelize);
Auction.initModel(sequelize);
Bid.initModel(sequelize);

User.hasMany(Auction, { foreignKey: 'sellerId', as: 'auctions', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'sellerId', as: 'seller', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'highestBidderId', as: 'highestBidder', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Auction.belongsTo(User, { foreignKey: 'winnerId', as: 'winner', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
User.hasMany(Bid, { foreignKey: 'userId', as: 'bids', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Bid.belongsTo(User, { foreignKey: 'userId', as: 'bidder', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Auction.hasMany(Bid, { foreignKey: 'auctionId', as: 'bids', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Bid.belongsTo(Auction, { foreignKey: 'auctionId', as: 'auction', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

module.exports = { sequelize, User, Auction, Bid };
