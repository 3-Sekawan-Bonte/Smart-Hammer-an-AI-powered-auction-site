const migration = require('../migrations/20261014090000-extend-auction-duration');

function queryInterfaceHarness() {
  const calls = [];
  const queryInterface = {
    sequelize: {
      async transaction(callback) {
        return callback({ id: 'transaction' });
      },
    },
    async removeConstraint(table, name, options) {
      calls.push({ kind: 'remove', table, name, options });
    },
    async addConstraint(table, options) {
      calls.push({ kind: 'add', table, ...options });
    },
  };
  return { queryInterface, calls };
}

describe('auction duration constraint migration', () => {
  test('replaces the one-day constraint with a seven-day limit atomically', async () => {
    const { queryInterface, calls } = queryInterfaceHarness();
    await migration.up(queryInterface, { literal: (value) => value });
    expect(calls.map(({ kind }) => kind)).toEqual(['remove', 'add']);
    expect(calls[0].name).toBe('auctions_duration_range');
    expect(calls[1]).toMatchObject({
      table: 'Auctions',
      fields: ['durationSeconds'],
      type: 'check',
      name: 'auctions_duration_range',
      where: '"durationSeconds" BETWEEN 60 AND 604800',
    });
    expect(calls.every((call) => call.options?.transaction?.id === 'transaction' || call.transaction?.id === 'transaction')).toBe(true);
  });

  test('down migration restores the previous duration constraint atomically', async () => {
    const { queryInterface, calls } = queryInterfaceHarness();
    await migration.down(queryInterface, { literal: (value) => value });
    expect(calls[1].where).toBe('"durationSeconds" BETWEEN 60 AND 86400');
  });
});
