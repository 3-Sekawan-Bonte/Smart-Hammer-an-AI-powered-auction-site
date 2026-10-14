'use strict';

const CONSTRAINT_NAME = 'auctions_duration_range';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint('Auctions', CONSTRAINT_NAME, { transaction });
      await queryInterface.addConstraint('Auctions', {
        fields: ['durationSeconds'],
        type: 'check',
        name: CONSTRAINT_NAME,
        where: Sequelize.literal('"durationSeconds" BETWEEN 60 AND 604800'),
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint('Auctions', CONSTRAINT_NAME, { transaction });
      await queryInterface.addConstraint('Auctions', {
        fields: ['durationSeconds'],
        type: 'check',
        name: CONSTRAINT_NAME,
        where: Sequelize.literal('"durationSeconds" BETWEEN 60 AND 86400'),
        transaction,
      });
    });
  },
};
