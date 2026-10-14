const { createBidService } = require('../src/services/bidService');

describe('public bid history', () => {
  test('paginates and omits the private idempotency request id', async () => {
    const auction = { id: 7, sellerId: 3, status: 'live' };
    const Bid = {
      findAndCountAll: jest.fn().mockResolvedValue({ count: 1, rows: [{ toJSON: () => ({
        id: 11, auctionId: 7, userId: 9, amount: 1200, clientRequestId: 'private-key',
        createdAt: new Date('2026-10-14T00:00:00Z'), bidder: { id: 9, username: 'Buyer' },
      }) }] }),
    };
    const service = createBidService({ Auction: { findByPk: jest.fn().mockResolvedValue(auction) }, Bid, User: {}, sequelize: {} });
    const result = await service.list(9, 7, { page: '1', limit: '10' });
    expect(result.rows).toEqual([{ id: 11, auctionId: 7, userId: 9, amount: 1200,
      createdAt: '2026-10-14T00:00:00.000Z', bidder: { id: 9, username: 'Buyer' } }]);
    expect(JSON.stringify(result)).not.toContain('private-key');
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(Bid.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 0 }));
  });

  test('hides another seller’s draft and rejects invalid query parameters', async () => {
    const service = createBidService({ Auction: { findByPk: jest.fn().mockResolvedValue({ id: 7, sellerId: 3, status: 'draft' }) }, Bid: {}, sequelize: {} });
    await expect(service.list(9, 7, {})).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(service.list(3, 7, { limit: '101' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});
