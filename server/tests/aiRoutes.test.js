const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { createAuctionRoutes } = require('../src/routes/auctionRoutes');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');

const secret = 'ai-routes-test-secret';

function setup({ status = 'live', provider } = {}) {
  const records = [];
  const user = { id: 10, username: 'buyer', email: 'buyer@example.test' };
  const otherUser = { id: 11, username: 'other', email: 'other@example.test' };
  const User = { async findByPk(id) { return [user, otherUser].find((entry) => entry.id === Number(id)) || null; } };
  const Auction = {
    async findByPk(id) {
      if (id !== 5) return null;
      return {
        id: 5, sellerId: 3, status, version: 4, title: 'Headphones', description: 'Seller supplied product details.',
        condition: 'used_good', category: 'audio',
        productFacts: { specifications: null, defects: null, accessories: [], warranty: null },
      };
    },
  };
  const AIInteraction = {
    async create(values) {
      const record = { id: records.length + 1, ...values, createdAt: new Date(), updatedAt: new Date(), async update(changes) { Object.assign(this, changes); } };
      records.push(record);
      return record;
    },
    async findAndCountAll(options) {
      const branches = options.where[Op.or];
      const matched = records.filter((record) => Number(record.auctionId) === Number(options.where.auctionId) && branches.some((branch) =>
        Object.entries(branch).every(([key, value]) => Number.isInteger(value) ? Number(record[key]) === value : record[key] === value)));
      matched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id);
      return { count: matched.length, rows: matched.slice(options.offset, options.offset + options.limit) };
    },
  };
  const dependencies = {
    User, Auction, AIInteraction,
    Bid: { async findOne() { return null; } },
    sequelize: { async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); } },
    env: { JWT_SECRET: secret },
    provider: provider || { async answerQuestion() { return { answer: 'Informasi belum tersedia.', missingInformation: ['spesifikasi'] }; } },
  };
  const app = express();
  app.use(express.json());
  app.use('/auctions', createAuctionRoutes(dependencies));
  app.use(notFound);
  app.use(errorHandler);
  const token = jwt.sign({ sub: String(user.id) }, secret, { expiresIn: '1h' });
  const otherToken = jwt.sign({ sub: String(otherUser.id) }, secret, { expiresIn: '1h' });
  return { app, token, otherToken, provider: dependencies.provider, records };
}

describe('AI Product Q&A endpoints', () => {
  test('requires authentication and returns a processed Q&A interaction with HTTP 202', async () => {
    const { app, token } = setup();
    await request(app).post('/auctions/5/ai/questions').send({ question: 'Is the warranty included?' }).expect(401);
    const result = await request(app)
      .post('/auctions/5/ai/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Is the warranty included?' })
      .expect(202);
    expect(result.body).toMatchObject({
      message: 'AI interaction processed.',
      data: { interaction: { auctionId: 5, userId: 10, kind: 'question', status: 'completed', answer: 'Informasi belum tersedia.', sourceVersion: 4 } },
    });
  });

  test.each([
    ['/auctions/no/ai/questions', { question: 'Valid question?' }],
    ['/auctions/5/ai/questions', { question: 'ab' }],
    ['/auctions/5/ai/questions', { question: 'Valid question?', userId: 2 }],
    ['/auctions/5/ai/questions', { question: 'x'.repeat(501) }],
  ])('rejects invalid mutation request %s', async (path, body) => {
    const { app, token } = setup();
    const result = await request(app).post(path).set('Authorization', `Bearer ${token}`).send(body).expect(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_ERROR', fields: expect.any(Object), details: expect.any(Object) });
  });

  test('returns NOT_FOUND and does not call the provider for an unknown auction', async () => {
    const provider = { answerQuestion: jest.fn() };
    const { app, token } = setup({ provider });
    const result = await request(app)
      .post('/auctions/99/ai/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Valid question?' })
      .expect(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    expect(provider.answerQuestion).not.toHaveBeenCalled();
  });

  test('returns the documented 429 envelope and skips the second provider request', async () => {
    const provider = { answerQuestion: jest.fn(async () => ({ answer: 'Seller has not provided that detail.', missingInformation: ['warranty'] })) };
    const { app, token } = setup({ provider });
    const send = () => request(app).post('/auctions/5/ai/questions')
      .set('Authorization', `Bearer ${token}`).send({ question: 'Is there a warranty?' });
    await send().expect(202);
    const result = await send().expect(429);
    expect(result.body.error).toMatchObject({ code: 'RATE_LIMITED', fields: {}, details: { retryAfterSeconds: 10 } });
    expect(provider.answerQuestion).toHaveBeenCalledTimes(1);
  });

  test('returns only the authenticated owner’s private Q&A and public commentary with pagination metadata', async () => {
    const { app, token } = setup();
    const result = await request(app)
      .get('/auctions/5/ai/interactions?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(result.body).toMatchObject({
      message: 'AI interactions retrieved successfully.',
      data: [],
      meta: { page: 1, limit: 5, total: 0, totalPages: 0 },
    });
  });

  test('another user cannot retrieve private questions or answers through history or an interaction URL', async () => {
    const { app, token, otherToken, records } = setup();
    const created = await request(app).post('/auctions/5/ai/questions').set('Authorization', `Bearer ${token}`).send({ question: 'Is there a warranty?' }).expect(202);
    const interactionId = created.body.data.interaction.id;
    expect(records[0]).toMatchObject({ userId: 10, visibility: 'private', kind: 'question' });
    records.push({ id: 99, auctionId: 5, userId: 11, kind: 'question', visibility: 'private', question: 'Other question', answer: 'Other answer', status: 'completed', sourceVersion: 4, snapshotAt: new Date('2026-10-14T00:00:00Z'), createdAt: new Date('2026-10-14T00:00:03Z'), updatedAt: new Date('2026-10-14T00:00:03Z') });
    const ownerHistory = await request(app).get('/auctions/5/ai/interactions?page=1&limit=1').set('Authorization', `Bearer ${token}`).expect(200);
    expect(ownerHistory.body.data.map(({ id }) => id)).toContain(interactionId);
    const otherHistory = await request(app).get('/auctions/5/ai/interactions').set('Authorization', `Bearer ${otherToken}`).expect(200);
    expect(otherHistory.body.data.map(({ id }) => id)).toEqual([99]);
    const ownerSecondPage = await request(app).get('/auctions/5/ai/interactions?page=2&limit=1').set('Authorization', `Bearer ${token}`).expect(200);
    expect(ownerSecondPage.body.data).toEqual([]);
    await request(app).get(`/auctions/5/ai/interactions/${interactionId}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app).get('/auctions/5/ai/interactions?userId=10').set('Authorization', `Bearer ${otherToken}`).expect(400);
  });

  test('rejects history query parameters outside the documented pagination contract', async () => {
    const { app, token } = setup();
    const result = await request(app).get('/auctions/5/ai/interactions?userId=10').set('Authorization', `Bearer ${token}`).expect(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
});
