'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Bids', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      auctionId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'Auctions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      userId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      amount: { allowNull: false, type: Sequelize.INTEGER },
      clientRequestId: { allowNull: false, type: Sequelize.UUID },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('Bids', {
      fields: ['amount'],
      type: 'check',
      name: 'bids_amount_range',
      where: Sequelize.literal('"amount" BETWEEN 1 AND 2000000000'),
    });
    await queryInterface.addConstraint('Bids', {
      fields: ['userId', 'clientRequestId'],
      type: 'unique',
      name: 'bids_user_request_unique',
    });
    await queryInterface.addIndex('Bids', ['auctionId', 'createdAt', 'id'], { name: 'bids_auction_created_id_idx' });

  },

  async down(queryInterface) {
    await queryInterface.dropTable('Bids');
  },
};
