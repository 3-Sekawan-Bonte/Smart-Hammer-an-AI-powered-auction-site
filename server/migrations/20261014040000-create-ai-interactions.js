'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AIInteractions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      auctionId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'Auctions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      userId: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      kind: { allowNull: false, type: Sequelize.STRING(20) },
      visibility: { allowNull: false, type: Sequelize.STRING(20), defaultValue: 'public' },
      question: { allowNull: true, type: Sequelize.STRING(500) },
      answer: { allowNull: true, type: Sequelize.TEXT },
      missingInformation: { allowNull: false, type: Sequelize.JSONB, defaultValue: [] },
      status: { allowNull: false, type: Sequelize.STRING(20), defaultValue: 'pending' },
      sourceVersion: { allowNull: false, type: Sequelize.INTEGER },
      snapshotAt: { allowNull: false, type: Sequelize.DATE },
      errorCode: { allowNull: true, type: Sequelize.STRING(40) },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('AIInteractions', {
      fields: ['kind'], type: 'check', name: 'ai_interactions_kind_allowed',
      where: { kind: ['question', 'commentary', 'summary'] },
    });
    await queryInterface.addConstraint('AIInteractions', {
      fields: ['visibility'], type: 'check', name: 'ai_interactions_visibility_public',
      where: { visibility: 'public' },
    });
    await queryInterface.addConstraint('AIInteractions', {
      fields: ['status'], type: 'check', name: 'ai_interactions_status_allowed',
      where: { status: ['pending', 'completed', 'failed'] },
    });
    await queryInterface.addConstraint('AIInteractions', {
      fields: ['sourceVersion'], type: 'check', name: 'ai_interactions_source_version_nonnegative',
      where: Sequelize.literal('"sourceVersion" >= 0'),
    });
    await queryInterface.addIndex('AIInteractions', ['auctionId', 'visibility', 'createdAt', 'id'], {
      name: 'ai_interactions_auction_visibility_created_id_idx',
    });
    await queryInterface.addIndex('AIInteractions', ['userId', 'createdAt'], {
      name: 'ai_interactions_user_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('AIInteractions');
  },
};
