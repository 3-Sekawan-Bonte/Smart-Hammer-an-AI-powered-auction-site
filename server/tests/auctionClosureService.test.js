const { createAuctionClosureService } = require('../src/services/auctionClosureService');
const { auctionToJSON } = require('../src/utils/auctionSerializer');

function setup({ auction: overrides = {}, lastBid = null, clock = () => new Date('2026-10-14T12:00:00.000Z') } = {}) {
  const auction = {
    id: 12,
    status: 'live',
    endsAt: new Date('2026-10-14T11:59:59.000Z'),
    currentPrice: 1_500,
    highestBidderId: 4,
    winnerId: null,
    version: 3,
    ...overrides,
    async update(changes, options) {
      expect(options).toEqual({ transaction });
      Object.assign(this, changes);
      return this;
    },
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const Auction = {
    async findByPk(id, options) {
      expect(id).toBe(auction.id);
      expect(options).toEqual({ transaction, lock: 'UPDATE' });
      return auction;
    },
  };
  const Bid = {
    findOne: jest.fn(async (options) => {
      expect(options).toMatchObject({ where: { auctionId: auction.id }, transaction });
      expect(options.order).toEqual([['createdAt', 'DESC'], ['id', 'DESC']]);
      return lastBid;
    }),
  };
  const sequelize = { async transaction(callback) { return callback(transaction); } };
  return { service: createAuctionClosureService({ Auction, Bid, sequelize, clock }), auction, Auction, Bid, sequelize };
}

describe('auction closure service', () => {
  test('serializes finalPrice from ended auction state without adding a stored column', () => {
    expect(auctionToJSON({ status: 'ended', highestBidderId: 4, currentPrice: 1_500 }).finalPrice).toBe(1_500);
    expect(auctionToJSON({ status: 'ended', highestBidderId: null, currentPrice: 1_000 }).finalPrice).toBeNull();
    expect(auctionToJSON({ status: 'live', highestBidderId: 4, currentPrice: 1_500 }).finalPrice).toBeNull();
  });

  test('closes expired live auctions with the persisted highest bidder and final price', async () => {
    const { service, auction } = setup({ lastBid: { amount: 1_500, userId: 4 } });
    const result = await service.close(auction.id);
    expect(result).toMatchObject({ closed: true, finalPrice: 1_500 });
    expect(auction).toMatchObject({ status: 'ended', winnerId: 4, currentPrice: 1_500, version: 4 });
  });

  test('closes an expired auction with no bids with a null winner and final price', async () => {
    const { service, auction } = setup({ auction: { highestBidderId: null, currentPrice: 1_000 }, lastBid: null });
    const result = await service.close(auction.id);
    expect(result).toMatchObject({ closed: true, finalPrice: null });
    expect(auction).toMatchObject({ status: 'ended', winnerId: null, currentPrice: 1_000, version: 4 });
  });

  test.each([
    ['not expired', { endsAt: new Date('2026-10-14T12:00:01.000Z') }],
    ['draft', { status: 'draft' }],
    ['already ended', { status: 'ended', winnerId: 4 }],
  ])('leaves an ineligible auction unchanged (%s)', async (_label, auctionOverrides) => {
    const { service, auction, Bid } = setup({ auction: auctionOverrides });
    const before = { ...auction };
    const result = await service.close(auction.id);
    expect(result.closed).toBe(false);
    expect(auction.status).toBe(before.status);
    expect(auction.winnerId).toBe(before.winnerId);
    expect(auction.version).toBe(before.version);
    expect(Bid.findOne).not.toHaveBeenCalled();
  });

  test('does not change an ended auction when closure is repeated', async () => {
    const { service, auction } = setup({ auction: { status: 'ended', winnerId: 4 }, lastBid: { amount: 1_500 } });
    const first = await service.close(auction.id);
    const second = await service.close(auction.id);
    expect(first).toMatchObject({ closed: false, finalPrice: 1_500 });
    expect(second).toMatchObject({ closed: false, finalPrice: 1_500 });
    expect(auction.version).toBe(3);
  });

  test('returns not found for an auction missing when locked', async () => {
    const { Auction, Bid, sequelize } = setup();
    Auction.findByPk = async () => null;
    const service = createAuctionClosureService({ Auction, Bid, sequelize });
    await expect(service.close(999)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
