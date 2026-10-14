const { buildContext, createAuctioneerService } = require('../src/services/auctioneerService');

function makeAuction(overrides = {}) {
  return {
    id: 42,
    title: 'Mirrorless camera',
    description: 'Seller supplied description.',
    condition: 'used_good',
    category: 'camera',
    productFacts: { specifications: '24 MP', defects: null, accessories: ['strap'], warranty: null },
    status: 'live',
    startsAt: new Date('2026-10-14T10:00:00.000Z'),
    endsAt: new Date('2026-10-14T11:00:00.000Z'),
    startingPrice: 1000,
    currentPrice: 1300,
    highestBidderId: 8,
    winner: null,
    version: 3,
    ...overrides,
  };
}

function setup({ provider = { generateCommentary: jest.fn(async () => ({ answer: 'Kamera ini mulai ditawarkan.', missingInformation: [] })) }, failDuplicate = false, maxConcurrent } = {}) {
  const records = [];
  const logger = { error: jest.fn(), warn: jest.fn() };
  const eventPublisher = { publishAIInteraction: jest.fn() };
  const AIInteraction = {
    async create(values) {
      if (failDuplicate && records.some((record) => record.triggerKey === values.triggerKey)) {
        throw Object.assign(new Error('unique'), { name: 'SequelizeUniqueConstraintError' });
      }
      const record = {
        id: records.length + 1,
        ...values,
        createdAt: new Date('2026-10-14T10:00:01.000Z'),
        updatedAt: new Date('2026-10-14T10:00:01.000Z'),
        async update(changes) { Object.assign(this, changes); return this; },
        toJSON() { return { ...this }; },
      };
      records.push(record);
      return record;
    },
  };
  const service = createAuctioneerService({
    AIInteraction,
    provider,
    eventPublisher,
    clock: () => new Date('2026-10-14T10:00:00.000Z'),
    logger,
    ...(maxConcurrent ? { maxConcurrent } : {}),
  });
  return { service, provider, eventPublisher, records, logger };
}

describe('AI Auctioneer service', () => {
  test('stores a grounded public commentary with trigger and snapshot metadata, then emits pending and message', async () => {
    const state = setup();
    const auction = makeAuction();
    expect(state.service.trigger({ auction, trigger: 'start', triggerData: { bidCount: 0 } })).toBe(true);
    await state.service.waitForIdle();

    expect(state.records[0]).toMatchObject({
      auctionId: 42,
      userId: null,
      kind: 'commentary',
      visibility: 'public',
      triggerKey: 'start',
      status: 'completed',
      sourceVersion: 3,
      snapshotAt: new Date('2026-10-14T10:00:00.000Z'),
      answer: 'Kamera ini mulai ditawarkan.',
    });
    expect(state.provider.generateCommentary).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        trigger: 'start',
        auction: expect.objectContaining({ title: 'Mirrorless camera', productFacts: { specifications: '24 MP', defects: null, accessories: ['strap'], warranty: null }, bidCount: 0 }),
      }),
    }));
    expect(state.eventPublisher.publishAIInteraction.mock.calls.map(([event]) => event)).toEqual(['ai:pending', 'ai:message']);
    expect(state.eventPublisher.publishAIInteraction.mock.calls[1][1]).toMatchObject({
      auctionId: 42,
      version: 3,
      interaction: { kind: 'commentary', status: 'completed', sourceVersion: 3 },
    });
  });

  test('captures accurate milestone and no-bid closing facts without inventing a winner or final price', () => {
    const milestone = buildContext(makeAuction(), 'bid_milestone', {
      bidCount: 6,
      acceptedBid: { amount: 1300, createdAt: '2026-10-14T10:00:00.000Z' },
    });
    expect(milestone.auction).toMatchObject({ bidCount: 6, currentPrice: 1300, acceptedBid: { amount: 1300 } });

    const ended = buildContext(makeAuction({ status: 'ended', highestBidderId: null, currentPrice: 1000, winner: null }), 'end', { bidCount: 0 });
    expect(ended.auction).toMatchObject({ status: 'ended', bidCount: 0, currentPrice: 1000, finalPrice: null, winner: null });
  });

  test('rejects non-milestone triggers and relies on durable trigger keys for retries', async () => {
    const state = setup({ failDuplicate: true });
    const auction = makeAuction();
    expect(state.service.trigger({ auction, trigger: 'bid_milestone', triggerData: { bidCount: 4 } })).toBe(false);
    expect(state.service.trigger({ auction, trigger: 'bid_milestone', triggerData: { bidCount: 3 } })).toBe(true);
    await state.service.waitForIdle();
    expect(state.service.trigger({ auction, trigger: 'bid_milestone', triggerData: { bidCount: 3 } })).toBe(true);
    await state.service.waitForIdle();
    expect(state.records).toHaveLength(1);
    expect(state.provider.generateCommentary).toHaveBeenCalledTimes(1);
  });

  test('records provider failures as failed and emits only a safe error event', async () => {
    const state = setup({ provider: { generateCommentary: jest.fn(async () => { throw Object.assign(new Error('private provider body'), { code: 'AI_RATE_LIMITED', statusCode: 429 }); }) } });
    state.service.trigger({ auction: makeAuction({ status: 'ended' }), trigger: 'end', triggerData: { bidCount: 2 } });
    await state.service.waitForIdle();
    expect(state.records[0]).toMatchObject({ status: 'failed', errorCode: 'AI_UNAVAILABLE', answer: null });
    expect(state.eventPublisher.publishAIInteraction.mock.calls.map(([event]) => event)).toEqual(['ai:pending', 'ai:error']);
    expect(state.eventPublisher.publishAIInteraction.mock.calls[1][1].message).toBe('Auctioneer commentary is temporarily unavailable.');
    expect(JSON.stringify(state.eventPublisher.publishAIInteraction.mock.calls)).not.toContain('private provider body');
    expect(state.logger.error).toHaveBeenCalledWith('AI Auctioneer failed for auction 42 (AI_RATE_LIMITED status=429).');
    expect(JSON.stringify(state.logger.error.mock.calls)).not.toContain('private provider body');
  });

  test('limits commentary to one active generation per auction without blocking other rooms', async () => {
    const resolvers = [];
    const provider = { generateCommentary: jest.fn(() => new Promise((done) => { resolvers.push(done); })) };
    const state = setup({ provider });
    expect(state.service.trigger({ auction: makeAuction(), trigger: 'start' })).toBe(true);
    await Promise.resolve();
    expect(state.service.trigger({ auction: makeAuction(), trigger: 'start' })).toBe(false);
    expect(state.service.trigger({ auction: makeAuction({ id: 43 }), trigger: 'start' })).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    resolvers.forEach((resolve) => resolve({ answer: 'Dimulai.', missingInformation: [] }));
    await state.service.waitForIdle();
  });

  test('caps concurrent provider requests across auctions', async () => {
    const resolvers = [];
    const provider = { generateCommentary: jest.fn(() => new Promise((done) => { resolvers.push(done); })) };
    const state = setup({ provider, maxConcurrent: 1 });
    expect(state.service.trigger({ auction: makeAuction(), trigger: 'start' })).toBe(true);
    expect(state.service.trigger({ auction: makeAuction({ id: 43 }), trigger: 'start' })).toBe(false);
    await new Promise((resolve) => setImmediate(resolve));
    resolvers[0]({ answer: 'Dimulai.', missingInformation: [] });
    await state.service.waitForIdle();
    expect(provider.generateCommentary).toHaveBeenCalledTimes(1);
  });
});
