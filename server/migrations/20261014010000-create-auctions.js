'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Auctions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      sellerId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      title: { allowNull: false, type: Sequelize.STRING(120) },
      description: { allowNull: false, type: Sequelize.STRING(3000) },
      condition: { allowNull: false, type: Sequelize.STRING(20) },
      category: { allowNull: false, type: Sequelize.STRING(30) },
      productFacts: {
        allowNull: false,
        type: Sequelize.JSONB,
        defaultValue: { specifications: null, defects: null, accessories: [], warranty: null },
      },
      imageUrl: { allowNull: true, type: Sequelize.STRING(2048) },
      startingPrice: { allowNull: false, type: Sequelize.INTEGER },
      currentPrice: { allowNull: false, type: Sequelize.INTEGER },
      minIncrement: { allowNull: false, type: Sequelize.INTEGER },
      durationSeconds: { allowNull: false, type: Sequelize.INTEGER },
      startsAt: { allowNull: true, type: Sequelize.DATE },
      endsAt: { allowNull: true, type: Sequelize.DATE },
      status: { allowNull: false, type: Sequelize.STRING(10), defaultValue: 'draft' },
      highestBidderId: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      winnerId: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      version: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addConstraint('Auctions', {
      fields: ['condition'], type: 'check', name: 'auctions_condition_allowed',
      where: { condition: ['new', 'used_good', 'used_fair'] },
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['category'], type: 'check', name: 'auctions_category_allowed',
      where: { category: ['smartphone', 'laptop', 'pc', 'camera', 'tablet', 'monitor', 'audio', 'gaming_console', 'accessories'] },
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['status'], type: 'check', name: 'auctions_status_allowed',
      where: { status: ['draft', 'live', 'ended'] },
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['startingPrice'], type: 'check', name: 'auctions_starting_price_range',
      where: Sequelize.literal('"startingPrice" BETWEEN 1 AND 2000000000'),
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['minIncrement'], type: 'check', name: 'auctions_min_increment_range',
      where: Sequelize.literal('"minIncrement" BETWEEN 1 AND 2000000000'),
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['currentPrice'], type: 'check', name: 'auctions_current_price_range',
      where: Sequelize.literal('"currentPrice" BETWEEN 1 AND 2000000000'),
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['startingPrice', 'minIncrement'], type: 'check', name: 'auctions_next_minimum_price_range',
      where: Sequelize.literal('"startingPrice" + "minIncrement" <= 2000000000'),
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['durationSeconds'], type: 'check', name: 'auctions_duration_range',
      where: Sequelize.literal('"durationSeconds" BETWEEN 60 AND 86400'),
    });
    await queryInterface.addConstraint('Auctions', {
      fields: ['version'], type: 'check', name: 'auctions_version_nonnegative',
      where: Sequelize.literal('"version" >= 0'),
    });
    await queryInterface.addIndex('Auctions', ['sellerId', 'createdAt', 'id'], { name: 'auctions_seller_created_id_idx' });
    await queryInterface.addIndex('Auctions', ['status', 'category', 'createdAt', 'id'], { name: 'auctions_status_category_created_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Auctions');
  },
};
