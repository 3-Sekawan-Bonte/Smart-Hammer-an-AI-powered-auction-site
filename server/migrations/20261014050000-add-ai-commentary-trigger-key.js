'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('AIInteractions', 'triggerKey', {
      allowNull: true,
      type: Sequelize.STRING(100),
    });
    await queryInterface.addIndex('AIInteractions', ['auctionId', 'triggerKey'], {
      name: 'ai_interactions_commentary_trigger_unique_idx',
      unique: true,
      where: Sequelize.literal('"kind" = \'commentary\' AND "triggerKey" IS NOT NULL'),
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('AIInteractions', 'ai_interactions_commentary_trigger_unique_idx');
    await queryInterface.removeColumn('AIInteractions', 'triggerKey');
  },
};
