'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('Auctions', ['status', 'endsAt', 'id'], {
      name: 'auctions_status_ends_at_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Auctions', 'auctions_status_ends_at_id_idx');
  },
};
