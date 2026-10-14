const { DataTypes, Model } = require('sequelize');

class Bid extends Model {
  static initModel(sequelize) {
    Bid.init({
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      auctionId: { type: DataTypes.INTEGER, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      amount: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 2_000_000_000 } },
      clientRequestId: { type: DataTypes.UUID, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    }, {
      sequelize,
      modelName: 'Bid',
      tableName: 'Bids',
      timestamps: false,
      indexes: [{ unique: true, fields: ['userId', 'clientRequestId'], name: 'bids_user_request_unique' }],
      hooks: {
        beforeUpdate() { throw new Error('Accepted bids are immutable.'); },
        beforeBulkUpdate() { throw new Error('Accepted bids are immutable.'); },
        beforeDestroy() { throw new Error('Accepted bids are immutable.'); },
        beforeBulkDestroy() { throw new Error('Accepted bids are immutable.'); },
      },
    });
    return Bid;
  }
}

module.exports = Bid;
