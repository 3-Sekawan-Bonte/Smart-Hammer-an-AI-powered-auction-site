const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createAuctionRoutes } = require('../src/routes/auctionRoutes');
const { createPaymentNotificationRoutes } = require('../src/routes/paymentNotificationRoutes');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');

const secret = 'payment-routes-test-secret';

function setup() {
  const winner = { id: 2, username: 'winner', email: 'winner@example.test' };
  const other = { id: 3, username: 'other', email: 'other@example.test' };
  const auction = { id: 50, sellerId: 1, status: 'ended', winnerId: 2, highestBidderId: 2, currentPrice: 275000, title: 'Camera' };
  const payments = [];
  const Payment = {
    async create(values) { const item = { id: payments.length + 1, ...values, createdAt: new Date(), updatedAt: new Date(), async update(changes) { Object.assign(this, changes); } }; payments.push(item); return item; },
    async findOne({ where }) { return payments.find((item) => Object.entries(where).every(([key, value]) => item[key] === value)) || null; },
    async findByPk(id) { return payments.find((item) => item.id === id) || null; },
    async update(changes, { where }) { const item = payments.find((entry) => entry.id === where.id && entry.status === where.status); if (item) Object.assign(item, changes); },
  };
  const User = { async findByPk(id) { return [winner, other].find((item) => item.id === Number(id)) || null; } };
  const gateway = {
    clientKey: 'SB-Mid-client-public-test-key',
    createTransaction: jest.fn(async () => ({ token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/token' })),
    getStatus: jest.fn(async (orderId) => ({ order_id: orderId, status_code: '201', gross_amount: '275000.00', currency: 'IDR', transaction_status: 'pending', payment_type: 'echannel', transaction_id: 'trx-1' })),
  };
  const dependencies = {
    User,
    Auction: { async findByPk(id) { return Number(id) === auction.id ? auction : null; } },
    Bid: { async findOne({ where }) { return Number(where.auctionId) === auction.id && Number(where.userId) === 2 ? { amount: 275000 } : null; } },
    Payment,
    sequelize: { async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); } },
    gateway,
    env: { JWT_SECRET: secret, MIDTRANS_SERVER_KEY: 'sandbox-key', MIDTRANS_CLIENT_KEY: gateway.clientKey, MIDTRANS_IS_PRODUCTION: 'false', MIDTRANS_PAYMENT_EXPIRY_HOURS: '24' },
    logger: { error() {} },
  };
  const app = express();
  app.use(express.json());
  app.use('/auctions', createAuctionRoutes(dependencies));
  app.use('/payments', createPaymentNotificationRoutes(dependencies));
  app.use(notFound);
  app.use(errorHandler);
  const tokenFor = (user) => jwt.sign({ sub: String(user.id) }, secret, { expiresIn: '5m' });
  return { app, dependencies, gateway, payments, winnerToken: tokenFor(winner), otherToken: tokenFor(other) };
}

function sign(body, key) {
  return crypto.createHash('sha512').update(`${body.order_id}${body.status_code}${body.gross_amount}${key}`).digest('hex');
}

describe('payment REST endpoints', () => {
  test('requires authentication and limits initiation/status to the verified auction winner', async () => {
    const { app, winnerToken, otherToken } = setup();
    await request(app).post('/auctions/50/payments').expect(401);
    await request(app).post('/auctions/50/payments').set('Authorization', `Bearer ${otherToken}`).expect(404);
    const created = await request(app).post('/auctions/50/payments').set('Authorization', `Bearer ${winnerToken}`).expect(201);
    expect(created.body.data.payment).toMatchObject({ auctionId: 50, amount: 275000, status: 'pending', currency: 'IDR' });
    await request(app).get('/auctions/50/payments').set('Authorization', `Bearer ${otherToken}`).expect(404);
    const refreshed = await request(app).get('/auctions/50/payments').set('Authorization', `Bearer ${winnerToken}`).expect(200);
    expect(refreshed.body.data.payment.snapToken).toBe('snap-token');
    expect(refreshed.body.data.clientKey).toBe('SB-Mid-client-public-test-key');
  });

  test('rejects client-supplied payment fields instead of accepting a client amount', async () => {
    const { app, winnerToken, gateway } = setup();
    const response = await request(app).post('/auctions/50/payments')
      .set('Authorization', `Bearer ${winnerToken}`).send({ amount: 1 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(gateway.createTransaction).not.toHaveBeenCalled();
  });

  test('accepts the webhook without a user JWT only after signature and status verification', async () => {
    const { app, winnerToken, dependencies, gateway, payments } = setup();
    await request(app).post('/auctions/50/payments').set('Authorization', `Bearer ${winnerToken}`).expect(201);
    const notification = { order_id: payments[0].orderId, status_code: '200', gross_amount: '275000.00', currency: 'IDR' };
    notification.signature_key = sign(notification, dependencies.env.MIDTRANS_SERVER_KEY);
    gateway.getStatus = async (orderId) => ({ order_id: orderId, status_code: '200', gross_amount: '275000.00', currency: 'IDR', transaction_status: 'settlement', payment_type: 'echannel', transaction_id: 'trx-verified' });
    const response = await request(app).post('/payments/midtrans/notifications').send(notification).expect(200);
    expect(response.body.data.accepted).toBe(true);
    expect(payments[0].status).toBe('paid');
  });

  test('does not accept unsigned client claims of successful payment', async () => {
    const { app, gateway } = setup();
    const response = await request(app).post('/payments/midtrans/notifications').send({ order_id: 'fake', transaction_status: 'settlement' }).expect(401);
    expect(response.body.error.code).toBe('MIDTRANS_SIGNATURE_INVALID');
    expect(gateway.getStatus).not.toHaveBeenCalled();
  });
});
