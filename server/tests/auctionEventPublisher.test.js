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

  test('publishes public Auctioneer commentary only to auction rooms', () => {
    const emit = jest.fn();
    const publisher = createAuctionEventPublisher();
    publisher.attach({ to: () => ({ emit }) });
    publisher.publishAIInteraction('ai:message', {
      auctionId: 12,
      version: 4,
      interaction: { id: 99, kind: 'commentary', visibility: 'public', status: 'completed', sourceVersion: 4 },
    });
    expect(emit).toHaveBeenCalledWith('ai:message', expect.objectContaining({
      auctionId: 12,
      version: 4,
      serverNow: expect.any(String),
      data: { interaction: expect.objectContaining({ kind: 'commentary', status: 'completed' }) },
    }));
  });

  test('private question events are owner-only and cannot be sent through the public publisher', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const publisher = createAuctionEventPublisher();
    publisher.attach({ to });
    const question = { id: 100, userId: 8, kind: 'question', visibility: 'private', status: 'pending' };
    publisher.publishAIInteraction('ai:pending', { auctionId: 12, version: 4, interaction: question });
    expect(to).not.toHaveBeenCalled();
    publisher.publishPrivateAIInteraction(8, 'ai:pending', { auctionId: 12, version: 4, interaction: question });
    expect(to).toHaveBeenCalledWith('user:8');
    expect(emit).toHaveBeenCalledWith('ai:pending', expect.objectContaining({
      auctionId: 12, version: 4, serverNow: expect.any(String), data: { interaction: question },
    }));
    publisher.publishPrivateAIInteraction(9, 'ai:pending', { auctionId: 12, version: 4, interaction: question });
    expect(to).toHaveBeenCalledTimes(1);
  });
});
