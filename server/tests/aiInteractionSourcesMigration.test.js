const migration = require('../migrations/20261014080000-add-ai-interaction-sources');

describe('AIInteraction sources migration', () => {
  test('adds a backward-compatible private source metadata array', async () => {
    const addColumn = jest.fn();
    await migration.up({ addColumn }, { JSONB: 'JSONB' });
    expect(addColumn).toHaveBeenCalledWith('AIInteractions', 'sources', {
      type: 'JSONB', allowNull: false, defaultValue: [],
    });
  });

  test('removes only the added sources column on rollback', async () => {
    const removeColumn = jest.fn();
    await migration.down({ removeColumn });
    expect(removeColumn).toHaveBeenCalledWith('AIInteractions', 'sources');
  });
});
