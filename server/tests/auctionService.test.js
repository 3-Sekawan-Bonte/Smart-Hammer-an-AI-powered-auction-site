const { createAuctionService } = require('../src/services/auctionService');
const { validateListQuery } = require('../src/services/auctionService');
const { Op } = require('sequelize');
const input = {
  title: 'Mirrorless camera',
  description: 'A camera in good working condition.',
  condition: 'used_good',
  category: 'camera',
  productFacts: { specifications: null, defects: null, accessories: [], warranty: null },
  imageUrl: null,
  startingPrice: 1_000,
  minIncrement: 100,
  durationSeconds: 60,
};

function setup(overrides = {}) {
  const auction = {
    id: 12,
    sellerId: 5,
    ...input,
    status: 'draft',
    currentPrice: input.startingPrice,
    startsAt: null,
    endsAt: null,
    highestBidderId: null,
    winnerId: null,
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
    async update(changes) { Object.assign(this, changes); return this; },
    async destroy() { this.deleted = true; },
  };
  const Auction = {
    async create(values) { Object.assign(auction, values); return auction; },
    async findByPk() { return auction.deleted ? null : auction; },
    async findOne({ where }) { return where.sellerId === auction.sellerId ? auction : null; },
    async findAndCountAll({ where }) {
      if (!where.sellerId && auction.status === 'draft') return { count: 0, rows: [] };
      return { count: 1, rows: [auction] };
    },
  };
  const User = { name: 'User' };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = { async transaction(callback) { return callback(transaction); } };
  return { service: createAuctionService({ Auction, User, sequelize }), auction, transaction };
}

describe('auction service lifecycle and permissions', () => {
  test('validates pagination and constructs safe owner, filter, and search predicates', () => {
    const query = validateListQuery({ page: '2', limit: '5', seller: 'me', status: 'draft', category: 'camera', search: 'A_%' }, 5);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(5);
    expect(query.where.sellerId).toBe(5);
    expect(query.where.status).toBe('draft');
    expect(query.where.category).toBe('camera');
    expect(query.where.title[Op.iLike]).toBe('%A\\_\\%%');
    for (const invalid of [{ page: '0' }, { limit: '51' }, { status: 'unknown' }, { seller: '6' }]) {
      expect(() => validateListQuery(invalid, 5)).toThrow(expect.any(Error));
    }
  });

  test('creates a draft from server-derived seller data and initializes state', async () => {
    const { service, auction } = setup();
    const result = await service.create(5, input);
    expect(result).toBe(auction);
    expect(auction).toMatchObject({ sellerId: 5, currentPrice: input.startingPrice, status: 'draft', version: 0, startsAt: null, endsAt: null });
  });

  test('keeps draft rows out of a general list and permits owner filtering', async () => {
    const { service } = setup();
    const general = await service.list(5, {});
    expect(general.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
    const owned = await service.list(5, { seller: 'me' });
    expect(owned.rows).toHaveLength(1);
    await expect(service.list(5, { seller: '6' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('returns 404 when a non-owner attempts draft access or mutation', async () => {
    const { service } = setup();
    await expect(service.getById(12, 6)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(service.update(12, 6, { title: 'A valid replacement title' })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(service.remove(12, 6)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(service.start(12, 6)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  test('preserves omitted fields and rejects a patch that exceeds the price ceiling', async () => {
    const { service, auction } = setup();
    await service.update(12, 5, { title: 'Updated camera listing' });
    expect(auction.description).toBe(input.description);
    auction.startingPrice = 1_999_999_999;
    await expect(service.update(12, 5, { minIncrement: 2 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('starts atomically using server time, sets deadline, and advances version', async () => {
    const { service, auction } = setup();
    const now = new Date('2026-01-01T00:00:00.000Z');
    await service.start(12, 5, now);
    expect(auction.startsAt.toISOString()).toBe(now.toISOString());
    expect(auction.endsAt.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    expect(auction.status).toBe('live');
    expect(auction.version).toBe(1);
    await expect(service.start(12, 5, now)).rejects.toMatchObject({ status: 409, code: 'AUCTION_NOT_DRAFT' });
  });

  test('only deletes drafts owned by the authenticated user', async () => {
    const { service, auction } = setup();
    await expect(service.remove(12, 5)).resolves.toEqual({ id: 12 });
    expect(auction.deleted).toBe(true);
    const nonDraft = setup({ status: 'live' });
    await expect(nonDraft.service.remove(12, 5)).rejects.toMatchObject({ status: 409, code: 'AUCTION_NOT_DRAFT' });
  });
});
