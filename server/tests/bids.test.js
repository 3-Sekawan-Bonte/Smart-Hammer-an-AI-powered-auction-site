const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const app = require('../src/app');
const { sequelize, User, Auction, Bid } = require('../src/models');

const PASSWORD_HASH = '$2a$10$wHkV4zgYY5HM4ymwYh2hLe7v5fSnmbZk1jB3gM3bE9mZkSXtE3g3K';
const auctionInput = {
  title: 'Bidding test camera',
  description: 'A camera in good working condition for bidding tests.',
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

function tokenFor(user) {
  return jwt.sign({ sub: String(user.id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function auth(token = bidderToken) {
  return { Authorization: `Bearer ${token}` };
}

async function createAuction(overrides = {}) {
  const now = new Date();
  const auction = await Auction.create({
    ...auctionInput,
    sellerId: seller.id,
    startsAt: new Date(now.getTime() - 1000),
    endsAt: new Date(now.getTime() + 600_000),
    status: 'live',
    highestBidderId: null,
    winnerId: null,
    version: 1,
    ...overrides,
  });
  auctionIds.push(auction.id);
  return auction;
}

function submit(auctionId, body, token = bidderToken) {
  return request(app).post(`/auctions/${auctionId}/bids`).set(auth(token)).send(body);
}

function bidBody(overrides = {}) {
  return { amount: 1_000, clientRequestId: crypto.randomUUID(), ...overrides };
}

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL && (!process.env.TEST_DB_NAME || !process.env.TEST_DB_USERNAME)) {
    throw new Error('Configure a dedicated test database with TEST_DATABASE_URL or TEST_DB_NAME and TEST_DB_USERNAME.');
  }
  await sequelize.authenticate();
});

beforeEach(async () => {
  auctionIds = [];
  seller = await User.create({ username: 'bid-seller', email: `bid-seller-${crypto.randomUUID()}@example.com`, password: PASSWORD_HASH });
  bidder = await User.create({ username: 'bid-buyer', email: `bid-buyer-${crypto.randomUUID()}@example.com`, password: PASSWORD_HASH });
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

describe('POST /auctions/:id/bids', () => {
  test('requires authentication and rejects invalid auction IDs and request bodies', async () => {
    const auction = await createAuction();
    await request(app).post(`/auctions/${auction.id}/bids`).send(bidBody()).expect(401);
    const badId = await submit('not-an-id', bidBody());
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('VALIDATION_ERROR');
    for (const body of [
      { amount: 1.5, clientRequestId: crypto.randomUUID() },
      { amount: 0, clientRequestId: crypto.randomUUID() },
      { amount: 2_000_000_001, clientRequestId: crypto.randomUUID() },
      { amount: 1_000, clientRequestId: 'not-a-uuid' },
      { ...bidBody(), userId: seller.id },
    ]) {
      const response = await submit(auction.id, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('accepts a valid bid using the JWT identity and updates auction state atomically', async () => {
    const auction = await createAuction();
    const body = bidBody();
    const response = await submit(auction.id, body);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      message: 'Bid accepted successfully.',
      data: { bid: { auctionId: auction.id, userId: bidder.id, amount: body.amount, clientRequestId: body.clientRequestId } },
    });
    expect(response.body.data.bid).toHaveProperty('createdAt');
    expect(JSON.stringify(response.body)).not.toMatch(/password|email|token/i);
    expect(await Bid.count({ where: { auctionId: auction.id } })).toBe(1);
    const updated = await Auction.findByPk(auction.id);
    expect(updated).toMatchObject({ currentPrice: body.amount, highestBidderId: bidder.id, version: auction.version + 1 });
    expect(updated.endsAt.getTime()).toBeGreaterThanOrEqual(new Date(response.body.data.bid.createdAt).getTime() + 3_600_000);
  });

  test('replays an identical request without another bid, state change, or deadline extension', async () => {
    const auction = await createAuction();
    const body = bidBody();
    const first = await submit(auction.id, body);
    const stateAfterFirst = await Auction.findByPk(auction.id);
    const replay = await submit(auction.id, body);
    const stateAfterReplay = await Auction.findByPk(auction.id);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.bid).toEqual(first.body.data.bid);
    expect(await Bid.count({ where: { auctionId: auction.id } })).toBe(1);
    expect(stateAfterReplay.version).toBe(stateAfterFirst.version);
    expect(stateAfterReplay.endsAt.toISOString()).toBe(stateAfterFirst.endsAt.toISOString());
  });

  test('rejects reuse of a request ID with a different amount or auction', async () => {
    const firstAuction = await createAuction();
    const secondAuction = await createAuction();
    const body = bidBody();
    await submit(firstAuction.id, body).expect(201);
    for (const [auctionId, amount] of [[firstAuction.id, body.amount + 1], [secondAuction.id, body.amount]]) {
      const response = await submit(auctionId, { ...body, amount });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    }
    expect(await Bid.count({ where: { userId: bidder.id, clientRequestId: body.clientRequestId } })).toBe(1);
  });

  test('enforces existence, live status, deadline, and seller self-bid restriction', async () => {
    await request(app).post('/auctions/999999999/bids').set(auth()).send(bidBody()).expect(404);
    for (const [overrides, code] of [
      [{ status: 'draft', startsAt: null, endsAt: null }, 'AUCTION_NOT_LIVE'],
      [{ status: 'ended' }, 'AUCTION_ENDED'],
      [{ endsAt: new Date(Date.now() - 1) }, 'AUCTION_ENDED'],
    ]) {
      const auction = await createAuction(overrides);
      const response = await submit(auction.id, bidBody());
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(code);
    }
    const live = await createAuction();
    const selfBid = await submit(live.id, bidBody(), sellerToken);
    expect(selfBid.status).toBe(403);
    expect(selfBid.body.error.code).toBe('SELF_BID_FORBIDDEN');
  });

  test('enforces first and subsequent minimum bids and the monetary ceiling', async () => {
    const auction = await createAuction();
    const tooLowFirst = await submit(auction.id, bidBody({ amount: 999 }));
    expect(tooLowFirst.status).toBe(409);
    expect(tooLowFirst.body.error.code).toBe('BID_TOO_LOW');
    await submit(auction.id, bidBody()).expect(201);

    const latest = await Auction.findByPk(auction.id);
    const tooLowNext = await submit(auction.id, bidBody({ amount: latest.currentPrice + latest.minIncrement - 1 }));
    expect(tooLowNext.status).toBe(409);
    expect(tooLowNext.body.error.code).toBe('BID_TOO_LOW');

    const capped = await createAuction({ currentPrice: 2_000_000_000, highestBidderId: bidder.id, minIncrement: 1 });
    const overCap = await submit(capped.id, bidBody({ amount: 2_000_000_000 }));
    expect(overCap.status).toBe(409);
    expect(overCap.body.error.code).toBe('BID_LIMIT_REACHED');
  });

  test('does not shorten a farther existing deadline', async () => {
    const laterDeadline = new Date(Date.now() + 3_600_000 * 3);
    const auction = await createAuction({ endsAt: laterDeadline });
    await submit(auction.id, bidBody()).expect(201);
    const updated = await Auction.findByPk(auction.id);
    expect(updated.endsAt.toISOString()).toBe(laterDeadline.toISOString());
  });

  test('rolls back bid creation when the auction state update fails', async () => {
    const auction = await createAuction({ version: 2_147_483_647 });
    const before = await Auction.findByPk(auction.id);
    const response = await submit(auction.id, bidBody());
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(await Bid.count({ where: { auctionId: auction.id } })).toBe(0);
    const after = await Auction.findByPk(auction.id);
    expect(after.currentPrice).toBe(before.currentPrice);
    expect(after.highestBidderId).toBe(before.highestBidderId);
    expect(after.version).toBe(before.version);
    expect(after.endsAt.toISOString()).toBe(before.endsAt.toISOString());
  });

  test('serializes concurrent retries and concurrent bids on the same auction', async () => {
    const retryAuction = await createAuction();
    const retry = bidBody();
    const retries = await Promise.all([submit(retryAuction.id, retry), submit(retryAuction.id, retry)]);
    expect(retries.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await Bid.count({ where: { auctionId: retryAuction.id } })).toBe(1);

    const concurrentAuction = await createAuction();
    const first = bidBody();
    const second = bidBody();
    const concurrent = await Promise.all([
      submit(concurrentAuction.id, first),
      submit(concurrentAuction.id, second),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(concurrent.find((response) => response.status === 409).body.error.code).toBe('BID_TOO_LOW');
    expect(await Bid.count({ where: { auctionId: concurrentAuction.id } })).toBe(1);
    const updated = await Auction.findByPk(concurrentAuction.id);
    expect(updated.version).toBe(concurrentAuction.version + 1);
  });
});

describe('GET /auctions/:id/bids', () => {
  test('returns paginated public bid history without idempotency keys', async () => {
    const auction = await createAuction();
    const first = bidBody();
    await submit(auction.id, first).expect(201);
    await submit(auction.id, bidBody({ amount: 1_100 })).expect(201);
    const response = await request(app).get(`/auctions/${auction.id}/bids?page=1&limit=1`).set(auth()).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ auctionId: auction.id, userId: bidder.id, amount: 1_100, bidder: { id: bidder.id, username: bidder.username } });
    expect(response.body.data[0]).not.toHaveProperty('clientRequestId');
    expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    await request(app).get(`/auctions/${auction.id}/bids?limit=0`).set(auth()).expect(400);
    await request(app).get(`/auctions/${auction.id}/bids`).expect(401);
  });
});
