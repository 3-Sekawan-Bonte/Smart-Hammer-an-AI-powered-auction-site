const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const app = require('../src/app');
const { sequelize, User, Auction } = require('../src/models');

const suffix = `${process.pid}-${crypto.randomUUID()}`;
const firstEmail = `auction-a-${suffix}@example.test`;
const secondEmail = `auction-b-${suffix}@example.test`;
const PASSWORD_HASH = '$2a$10$wHkV4zgYY5HM4ymwYh2hLe7v5fSnmbZk1jB3gM3bE9mZkSXtE3g3K';
const input = {
  title: 'Sony Alpha camera',
  description: 'Mirrorless camera in good working condition.',
  condition: 'used_good',
  category: 'camera',
  productFacts: { specifications: '24MP sensor', defects: null, accessories: ['strap'], warranty: null },
  imageUrl: 'https://example.test/camera.jpg',
  startingPrice: 1_000_000,
  minIncrement: 50_000,
  durationSeconds: 3600,
};

let seller;
let other;
let sellerToken;
let otherToken;

function tokenFor(user) {
  return jwt.sign({ sub: String(user.id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function auth(token = sellerToken) {
  return { Authorization: `Bearer ${token}` };
}

async function createDraft(token = sellerToken, body = input) {
  return request(app).post('/auctions').set(auth(token)).send(body);
}

async function createRawAuction(overrides = {}) {
  return Auction.create({
    ...input,
    sellerId: seller.id,
    currentPrice: input.startingPrice,
    startsAt: null,
    endsAt: null,
    status: 'draft',
    highestBidderId: null,
    winnerId: null,
    version: 0,
    ...overrides,
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL && (!process.env.DB_NAME || !process.env.DB_USERNAME)) {
    throw new Error('Configure an isolated PostgreSQL test database using DATABASE_URL or DB_NAME and DB_USERNAME.');
  }
  await sequelize.authenticate();
});

beforeEach(async () => {
  seller = await User.create({ username: 'seller-a', email: firstEmail, password: PASSWORD_HASH });
  other = await User.create({ username: 'seller-b', email: secondEmail, password: PASSWORD_HASH });
  sellerToken = tokenFor(seller);
  otherToken = tokenFor(other);
});

afterEach(async () => {
  const users = [seller?.id, other?.id].filter(Boolean);
  if (users.length) {
    await Auction.destroy({ where: { sellerId: users } });
    await User.destroy({ where: { id: users } });
  }
});

afterAll(async () => sequelize.close());

describe('auction authentication and creation', () => {
  test('requires authentication and derives sellerId from the JWT user', async () => {
    await request(app).post('/auctions').send(input).expect(401);
    const response = await createDraft();
    expect(response.status).toBe(201);
    expect(response.body.data.auction.sellerId).toBe(seller.id);
    expect(response.body.data.auction.seller).toEqual({ id: seller.id, username: seller.username });
    expect(response.body.data.auction).not.toHaveProperty('seller.email');
    expect(JSON.stringify(response.body)).not.toContain(PASSWORD_HASH);
    expect(response.body.data.auction).toMatchObject({ currentPrice: input.startingPrice, status: 'draft', version: 0, startsAt: null, endsAt: null });
  });

  test('validates required fields, title, description, condition, category, facts, image URL, prices, duration, and protected fields', async () => {
    const cases = [
      [{ ...input, title: undefined }, 'title'],
      [{ ...input, title: 'ab' }, 'title'],
      [{ ...input, description: 'too short' }, 'description'],
      [{ ...input, condition: 'refurbished' }, 'condition'],
      [{ ...input, category: 'electronics' }, 'category'],
      [{ ...input, productFacts: { unknown: 'x' } }, 'productFacts.unknown'],
      [{ ...input, productFacts: { specifications: 'x'.repeat(2001) } }, 'productFacts.specifications'],
      [{ ...input, productFacts: { defects: 'x'.repeat(1001) } }, 'productFacts.defects'],
      [{ ...input, productFacts: { accessories: Array(11).fill('item') } }, 'productFacts.accessories'],
      [{ ...input, productFacts: { accessories: ['x'.repeat(101)] } }, 'productFacts.accessories.0'],
      [{ ...input, imageUrl: 'http://example.test/image.png' }, 'imageUrl'],
      [{ ...input, startingPrice: 1.2 }, 'startingPrice'],
      [{ ...input, startingPrice: 2_000_000_001 }, 'startingPrice'],
      [{ ...input, minIncrement: 0 }, 'minIncrement'],
      [{ ...input, durationSeconds: 59 }, 'durationSeconds'],
      [{ ...input, durationSeconds: 86401 }, 'durationSeconds'],
      [{ ...input, status: 'live' }, 'status'],
      [{ ...input, unexpected: true }, 'unexpected'],
    ];
    for (const [body, field] of cases) {
      const response = await createDraft(sellerToken, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.hasOwn(response.body.error.fields, field)).toBe(true);
    }
    expect(await Auction.count({ where: { sellerId: seller.id } })).toBe(0);
  });

  test('rejects a starting price plus increment above the documented money limit', async () => {
    const response = await createDraft(sellerToken, { ...input, startingPrice: 1_999_999_999, minIncrement: 2 });
    expect(response.status).toBe(400);
    expect(Object.hasOwn(response.body.error.fields, 'minIncrement')).toBe(true);
  });

  test('defaults omitted product facts consistently and allows an omitted image URL', async () => {
    const response = await createDraft(sellerToken, { ...input, productFacts: undefined, imageUrl: undefined });
    expect(response.status).toBe(201);
    expect(response.body.data.auction.productFacts).toEqual({ specifications: null, defects: null, accessories: [], warranty: null });
    expect(response.body.data.auction.imageUrl).toBeNull();
  });
});

describe('auction listing and details', () => {
  test('paginates with documented defaults and filters by category, status, search, and seller=me', async () => {
    const own = await createRawAuction({ title: 'Sony Camera Alpha' });
    await createRawAuction({ title: 'Other public camera', status: 'live', startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), version: 1 });
    await Auction.create({ ...input, sellerId: other.id, title: 'Other seller camera', currentPrice: input.startingPrice, status: 'live', startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), version: 1 });
    const defaults = await request(app).get('/auctions').set(auth());
    expect(defaults.status).toBe(200);
    expect(defaults.body.meta).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
    expect(defaults.body.data.map((item) => item.title).sort()).toEqual(['Other seller camera', 'Other public camera']);
    const mine = await request(app).get('/auctions?seller=me&status=draft&category=camera&search=sony').set(auth());
    expect(mine.body.data.map((item) => item.id)).toEqual([own.id]);
    const filtered = await request(app).get('/auctions?status=live&category=camera&search=other&limit=1&page=1').set(auth());
    expect(filtered.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  test('rejects invalid pagination, filters, and arbitrary seller IDs', async () => {
    for (const query of ['?page=0', '?limit=51', '?page=1.5', '?status=unknown', '?category=electronics', '?seller=2']) {
      const response = await request(app).get(`/auctions${query}`).set(auth());
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('hides another seller draft from listing and detail, and returns 404 for missing IDs', async () => {
    const privateDraft = await createRawAuction();
    const list = await request(app).get('/auctions?seller=me').set(auth(otherToken));
    expect(list.body.data).toEqual([]);
    await request(app).get(`/auctions/${privateDraft.id}`).set(auth(otherToken)).expect(404);
    await request(app).get('/auctions/999999999').set(auth()).expect(404);
    await request(app).get('/auctions/0').set(auth()).expect(400);
  });

  test('serializes only public user profiles', async () => {
    const auction = await createRawAuction();
    const response = await request(app).get(`/auctions/${auction.id}`).set(auth());
    expect(response.status).toBe(200);
    expect(response.body.data.auction.seller).toEqual({ id: seller.id, username: seller.username });
    expect(JSON.stringify(response.body)).not.toMatch(/email|password|token/i);
  });
});

describe('auction draft editing and deletion', () => {
  test('owners can partially update a draft without changing omitted fields', async () => {
    const auction = await createRawAuction();
    const response = await request(app).patch(`/auctions/${auction.id}`).set(auth()).send({ title: 'Updated camera title' });
    expect(response.status).toBe(200);
    expect(response.body.data.auction).toMatchObject({ title: 'Updated camera title', description: input.description, currentPrice: input.startingPrice });
  });

  test('rejects edits by non-owners, protected fields, invalid supplied fields, and non-draft states', async () => {
    const draft = await createRawAuction();
    await request(app).patch(`/auctions/${draft.id}`).set(auth(otherToken)).send({ title: 'Updated camera title' }).expect(404);
    const protectedResponse = await request(app).patch(`/auctions/${draft.id}`).set(auth()).send({ status: 'live' });
    expect(protectedResponse.status).toBe(400);
    await request(app).patch(`/auctions/${draft.id}`).set(auth()).send({ category: 'invalid' }).expect(400);
    for (const status of ['live', 'ended']) {
      const auction = await createRawAuction({ status, startsAt: new Date(), endsAt: new Date(), version: 1 });
      const response = await request(app).patch(`/auctions/${auction.id}`).set(auth()).send({ title: 'Updated camera title' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('AUCTION_NOT_DRAFT');
    }
  });

  test('deletes only an owned draft', async () => {
    const draft = await createRawAuction();
    await request(app).delete(`/auctions/${draft.id}`).set(auth(otherToken)).expect(404);
    const response = await request(app).delete(`/auctions/${draft.id}`).set(auth());
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: draft.id });
    expect(await Auction.findByPk(draft.id)).toBeNull();
    for (const status of ['live', 'ended']) {
      const auction = await createRawAuction({ status });
      const blocked = await request(app).delete(`/auctions/${auction.id}`).set(auth());
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('AUCTION_NOT_DRAFT');
    }
  });
});

describe('auction start lifecycle', () => {
  test('owners start drafts using server time and increment version once', async () => {
    const draft = await createRawAuction();
    const before = Date.now();
    const response = await request(app).post(`/auctions/${draft.id}/start`).set(auth()).send({});
    const after = Date.now();
    expect(response.status).toBe(200);
    const auction = response.body.data.auction;
    expect(auction.status).toBe('live');
    expect(auction.version).toBe(1);
    expect(new Date(auction.startsAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(auction.startsAt).getTime()).toBeLessThanOrEqual(after);
    expect(new Date(auction.endsAt).getTime() - new Date(auction.startsAt).getTime()).toBe(input.durationSeconds * 1000);
    expect(auction.currentPrice).toBe(input.startingPrice);
  });

  test('rejects non-owner, repeated starts, invalid state, and client lifecycle fields', async () => {
    const draft = await createRawAuction();
    await request(app).post(`/auctions/${draft.id}/start`).set(auth(otherToken)).send({}).expect(404);
    await request(app).post(`/auctions/${draft.id}/start`).set(auth()).send({ status: 'ended' }).expect(400);
    await request(app).post(`/auctions/${draft.id}/start`).set(auth()).send({}).expect(200);
    const repeated = await request(app).post(`/auctions/${draft.id}/start`).set(auth()).send({});
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('AUCTION_NOT_DRAFT');
  });
});
