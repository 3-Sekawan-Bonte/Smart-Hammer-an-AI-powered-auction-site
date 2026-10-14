const { createAuctionEventPublisher } = require('../src/socket/auctionEventPublisher');

describe('auction event publisher', () => {
  test('uses the room contract and authoritative version in the shared serializer envelope', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const io = { to };
    const publisher = createAuctionEventPublisher();
    publisher.attach(io);
    const auction = {
      id: 12,
      sellerId: 7,
      status: 'live',
      version: 4,
      title: 'Camera',
      currentPrice: 1000,
      highestBidderId: null,
      winnerId: null,
      seller: { id: 7, username: 'seller', email: 'private@example.test', password: 'private-hash' },
    };

    publisher.publish('auction:started', auction);

    expect(to).toHaveBeenCalledWith('auction:12');
    expect(emit).toHaveBeenCalledWith('auction:started', expect.objectContaining({
      auctionId: 12,
      version: 4,
      serverNow: expect.any(String),
      data: { auction: expect.objectContaining({ id: 12, version: 4, seller: { id: 7, username: 'seller' } }) },
    }));
    expect(JSON.stringify(emit.mock.calls[0])).not.toContain('private@example.test');
    expect(JSON.stringify(emit.mock.calls[0])).not.toContain('private-hash');
  });

  test('rejects attaching a second Socket.IO instance', () => {
    const publisher = createAuctionEventPublisher();
    publisher.attach({});
    expect(() => publisher.attach({})).toThrow('already has a Socket.IO server');
  });
});
