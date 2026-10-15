const { DataTypes, Model } = require('sequelize');

const statuses = ['creating', 'pending', 'paid', 'failed', 'expired', 'canceled'];
const methods = ['bca_va', 'echannel'];

class Payment extends Model {
  static initModel(sequelize) {
    Payment.init({
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      auctionId: { type: DataTypes.INTEGER, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      orderId: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      amount: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 2_000_000_000 } },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'IDR', validate: { isIn: [['IDR']] } },
      paymentMethod: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [methods] } },
      transactionId: { type: DataTypes.STRING(100), allowNull: true, unique: true },
      snapToken: { type: DataTypes.TEXT, allowNull: true },
      redirectUrl: { type: DataTypes.STRING(2048), allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'creating', validate: { isIn: [statuses] } },
      midtransStatus: { type: DataTypes.STRING(30), allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
    }, {
      sequelize,
      modelName: 'Payment',
      tableName: 'Payments',
      indexes: [
        { fields: ['auctionId', 'userId', 'createdAt'], name: 'payments_auction_user_created_idx' },
      ],
    });
    return Payment;
  }
}

Payment.statuses = statuses;
Payment.methods = methods;
module.exports = Payment;
