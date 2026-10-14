const { createBidService } = require('../src/services/bidService');

function setup(overrides = {}) {
  const auction = {
    id: 8,
    sellerId: 2,
    status: 'live',
    startsAt: new Date(Date.now() - 1_000),
    endsAt: new Date(Date.now() + 7_200_000),
    startingPrice: 1_000,
    currentPrice: 1_000,
    minIncrement: 100,
    highestBidderId: null,
    version: 1,
    ...overrides,
    async update(changes, options) {
      expect(options).toEqual({ transaction });
      Object.assign(this, changes);
      return this;
    },
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const bids = [];
  const Auction = {
    async findByPk(_id, options) { expect(options).toMatchObject({ transaction, lock: 'UPDATE' }); return auction; },
  };
  const Bid = {
    async findOne({ where }) { return bids.find((bid) => bid.userId === where.userId && bid.clientRequestId === where.clientRequestId) || null; },
    async create(values, options) {
      expect(options).toEqual({ transaction });
      const bid = { id: bids.length + 1, ...values };
      bids.push(bid);
      return bid;
    },
  };
  const sequelize = { async transaction(callback) { return callback(transaction); } };
  return { service: createBidService({ Auction, Bid, sequelize }), auction, bids };
}

const input = { amount: 1_000, clientRequestId: '550e8400-e29b-41d4-a716-446655440000' };

describe('bid service state rules', () => {
  test('creates one accepted first bid and updates all auction state under the row lock transaction', async () => {
    const { service, auction, bids } = setup();
    const result = await service.place(4, auction.id, input);
    expect(result).toMatchObject({ replayed: false, bid: { auctionId: auction.id, userId: 4, amount: input.amount } });
    expect(bids).toHaveLength(1);
    expect(auction).toMatchObject({ currentPrice: input.amount, highestBidderId: 4, version: 2 });
    expect(auction.endsAt.getTime()).toBeGreaterThanOrEqual(new Date(result.bid.createdAt).getTime() + 3_600_000);
  });

  test('returns the existing accepted bid on replay before evaluating the current auction state', async () => {
    const { service, auction, bids } = setup({ status: 'ended' });
    const existing = { id: 18, auctionId: auction.id, userId: 4, ...input, createdAt: new Date('2026-10-14T10:01:00.000Z') };
    bids.push(existing);
    await expect(service.place(4, auction.id, input)).resolves.toMatchObject({ replayed: true, bid: { id: existing.id } });
    expect(bids).toHaveLength(1);
  });

  test('rejects idempotency conflicts, missing/live/deadline/self-bid, minimum and price-limit violations', async () => {
    const conflict = setup();
    conflict.bids.push({ id: 1, auctionId: 99, userId: 4, ...input, createdAt: new Date() });
    await expect(conflict.service.place(4, 8, input)).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });

    await expect(setup({ status: 'draft' }).service.place(4, 8, input)).rejects.toMatchObject({ code: 'AUCTION_NOT_LIVE' });
    await expect(setup({ status: 'ended' }).service.place(4, 8, input)).rejects.toMatchObject({ code: 'AUCTION_ENDED' });
    await expect(setup({ endsAt: new Date(0) }).service.place(4, 8, input)).rejects.toMatchObject({ code: 'AUCTION_ENDED' });
    await expect(setup({ sellerId: 4 }).service.place(4, 8, input)).rejects.toMatchObject({ status: 403, code: 'SELF_BID_FORBIDDEN' });
    await expect(setup().service.place(4, 8, { ...input, amount: 999 })).rejects.toMatchObject({ code: 'BID_TOO_LOW' });
    await expect(setup({ currentPrice: 2_000_000_000, highestBidderId: 5, minIncrement: 1 }).service.place(4, 8, input)).rejects.toMatchObject({ code: 'BID_LIMIT_REACHED' });
  });
});
