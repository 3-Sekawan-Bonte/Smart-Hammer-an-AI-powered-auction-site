const migration = require('../migrations/20261014050000-add-ai-commentary-trigger-key');

describe('AI commentary trigger migration', () => {
  test('adds a nullable trigger key and a partial unique constraint for commentary only', async () => {
    const calls = [];
    const queryInterface = {
      async addColumn(...args) { calls.push(['addColumn', ...args]); },
      async addIndex(...args) { calls.push(['addIndex', ...args]); },
    };
    const Sequelize = { STRING: (length) => ({ type: 'STRING', length }), literal: (value) => ({ literal: value }) };
    await migration.up(queryInterface, Sequelize);
    expect(calls[0]).toEqual(['addColumn', 'AIInteractions', 'triggerKey', { allowNull: true, type: { type: 'STRING', length: 100 } }]);
    expect(calls[1][3]).toMatchObject({ unique: true, name: 'ai_interactions_commentary_trigger_unique_idx' });
    expect(calls[1][3].where.literal).toContain('"kind" = \'commentary\'');
    expect(calls[1][3].where.literal).toContain('"triggerKey" IS NOT NULL');
  });

  test('removes only the trigger index and column when rolled back', async () => {
    const calls = [];
    const queryInterface = {
      async removeIndex(...args) { calls.push(['removeIndex', ...args]); },
      async removeColumn(...args) { calls.push(['removeColumn', ...args]); },
    };
    await migration.down(queryInterface);
    expect(calls).toEqual([
      ['removeIndex', 'AIInteractions', 'ai_interactions_commentary_trigger_unique_idx'],
      ['removeColumn', 'AIInteractions', 'triggerKey'],
    ]);
  });
});
