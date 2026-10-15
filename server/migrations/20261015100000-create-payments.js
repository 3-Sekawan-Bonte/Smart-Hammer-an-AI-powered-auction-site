'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Payments', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      auctionId: {
        allowNull: false, type: Sequelize.INTEGER,
        references: { model: 'Auctions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      userId: {
        allowNull: false, type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      orderId: { allowNull: false, type: Sequelize.STRING(100) },
      amount: { allowNull: false, type: Sequelize.INTEGER },
      currency: { allowNull: false, type: Sequelize.STRING(3), defaultValue: 'IDR' },
      paymentMethod: { allowNull: true, type: Sequelize.STRING(20) },
      transactionId: { allowNull: true, type: Sequelize.STRING(100) },
      snapToken: { allowNull: true, type: Sequelize.TEXT },
      redirectUrl: { allowNull: true, type: Sequelize.STRING(2048) },
      status: { allowNull: false, type: Sequelize.STRING(20), defaultValue: 'creating' },
      midtransStatus: { allowNull: true, type: Sequelize.STRING(30) },
      expiresAt: { allowNull: false, type: Sequelize.DATE },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['amount'], type: 'check', name: 'payments_amount_range',
      where: Sequelize.literal('"amount" BETWEEN 1 AND 2000000000'),
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['currency'], type: 'check', name: 'payments_currency_idr',
      where: { currency: 'IDR' },
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['paymentMethod'], type: 'check', name: 'payments_method_allowed',
      where: Sequelize.literal('"paymentMethod" IS NULL OR "paymentMethod" IN (\'bca_va\', \'echannel\')'),
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['status'], type: 'check', name: 'payments_status_allowed',
      where: { status: ['creating', 'pending', 'paid', 'failed', 'expired', 'canceled'] },
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['orderId'], type: 'unique', name: 'payments_order_id_unique',
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['transactionId'], type: 'unique', name: 'payments_transaction_id_unique',
    });
    await queryInterface.addIndex('Payments', ['auctionId', 'userId', 'createdAt'], { name: 'payments_auction_user_created_idx' });
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payments_one_paid_per_auction_unique ON "Payments" ("auctionId") WHERE "status" = \'paid\''
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payments_one_active_per_auction_unique ON "Payments" ("auctionId") WHERE "status" IN (\'creating\', \'pending\')'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Payments');
  },
};
