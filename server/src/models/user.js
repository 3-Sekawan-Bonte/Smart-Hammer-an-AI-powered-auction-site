const { DataTypes, Model } = require("sequelize");

class User extends Model {
  static initModel(sequelize) {
    User.init(
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        username: {
          type: DataTypes.STRING(40),
          allowNull: false,
          validate: { len: [2, 40] },
        },
        email: {
          type: DataTypes.STRING(254),
          allowNull: false,
          unique: true,
          validate: { isEmail: true, len: [1, 254] },
        },
        password: { type: DataTypes.STRING(60), allowNull: false },
      },
      {
        sequelize,
        modelName: "User",
        tableName: "Users",
        defaultScope: { attributes: { exclude: ["password"] } },
        scopes: { withPassword: { attributes: { include: ["password"] } } },
      },
    );
    return User;
  }
}

module.exports = User;
