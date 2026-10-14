const { DataTypes, Model, Op } = require('sequelize');

const kinds = ['question', 'commentary', 'summary'];
const statuses = ['pending', 'completed', 'failed'];

class AIInteraction extends Model {
  static initModel(sequelize) {
    AIInteraction.init({
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      auctionId: { type: DataTypes.INTEGER, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      kind: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [kinds] } },
      triggerKey: { type: DataTypes.STRING(100), allowNull: true },
      visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'public', validate: { isIn: [['public']] } },
      question: { type: DataTypes.STRING(500), allowNull: true },
      answer: { type: DataTypes.TEXT, allowNull: true },
      missingInformation: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', validate: { isIn: [statuses] } },
      sourceVersion: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
      snapshotAt: { type: DataTypes.DATE, allowNull: false },
      errorCode: { type: DataTypes.STRING(40), allowNull: true },
    }, {
      sequelize,
      modelName: 'AIInteraction',
      tableName: 'AIInteractions',
      indexes: [
        { fields: ['auctionId', 'visibility', 'createdAt', 'id'], name: 'ai_interactions_auction_visibility_created_id_idx' },
        { fields: ['userId', 'createdAt'], name: 'ai_interactions_user_created_idx' },
        {
          fields: ['auctionId', 'triggerKey'],
          unique: true,
          where: { kind: 'commentary', triggerKey: { [Op.ne]: null } },
          name: 'ai_interactions_commentary_trigger_unique_idx',
        },
      ],
    });
    return AIInteraction;
  }
}

AIInteraction.kinds = kinds;
AIInteraction.statuses = statuses;
module.exports = AIInteraction;
