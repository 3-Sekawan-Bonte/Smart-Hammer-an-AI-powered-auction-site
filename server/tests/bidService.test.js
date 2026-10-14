const { createBidService } = require('../src/services/bidService');

function setup(overrides = {}, eventPublisher, failCommit = false, initialBidCount = 0, auctioneer) {
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
  const bids = Array.from({ length: initialBidCount }, (_, index) => ({
    id: index + 1,
    auctionId: auction.id,
    userId: index + 20,
    amount: 1_000 + (index * 100),
    clientRequestId: `existing-${index}`,
    createdAt: new Date(Date.now() - (initialBidCount - index) * 1000),
  }));
  const Auction = {
    async findByPk(_id, options) { expect(options).toMatchObject({ transaction, lock: 'UPDATE' }); return auction; },
  };
  const Bid = {
    async findOne({ where }) { return bids.find((bid) => bid.userId === where.userId && bid.clientRequestId === where.clientRequestId) || null; },
    async count({ where, transaction: countTransaction }) { expect(where).toEqual({ auctionId: auction.id }); expect(countTransaction).toBe(transaction); return bids.length; },
    async create(values, options) {
      expect(options).toEqual({ transaction });
      const bid = { id: bids.length + 1, ...values };
      bids.push(bid);
      return bid;
    },
  };
  const sequelize = { async transaction(callback) { const result = await callback(transaction); this.committed = true; if (eventPublisher) eventPublisher.committed = true; if (failCommit) throw new Error('commit failed'); return result; } };
  return { service: createBidService({ Auction, Bid, sequelize, eventPublisher, auctioneer }), auction, bids, sequelize };
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

  test('publishes accepted bids after commit, and never publishes a rejected bid', async () => {
    const publisher = { committed: false, publish: jest.fn(function publish() { expect(this.committed).toBe(true); }) };
    const { service, auction } = setup({}, publisher);
    await service.place(4, auction.id, input);
    expect(publisher.publish).toHaveBeenCalledWith('bid:updated', auction, { bid: expect.objectContaining({ amount: input.amount }) });

    publisher.publish.mockClear();
    await expect(setup({ status: 'draft' }, publisher).service.place(4, 8, input)).rejects.toMatchObject({ code: 'AUCTION_NOT_LIVE' });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  test('does not publish when the transaction fails to commit', async () => {
    const publisher = { publish: jest.fn() };
    const state = setup({}, publisher, true);
    await expect(state.service.place(4, 8, input)).rejects.toThrow('commit failed');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  test.each([[2, 3], [5, 6]])('triggers commentary after the %i prior bids when the accepted bid is number %i', async (priorCount, bidCount) => {
    const auctioneer = { trigger: jest.fn(function trigger() { expect(state.sequelize.committed).toBe(true); }) };
    const state = setup({ currentPrice: 1_000 + (priorCount * 100), highestBidderId: 19 }, null, false, priorCount, auctioneer);
    await state.service.place(4, state.auction.id, { ...input, amount: state.auction.currentPrice + 100 });
    expect(auctioneer.trigger).toHaveBeenCalledWith(expect.objectContaining({
      auction: state.auction,
      trigger: 'bid_milestone',
      triggerData: expect.objectContaining({ bidCount }),
    }));
  });

  test('does not trigger commentary for a non-milestone, idempotent retry, rejected bid, or failed commit', async () => {
    const auctioneer = { trigger: jest.fn() };
    const nonMilestone = setup({}, null, false, 1, auctioneer);
    await nonMilestone.service.place(4, nonMilestone.auction.id, input);
    expect(auctioneer.trigger).not.toHaveBeenCalled();

    const replay = setup({ status: 'ended' }, null, false, 2, auctioneer);
    replay.bids.push({ id: 99, auctionId: replay.auction.id, userId: 4, ...input, createdAt: new Date() });
    await replay.service.place(4, replay.auction.id, input);
    expect(auctioneer.trigger).not.toHaveBeenCalled();

    const rejected = setup({ status: 'draft' }, null, false, 2, auctioneer);
    await expect(rejected.service.place(4, rejected.auction.id, input)).rejects.toMatchObject({ code: 'AUCTION_NOT_LIVE' });
    const failed = setup({}, null, true, 2, auctioneer);
    await expect(failed.service.place(4, failed.auction.id, input)).rejects.toThrow('commit failed');
    expect(auctioneer.trigger).not.toHaveBeenCalled();
  });

  test('keeps a committed accepted bid successful when socket delivery throws', async () => {
    const state = setup({}, { publish: jest.fn(() => { throw new Error('socket down'); }) });
    await expect(state.service.place(4, state.auction.id, input)).resolves.toMatchObject({ replayed: false });
    expect(state.bids).toHaveLength(1);
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
