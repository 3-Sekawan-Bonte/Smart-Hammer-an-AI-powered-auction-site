const bcrypt = require('bcryptjs');
const { seedDemoData, DEMO_USERS, SAMPLE_AUCTIONS } = require('../seeders/20261014060000-demo-users-and-auctions');

function fakeQueryInterface({ users = [], auctions = [] } = {}) {
  const state = {
    users: users.map((row) => ({ ...row })),
    auctions: auctions.map((row) => ({ ...row })),
    nextUserId: Math.max(0, ...users.map(({ id }) => id || 0)) + 1,
    nextAuctionId: Math.max(0, ...auctions.map(({ id }) => id || 0)) + 1,
    transactionCount: 0,
  };
  const sequelize = {
    async transaction(callback) {
      state.transactionCount += 1;
      return callback({ id: state.transactionCount });
    },
    async query(sql, { replacements }) {
      if (sql.includes('FROM "Users"')) {
        return state.users.filter(({ email }) => replacements.emails.includes(email)).map(({ id, username, email }) => ({ id, username, email }));
      }
      if (sql.includes('FROM "Auctions"')) {
        return state.auctions.filter((auction) => auction.sellerId === replacements.sellerId && auction.title === replacements.title).map(({ id }) => ({ id }));
      }
      throw new Error(`Unexpected SQL in fake query interface: ${sql}`);
    },
  };
  const queryInterface = {
    sequelize,
    async bulkInsert(table, rows) {
      const target = table === 'Users' ? state.users : state.auctions;
      for (const row of rows) {
        target.push({ id: table === 'Users' ? state.nextUserId++ : state.nextAuctionId++, ...row });
      }
    },
  };
  return { queryInterface, state };
}

const env = { NODE_ENV: 'test', DEMO_SEED_ENABLED: 'true', DEMO_SEED_PASSWORD: 'local-demo-password' };

describe('demo database seeder', () => {
  test('creates bcryptjs-hashed demo users and valid draft auctions linked to the seller', async () => {
    const { queryInterface, state } = fakeQueryInterface();
    await seedDemoData(queryInterface, env);

    expect(state.users).toHaveLength(2);
    for (const user of state.users) {
      expect(DEMO_USERS).toContainEqual({ username: user.username, email: user.email });
      expect(user.password).not.toBe(env.DEMO_SEED_PASSWORD);
      await expect(bcrypt.compare(env.DEMO_SEED_PASSWORD, user.password)).resolves.toBe(true);
      expect(user.password).toHaveLength(60);
    }
    const seller = state.users.find(({ email }) => email === 'demo.seller@smart-hammer.local');
    expect(state.auctions).toHaveLength(SAMPLE_AUCTIONS.length);
    for (const auction of state.auctions) {
      expect(auction.sellerId).toBe(seller.id);
      expect(auction.status).toBe('draft');
      expect(auction.currentPrice).toBe(auction.startingPrice);
      expect(auction.startsAt).toBeNull();
      expect(auction.endsAt).toBeNull();
      expect(auction.highestBidderId).toBeNull();
      expect(auction.winnerId).toBeNull();
      expect(auction.version).toBe(0);
      expect(['new', 'used_good', 'used_fair']).toContain(auction.condition);
      expect(['smartphone', 'laptop', 'pc', 'camera', 'tablet', 'monitor', 'audio', 'gaming_console', 'accessories']).toContain(auction.category);
      expect(Number.isInteger(auction.startingPrice)).toBe(true);
      expect(auction.startingPrice).toBeGreaterThan(0);
      expect(auction.startingPrice).toBeLessThanOrEqual(2_000_000_000);
      expect(auction.durationSeconds).toBeGreaterThanOrEqual(60);
      expect(auction.durationSeconds).toBeLessThanOrEqual(86400);
      expect(Object.keys(auction.productFacts).sort()).toEqual(['accessories', 'defects', 'specifications', 'warranty']);
      expect(Array.isArray(auction.productFacts.accessories)).toBe(true);
    }
  });

  test('can be rerun without duplicating users or sample auctions', async () => {
    const { queryInterface, state } = fakeQueryInterface();
    await seedDemoData(queryInterface, env);
    await seedDemoData(queryInterface, env);
    expect(state.users).toHaveLength(2);
    expect(state.auctions).toHaveLength(SAMPLE_AUCTIONS.length);
    expect(state.transactionCount).toBe(2);
  });

  test('leaves existing demo credentials, sample records, and unrelated data untouched', async () => {
    const existingHash = await bcrypt.hash('previous-local-password', 4);
    const { queryInterface, state } = fakeQueryInterface({
      users: [
        { id: 12, username: 'Demo Seller', email: 'demo.seller@smart-hammer.local', password: existingHash, createdAt: new Date(0), updatedAt: new Date(0) },
        { id: 22, username: 'Unrelated', email: 'person@example.test', password: 'keep-this', createdAt: new Date(0), updatedAt: new Date(0) },
      ],
      auctions: [
        { id: 88, sellerId: 12, title: SAMPLE_AUCTIONS[0].title, description: 'Existing record must not be overwritten', status: 'draft' },
        { id: 99, sellerId: 22, title: 'Unrelated auction', status: 'draft' },
      ],
    });
    await seedDemoData(queryInterface, env);
    expect(state.users.find(({ id }) => id === 12).password).toBe(existingHash);
    expect(state.users.find(({ id }) => id === 22).password).toBe('keep-this');
    expect(state.auctions.find(({ id }) => id === 88).description).toBe('Existing record must not be overwritten');
    expect(state.auctions.find(({ id }) => id === 99).title).toBe('Unrelated auction');
    for (const { title } of SAMPLE_AUCTIONS) {
      expect(state.auctions.filter((auction) => auction.sellerId === 12 && auction.title === title)).toHaveLength(1);
    }
    expect(state.users).toHaveLength(3);
    expect(state.auctions).toHaveLength(SAMPLE_AUCTIONS.length + 1);
  });

  test('requires explicit opt-in, refuses production, and validates configured password before database access', async () => {
    const { queryInterface, state } = fakeQueryInterface();
    await expect(seedDemoData(queryInterface, { ...env, NODE_ENV: 'production' })).rejects.toThrow('disabled in production');
    await expect(seedDemoData(queryInterface, { ...env, DEMO_SEED_ENABLED: 'false' })).rejects.toThrow('explicitly enable');
    await expect(seedDemoData(queryInterface, { ...env, DEMO_SEED_PASSWORD: '' })).rejects.toThrow('8–72 UTF-8 bytes');
    expect(state.transactionCount).toBe(0);
    expect(state.users).toHaveLength(0);
    expect(state.auctions).toHaveLength(0);
  });

  test('refuses to adopt an existing demo email with a different username', async () => {
    const { queryInterface, state } = fakeQueryInterface({ users: [
      { id: 10, username: 'Somebody Else', email: DEMO_USERS[0].email, password: 'untouched' },
    ] });
    await expect(seedDemoData(queryInterface, env)).rejects.toThrow('already belongs to a different account');
    expect(state.users).toHaveLength(1);
    expect(state.users[0].password).toBe('untouched');
    expect(state.auctions).toHaveLength(0);
  });
});
