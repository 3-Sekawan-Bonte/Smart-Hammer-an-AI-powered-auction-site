'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint('AIInteractions', 'ai_interactions_visibility_public', { transaction });
      // Preserve the records while classifying all Q&A as private. Orphaned
      // questions (userId NULL) remain inaccessible to user history queries.
      await queryInterface.sequelize.query(
        "UPDATE \"AIInteractions\" SET \"visibility\" = 'private' WHERE \"kind\" = 'question'",
        { transaction },
      );
      await queryInterface.addConstraint('AIInteractions', {
        fields: ['visibility'], type: 'check', name: 'ai_interactions_visibility_allowed',
        where: { visibility: ['public', 'private'] },
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('LOCK TABLE "AIInteractions" IN SHARE ROW EXCLUSIVE MODE', { transaction });
      const [privateRows] = await queryInterface.sequelize.query(
        "SELECT COUNT(*)::int AS count FROM \"AIInteractions\" WHERE \"visibility\" = 'private'",
        { transaction },
      );
      if (Number(privateRows?.[0]?.count || 0) > 0) {
        throw new Error('Cannot roll back Product Q&A privacy while private AI interactions exist.');
      }
      await queryInterface.removeConstraint('AIInteractions', 'ai_interactions_visibility_allowed', { transaction });
      await queryInterface.addConstraint('AIInteractions', {
        fields: ['visibility'], type: 'check', name: 'ai_interactions_visibility_public',
        where: { visibility: 'public' },
        transaction,
      });
    });
  },
};
