const migration = require('../migrations/20261014070000-private-product-qa');

describe('private Product Q&A migration', () => {
  test('preserves question records while switching the visibility constraint', async () => {
    const calls = [];
    const queryInterface = {
      sequelize: {
        async transaction(callback) { return callback({ id: 'tx' }); },
        async query(sql) { calls.push(['query', sql]); return [[]]; },
      },
      async removeConstraint(...args) { calls.push(['removeConstraint', ...args.slice(0, 2)]); },
      async addConstraint(...args) { calls.push(['addConstraint', ...args.slice(0, 2)]); },
    };
    const Sequelize = { STRING: 'STRING' };
    await migration.up(queryInterface, Sequelize);
    expect(calls[0]).toEqual(['removeConstraint', 'AIInteractions', 'ai_interactions_visibility_public']);
    expect(calls[1][1]).toContain('UPDATE "AIInteractions" SET "visibility" = \'private\' WHERE "kind" = \'question\'');
    expect(calls[2]).toEqual(['addConstraint', 'AIInteractions', expect.objectContaining({ name: 'ai_interactions_visibility_allowed', where: { visibility: ['public', 'private'] } })]);
  });

  test('refuses to roll back while private records exist rather than making them public', async () => {
    const queryInterface = {
      sequelize: {
        async transaction(callback) { return callback({ id: 'tx' }); },
        async query(sql) { return sql.startsWith('SELECT') ? [[{ count: 1 }]] : [[]]; },
      },
      async removeConstraint() { throw new Error('must not downgrade'); },
      async addConstraint() { throw new Error('must not downgrade'); },
    };
    await expect(migration.down(queryInterface, {})).rejects.toThrow('private AI interactions exist');
  });
});
