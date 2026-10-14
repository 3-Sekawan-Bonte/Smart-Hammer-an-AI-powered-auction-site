'use strict';

const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');

const DEMO_USERS = [
  { username: 'Demo Seller', email: 'demo.seller@smart-hammer.local' },
  { username: 'Demo Buyer', email: 'demo.buyer@smart-hammer.local' },
];

const SAMPLE_AUCTIONS = [
  {
    title: '[Demo] Mirrorless Camera Body',
    description: 'A used mirrorless camera body with a visible scratch on the top plate.',
    condition: 'used_good', category: 'camera',
    productFacts: { specifications: '24.2 MP APS-C sensor; electronic viewfinder.', defects: 'Small scratch on the top plate.', accessories: ['Body cap', 'Battery'], warranty: null },
    startingPrice: 4500000, minIncrement: 100000, durationSeconds: 3600,
  },
  {
    title: '[Demo] 13-inch Laptop',
    description: 'A refurbished 13-inch laptop offered with its original power adapter.',
    condition: 'used_good', category: 'laptop',
    productFacts: { specifications: '13-inch display; 16 GB memory; 512 GB SSD.', defects: null, accessories: ['Power adapter'], warranty: 'No warranty information provided.' },
    startingPrice: 7200000, minIncrement: 150000, durationSeconds: 7200,
  },
  {
    title: '[Demo] Wireless Headphones',
    description: 'New wireless over-ear headphones in the original sealed packaging.',
    condition: 'new', category: 'audio',
    productFacts: { specifications: 'Wireless over-ear headphones.', defects: null, accessories: ['Headphones', 'USB charging cable'], warranty: null },
    startingPrice: 850000, minIncrement: 25000, durationSeconds: 1800,
  },
];

function assertSafeEnvironment(env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production.');
  }
  if (env.DEMO_SEED_ENABLED !== 'true') {
    throw new Error('Set DEMO_SEED_ENABLED=true to explicitly enable local demo seeding.');
  }
  if (typeof env.DEMO_SEED_PASSWORD !== 'string'
      || env.DEMO_SEED_PASSWORD.length < 8
      || Buffer.byteLength(env.DEMO_SEED_PASSWORD, 'utf8') > 72) {
    throw new Error('DEMO_SEED_PASSWORD must be 8–72 UTF-8 bytes.');
  }
}

async function seedDemoData(queryInterface, env = process.env) {
  assertSafeEnvironment(env);
  const passwordHash = await bcrypt.hash(env.DEMO_SEED_PASSWORD, 12);
  const sequelize = queryInterface.sequelize;

  await sequelize.transaction(async (transaction) => {
    const emails = DEMO_USERS.map(({ email }) => email);
    const existingUsers = await sequelize.query(
      'SELECT id, username, email FROM "Users" WHERE email IN (:emails)',
      { replacements: { emails }, type: QueryTypes.SELECT, transaction },
    );
    const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));

    for (const user of DEMO_USERS) {
      const existing = usersByEmail.get(user.email);
      if (existing && existing.username !== user.username) {
        throw new Error(`Demo email ${user.email} already belongs to a different account; no records were changed.`);
      }
      if (!existing) {
        await queryInterface.bulkInsert('Users', [{
          ...user,
          password: passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        }], { transaction });
      }
    }

    const seededUsers = await sequelize.query(
      'SELECT id, email FROM "Users" WHERE email IN (:emails)',
      { replacements: { emails }, type: QueryTypes.SELECT, transaction },
    );
    const seller = seededUsers.find(({ email }) => email === 'demo.seller@smart-hammer.local');
    if (!seller) throw new Error('Demo seller account could not be resolved.');

    for (const auction of SAMPLE_AUCTIONS) {
      const existing = await sequelize.query(
        'SELECT id FROM "Auctions" WHERE "sellerId" = :sellerId AND title = :title LIMIT 1',
        { replacements: { sellerId: seller.id, title: auction.title }, type: QueryTypes.SELECT, transaction },
      );
      if (existing.length) continue;

      const now = new Date();
      await queryInterface.bulkInsert('Auctions', [{
        ...auction,
        // bulkInsert has no model attribute metadata here, so serialize JSONB
        // values explicitly for Sequelize's generic SQL value escaper.
        productFacts: JSON.stringify(auction.productFacts),
        sellerId: seller.id,
        imageUrl: null,
        currentPrice: auction.startingPrice,
        startsAt: null,
        endsAt: null,
        status: 'draft',
        highestBidderId: null,
        winnerId: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }], { transaction });
    }
  });
}

module.exports = {
  async up(queryInterface) {
    await seedDemoData(queryInterface);
  },
  async down() {
    throw new Error('Demo seeder is intentionally non-destructive; remove demo records manually in a local database if needed.');
  },
  seedDemoData,
  DEMO_USERS,
  SAMPLE_AUCTIONS,
};
