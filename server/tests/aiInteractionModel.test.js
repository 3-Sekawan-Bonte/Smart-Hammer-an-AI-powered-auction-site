const { Sequelize } = require('sequelize');
const AIInteraction = require('../src/models/aiInteraction');

describe('AIInteraction schema', () => {
  let sequelize;
  afterEach(async () => { if (sequelize) await sequelize.close(); });

  test('matches documented statuses, kinds, visibility, context, and nullable fields', () => {
    sequelize = new Sequelize('postgres://user:password@localhost:5432/smart_hammer', { logging: false });
    AIInteraction.initModel(sequelize);
    const attributes = AIInteraction.rawAttributes;
    expect(AIInteraction.tableName).toBe('AIInteractions');
    expect(AIInteraction.kinds).toEqual(['question', 'commentary', 'summary']);
    expect(AIInteraction.statuses).toEqual(['pending', 'completed', 'failed']);
    expect(attributes.userId.allowNull).toBe(true);
    expect(attributes.visibility.validate.isIn[0]).toEqual(['public', 'private']);
    expect(attributes.question.allowNull).toBe(true);
    expect(attributes.answer.allowNull).toBe(true);
    expect(attributes.missingInformation.defaultValue).toEqual([]);
    expect(attributes.sources.defaultValue).toEqual([]);
    expect(attributes.sources.allowNull).toBe(false);
    expect(attributes.sourceVersion.allowNull).toBe(false);
    expect(attributes.snapshotAt.allowNull).toBe(false);
    expect(attributes.errorCode.allowNull).toBe(true);
    expect(AIInteraction.options.indexes.map(({ name }) => name)).toContain('ai_interactions_auction_visibility_created_id_idx');
    expect(attributes.triggerKey.allowNull).toBe(true);
    expect(AIInteraction.options.indexes.map(({ name }) => name)).toContain('ai_interactions_commentary_trigger_unique_idx');
  });
});
