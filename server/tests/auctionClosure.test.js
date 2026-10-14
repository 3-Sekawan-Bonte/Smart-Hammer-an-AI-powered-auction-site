const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const app = require('../src/app');
const { sequelize, User, Auction, Bid } = require('../src/models');
const { createAuctionClosureService } = require('../src/services/auctionClosureService');

const auctionInput = {
  title: 'Closure test camera',
  description: 'A camera in good working condition for closure tests.',
  condition: 'used_good',
  category: 'camera',
  productFacts: { specifications: null, defects: null, accessories: [], warranty: null },
  imageUrl: null,
  startingPrice: 1_000,
  currentPrice: 1_000,
  minIncrement: 100,
  durationSeconds: 3600,
};

let seller;
let bidder;
let sellerToken;
let bidderToken;
let auctionIds;
let closureService;

function tokenFor(user) {
  return jwt.sign({ sub: String(user.id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function auth(token = bidderToken) {
  return { Authorization: `Bearer ${token}` };
}

async function createAuction(overrides = {}) {
  const auction = await Auction.create({
    ...auctionInput,
    sellerId: seller.id,
    startsAt: new Date(Date.now() - 3_600_000),
    endsAt: new Date(Date.now() - 1),
    status: 'live',
    highestBidderId: null,
    winnerId: null,
    version: 2,
    ...overrides,
  });
  auctionIds.push(auction.id);
  return auction;
}

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL && (!process.env.TEST_DB_NAME || !process.env.TEST_DB_USERNAME)) {
    throw new Error('Configure a dedicated test database with TEST_DATABASE_URL or TEST_DB_NAME and TEST_DB_USERNAME.');
  }
  await sequelize.authenticate();
  closureService = createAuctionClosureService({ Auction, Bid, sequelize });
});

beforeEach(async () => {
  auctionIds = [];
  seller = await User.create({ username: 'closure-seller', email: `closure-seller-${crypto.randomUUID()}@example.com`, password: '$2a$10$wHkV4zgYY5HM4ymwYh2hLe7v5fSnmbZk1jB3gM3bE9mZkSXtE3g3K' });
  bidder = await User.create({ username: 'closure-bidder', email: `closure-bidder-${crypto.randomUUID()}@example.com`, password: '$2a$10$wHkV4zgYY5HM4ymwYh2hLe7v5fSnmbZk1jB3gM3bE9mZkSXtE3g3K' });
  sellerToken = tokenFor(seller);
  bidderToken = tokenFor(bidder);
});

afterEach(async () => {
  if (auctionIds.length) {
    await Bid.destroy({ where: { auctionId: auctionIds }, hooks: false });
    await Auction.destroy({ where: { id: auctionIds } });
  }
  await User.destroy({ where: { id: [seller?.id, bidder?.id].filter(Boolean) } });
});

afterAll(async () => sequelize.close());

describe('auction closure and bid deadline', () => {
  test('closes an expired auction with bids using the persisted bidder and current price', async () => {
    const auction = await createAuction({ currentPrice: 1_700, highestBidderId: bidder.id });
    await Bid.create({ auctionId: auction.id, userId: bidder.id, amount: 1_700, clientRequestId: crypto.randomUUID() });
    const result = await closureService.close(auction.id);
    const saved = await Auction.findByPk(auction.id);
    expect(result).toMatchObject({ closed: true, finalPrice: 1_700 });
    expect(saved).toMatchObject({ status: 'ended', winnerId: bidder.id, currentPrice: 1_700, version: 3 });
  });

  test('closes an auction without bids with null winner and final price', async () => {
    const auction = await createAuction();
    const result = await closureService.close(auction.id);
    const saved = await Auction.findByPk(auction.id);
    expect(result).toMatchObject({ closed: true, finalPrice: null });
    expect(saved).toMatchObject({ status: 'ended', winnerId: null, currentPrice: auctionInput.startingPrice });
  });

  test('leaves future, draft, and already-ended auctions unchanged', async () => {
    const future = await createAuction({ endsAt: new Date(Date.now() + 60_000) });
    const draft = await createAuction({ status: 'draft', endsAt: null, startsAt: null });
    const ended = await createAuction({ status: 'ended', winnerId: bidder.id });
    const versions = [future.version, draft.version, ended.version];
    await Promise.all([future, draft, ended].map((auction) => closureService.close(auction.id)));
    const rows = await Auction.findAll({ where: { id: [future.id, draft.id, ended.id] }, order: [['id', 'ASC']] });
    expect(rows.map((row) => row.version)).toEqual(versions);
    expect(rows.map((row) => row.status)).toEqual(['live', 'draft', 'ended']);
    expect(rows[2].winnerId).toBe(bidder.id);
  });

  test('repeated and concurrent closures do not change the result or increment version twice', async () => {
    const auction = await createAuction({ currentPrice: 1_700, highestBidderId: bidder.id });
    await Bid.create({ auctionId: auction.id, userId: bidder.id, amount: 1_700, clientRequestId: crypto.randomUUID() });
    const results = await Promise.all([closureService.close(auction.id), closureService.close(auction.id)]);
    expect(results.filter((result) => result.closed)).toHaveLength(1);
    await closureService.close(auction.id);
    const saved = await Auction.findByPk(auction.id);
    expect(saved).toMatchObject({ status: 'ended', winnerId: bidder.id, currentPrice: 1_700, version: 3 });
  });

  test('rejects a bid at an expired deadline while closure runs against the same auction row', async () => {
    const auction = await createAuction();
    const [closed, bidResponse] = await Promise.all([
      closureService.close(auction.id),
      request(app).post(`/auctions/${auction.id}/bids`).set(auth()).send({ amount: 1_000, clientRequestId: crypto.randomUUID() }),
    ]);
    expect(closed.closed).toBe(true);
    expect(bidResponse.status).toBe(409);
    expect(bidResponse.body.error.code).toBe('AUCTION_ENDED');
    const saved = await Auction.findByPk(auction.id);
    expect(saved.status).toBe('ended');
    expect(await Bid.count({ where: { auctionId: auction.id } })).toBe(0);
  });

  test('rolls closure state back when the version update fails', async () => {
    const auction = await createAuction({ version: 2_147_483_647 });
    await Bid.create({ auctionId: auction.id, userId: bidder.id, amount: 1_700, clientRequestId: crypto.randomUUID() });
    const result = await closureService.close(auction.id).then(() => null, (error) => error);
    expect(result).toBeTruthy();
    const saved = await Auction.findByPk(auction.id);
    expect(saved).toMatchObject({ status: 'live', winnerId: null, version: 2_147_483_647 });
  });
});
