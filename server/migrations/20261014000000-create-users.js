'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      username: { allowNull: false, type: Sequelize.STRING(40) },
      email: { allowNull: false, type: Sequelize.STRING(254), unique: true },
      password: { allowNull: false, type: Sequelize.STRING(60) },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('Users');
  },
};
