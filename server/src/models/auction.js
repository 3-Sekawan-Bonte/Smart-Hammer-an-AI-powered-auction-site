const { DataTypes, Model } = require('sequelize');

const categories = ['smartphone', 'laptop', 'pc', 'camera', 'tablet', 'monitor', 'audio', 'gaming_console', 'accessories'];
const conditions = ['new', 'used_good', 'used_fair'];

class Auction extends Model {
  static initModel(sequelize) {
    Auction.init({
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      sellerId: { type: DataTypes.INTEGER, allowNull: false },
      title: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(3000), allowNull: false },
      condition: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [conditions] } },
      category: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [categories] } },
      productFacts: { type: DataTypes.JSONB, allowNull: false, defaultValue: { specifications: null, defects: null, accessories: [], warranty: null } },
      imageUrl: { type: DataTypes.STRING(2048), allowNull: true },
      startingPrice: { type: DataTypes.INTEGER, allowNull: false },
      currentPrice: { type: DataTypes.INTEGER, allowNull: false },
      minIncrement: { type: DataTypes.INTEGER, allowNull: false },
      durationSeconds: { type: DataTypes.INTEGER, allowNull: false },
      startsAt: { type: DataTypes.DATE, allowNull: true },
      endsAt: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'draft', validate: { isIn: [['draft', 'live', 'ended']] } },
      highestBidderId: { type: DataTypes.INTEGER, allowNull: true },
      winnerId: { type: DataTypes.INTEGER, allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    }, {
      sequelize,
      modelName: 'Auction',
      tableName: 'Auctions',
      indexes: [
        { fields: ['sellerId', 'createdAt', 'id'] },
        { fields: ['status', 'category', 'createdAt', 'id'] },
      ],
    });
    return Auction;
  }
}

Auction.categories = categories;
Auction.conditions = conditions;
module.exports = Auction;
