const { createAIInteractionService, interactionToJSON } = require('../src/services/aiInteractionService');
const { createAIQuestionRateLimiter } = require('../src/services/aiQuestionRateLimiter');

function setup({ status = 'live', provider, now = new Date('2026-10-14T12:00:00.000Z') } = {}) {
  const auction = {
    id: 9,
    sellerId: 3,
    status,
    version: 7,
    title: 'Mirrorless camera',
    description: 'Used camera, seller description.',
    condition: 'used_good',
    category: 'camera',
    productFacts: { specifications: null, defects: 'Scratch on body', accessories: ['Battery'], warranty: null },
  };
  const records = [];
  const User = { name: 'User' };
  const Auction = { async findByPk(id) { return id === 9 ? auction : null; } };
  const AIInteraction = {
    async create(values) {
      const record = {
        id: records.length + 1,
        ...values,
        createdAt: now,
        updatedAt: now,
        async update(changes) { Object.assign(this, changes, { updatedAt: now }); return this; },
      };
      records.push(record);
      return record;
    },
    async findAndCountAll(options) {
      AIInteraction.lastQuery = options;
      return { count: records.length, rows: records.slice().reverse() };
    },
    async update(values, options) {
      AIInteraction.recoveryQuery = { values, options };
      let count = 0;
      for (const record of records) if (options.where.status === record.status) { Object.assign(record, values); count += 1; }
      return [count];
    },
  };
  const clock = () => new Date(now);
  const rateLimiter = createAIQuestionRateLimiter({ clock: () => now.getTime() });
  const service = createAIInteractionService({ Auction, AIInteraction, User, provider, rateLimiter, clock });
  return { service, auction, records, AIInteraction };
}

describe('AI interaction service', () => {
  test('stores pending before calling the provider, then records grounded completion metadata', async () => {
    let state;
    const provider = { answerQuestion: jest.fn(async ({ context }) => {
      expect(state.records[0]).toMatchObject({ status: 'pending', userId: 22, sourceVersion: 7 });
      expect(context.productFacts).toEqual({ specifications: null, defects: 'Scratch on body', accessories: ['Battery'], warranty: null });
      return { answer: 'Ada goresan pada bodi.', missingInformation: ['garansi'] };
    }) };
    state = setup({ provider });
    const record = await state.service.ask(22, 9, 'Apakah ada kerusakan?');
    expect(record).toMatchObject({ status: 'completed', answer: 'Ada goresan pada bodi.', missingInformation: ['garansi'], sourceVersion: 7 });
    expect(record.snapshotAt.toISOString()).toBe('2026-10-14T12:00:00.000Z');
    expect(state.auction).toMatchObject({ status: 'live', version: 7 });
    expect(provider.answerQuestion).toHaveBeenCalledTimes(1);
  });

  test('persists handled provider failure as failed without storing a fabricated answer', async () => {
    const provider = { answerQuestion: jest.fn(async () => { throw Object.assign(new Error('private details'), { code: 'AI_TIMEOUT' }); }) };
    const { service, records } = setup({ provider });
    await expect(service.ask(22, 9, 'Apakah ada garansi?')).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect(records[0]).toMatchObject({ status: 'failed', answer: null, missingInformation: [], errorCode: 'AI_TIMEOUT' });
  });

  test('enforces per-user rate limits before the second provider call', async () => {
    const provider = { answerQuestion: jest.fn(async () => ({ answer: 'Jawaban.', missingInformation: [] })) };
    const { service, records } = setup({ provider });
    await service.ask(22, 9, 'Pertanyaan pertama?');
    await expect(service.ask(22, 9, 'Pertanyaan kedua?')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(provider.answerQuestion).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
  });

  test('rejects drafts and missing auctions before consuming a provider request', async () => {
    const provider = { answerQuestion: jest.fn() };
    const draft = setup({ status: 'draft', provider });
    draft.auction.sellerId = 22;
    await expect(draft.service.ask(22, 9, 'Pertanyaan?')).rejects.toMatchObject({ status: 409, code: 'AUCTION_NOT_LIVE' });
    await expect(draft.service.ask(22, 99, 'Pertanyaan?')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(provider.answerQuestion).not.toHaveBeenCalled();
    expect(draft.records).toHaveLength(0);
  });

  test('history is public-only, paginated, stable, and omits private profile fields', async () => {
    const { service, AIInteraction } = setup();
    const interaction = {
      id: 4, auctionId: 9, userId: 22, user: { id: 22, username: 'buyer', email: 'private@example.test' },
      kind: 'question', visibility: 'public', question: 'Pertanyaan?', answer: 'Jawaban.',
      missingInformation: [], status: 'completed', sourceVersion: 7,
      snapshotAt: new Date('2026-10-14T12:00:00Z'), createdAt: new Date('2026-10-14T12:00:01Z'), updatedAt: new Date('2026-10-14T12:00:02Z'),
      toJSON() { return this; },
    };
    AIInteraction.findAndCountAll = async (options) => {
      AIInteraction.lastQuery = options;
      return { count: 1, rows: [interaction] };
    };
    const result = await service.list(22, 9, { page: 1, limit: 10 });
    expect(AIInteraction.lastQuery).toMatchObject({ where: { auctionId: 9, visibility: 'public' }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 10, offset: 0 });
    const safe = interactionToJSON(result.rows[0]);
    expect(safe.user).toEqual({ id: 22, username: 'buyer' });
    expect(JSON.stringify(safe)).not.toContain('private@example.test');
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  test('marks leftover pending interactions as interrupted during startup recovery', async () => {
    const { service, records, AIInteraction } = setup({ provider: { answerQuestion: jest.fn() } });
    records.push({ status: 'pending', errorCode: null, answer: null });
    await expect(service.recoverPending()).resolves.toBe(1);
    expect(AIInteraction.recoveryQuery).toEqual({
      values: { status: 'failed', errorCode: 'AI_INTERRUPTED', answer: null, missingInformation: [] },
      options: { where: { status: 'pending' } },
    });
  });
});
