const crypto = require('node:crypto');
const HttpError = require('../src/utils/httpError');
const { createPaymentService } = require('../src/services/paymentService');

function createHarness() {
  const env = {
    MIDTRANS_SERVER_KEY: 'sandbox-server-key-for-tests',
    MIDTRANS_CLIENT_KEY: 'SB-Mid-client-key-for-tests',
    MIDTRANS_IS_PRODUCTION: 'false',
    MIDTRANS_PAYMENT_EXPIRY_HOURS: '24',
  };
  const users = [
    { id: 1, username: 'seller', email: 'seller@example.test' },
    { id: 2, username: 'winner', email: 'winner@example.test' },
    { id: 3, username: 'loser', email: 'loser@example.test' },
  ];
  const auction = { id: 50, sellerId: 1, status: 'ended', winnerId: 2, highestBidderId: 2, currentPrice: 275000, title: 'Camera' };
  const bids = [{ id: 91, auctionId: 50, userId: 2, amount: 275000, createdAt: new Date('2026-10-15T00:00:00Z') }];
  const payments = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = { async transaction(callback) { return callback(transaction); } };
  const Payment = {
    async create(values) {
      const payment = { id: payments.length + 1, ...values, createdAt: new Date(), updatedAt: new Date(), async update(changes) { Object.assign(this, changes); this.updatedAt = new Date(); } };
      payments.push(payment);
      return payment;
    },
    async findOne({ where }) {
      return payments.filter((item) => Object.entries(where).every(([key, value]) => item[key] === value))
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)[0] || null;
    },
    async findByPk(id) { return payments.find((item) => item.id === id) || null; },
    async update(changes, { where }) {
      for (const item of payments) if (item.id === where.id && (!where.status || item.status === where.status)) Object.assign(item, changes);
    },
  };
  const Auction = { async findByPk(id) { return id === auction.id ? auction : null; } };
  const Bid = { async findOne({ where }) { return bids.filter((item) => item.auctionId === where.auctionId && item.userId === where.userId).at(-1) || null; } };
  const User = { async findByPk(id) { return users.find((user) => user.id === id) || null; } };
  const gateway = {
    clientKey: env.MIDTRANS_CLIENT_KEY,
    createTransaction: jest.fn(async () => ({ token: 'sandbox-snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/token' })),
    getStatus: jest.fn(async () => ({ order_id: payments[0]?.orderId, status_code: '201', gross_amount: '275000.00', currency: 'IDR', transaction_status: 'pending', payment_type: 'bank_transfer', va_numbers: [{ bank: 'bca', va_number: '1234567890' }], transaction_id: 'midtrans-trx-1' })),
  };
  const service = createPaymentService({ Auction, Bid, Payment, User, sequelize, gateway, env, logger: { error: jest.fn() }, orderIdFactory: () => `SH-50-test-${payments.length + 1}` });
  return { service, env, auction, payments, gateway };
}

function signedNotification(orderId, amount, serverKey, overrides = {}) {
  const body = { order_id: orderId, status_code: '200', gross_amount: `${amount}.00`, currency: 'IDR', transaction_status: 'settlement', ...overrides };
  body.signature_key = crypto.createHash('sha512').update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`).digest('hex');
  return body;
}

describe('sandbox payment service', () => {
  test('uses the persisted winning bid amount and exactly the two allowed payment methods', async () => {
    const { service, gateway, payments } = createHarness();
    const result = await service.begin(2, 50);
    expect(result.created).toBe(true);
    expect(result.payment.amount).toBe(275000);
    expect(result.payment.currency).toBe('IDR');
    expect(result.payment.orderId).toBe('SH-50-test-1');
    expect(result.clientKey).toBe('SB-Mid-client-key-for-tests');
    expect(result.payment).not.toHaveProperty('serverKey');
    expect(gateway.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      transaction_details: { order_id: 'SH-50-test-1', gross_amount: 275000, currency: 'IDR' },
      enabled_payments: ['bca_va', 'echannel'],
    }));
    expect(payments[0].status).toBe('pending');
  });

  test.each([1, 3])('rejects non-winner user %i without contacting Midtrans', async (userId) => {
    const { service, gateway } = createHarness();
    await expect(service.begin(userId, 50)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(gateway.createTransaction).not.toHaveBeenCalled();
  });

  test('reuses a pending checkout on retries rather than creating another Snap transaction', async () => {
    const { service, gateway, payments } = createHarness();
    const first = await service.begin(2, 50);
    const retry = await service.begin(2, 50);
    expect(first.payment.id).toBe(retry.payment.id);
    expect(payments).toHaveLength(1);
    expect(gateway.createTransaction).toHaveBeenCalledTimes(1);
  });

  test('fails the local attempt safely when the Sandbox provider cannot create a checkout', async () => {
    const { service, gateway, payments } = createHarness();
    gateway.createTransaction.mockRejectedValueOnce(new Error('private provider response'));
    await expect(service.begin(2, 50)).rejects.toMatchObject({ status: 503, code: 'PAYMENT_UNAVAILABLE' });
    expect(payments[0].status).toBe('failed');
    expect(payments[0].midtransStatus).toBe('creation_failed');
  });

  test('permits a new order after the prior Sandbox attempt is verified expired', async () => {
    const { service, gateway, payments } = createHarness();
    const first = await service.begin(2, 50);
    gateway.getStatus.mockResolvedValueOnce({
      order_id: first.payment.orderId, status_code: '407', gross_amount: '275000.00', currency: 'IDR',
      transaction_status: 'expire', payment_type: 'bank_transfer', va_numbers: [{ bank: 'bca' }],
    });
    await service.status(2, 50);
    expect(payments[0].status).toBe('expired');

    const retry = await service.begin(2, 50);
    expect(retry.created).toBe(true);
    expect(retry.payment.orderId).not.toBe(first.payment.orderId);
    expect(payments).toHaveLength(2);
  });

  test('reuses an already paid payment instead of creating another successful attempt', async () => {
    const { service, env, gateway, payments } = createHarness();
    const first = await service.begin(2, 50);
    gateway.getStatus.mockResolvedValueOnce({
      order_id: first.payment.orderId, status_code: '200', gross_amount: '275000.00', currency: 'IDR',
      transaction_status: 'settlement', payment_type: 'echannel', transaction_id: 'mandiri-trx-1',
    });
    await service.handleNotification(signedNotification(first.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY));

    const retry = await service.begin(2, 50);
    expect(retry.created).toBe(false);
    expect(retry.payment.status).toBe('paid');
    expect(payments).toHaveLength(1);
    expect(gateway.createTransaction).toHaveBeenCalledTimes(1);
  });

  test('fails closed unless explicitly configured for Sandbox', async () => {
    const { service, env, gateway } = createHarness();
    env.MIDTRANS_IS_PRODUCTION = 'true';
    await expect(service.begin(2, 50)).rejects.toMatchObject({ status: 503, code: 'PAYMENT_CONFIGURATION_ERROR' });
    expect(gateway.createTransaction).not.toHaveBeenCalled();
  });

  test('requires signed notification, matching amount and IDR status, and verified settlement before marking paid', async () => {
    const { service, env, gateway, payments } = createHarness();
    const created = await service.begin(2, 50);
    const invalid = signedNotification(created.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY);
    invalid.signature_key = '0'.repeat(128);
    await expect(service.handleNotification(invalid)).rejects.toMatchObject({ code: 'MIDTRANS_SIGNATURE_INVALID' });
    expect(gateway.getStatus).not.toHaveBeenCalled();

    const mismatched = signedNotification(created.payment.orderId, 275001, env.MIDTRANS_SERVER_KEY);
    await expect(service.handleNotification(mismatched)).rejects.toMatchObject({ code: 'PAYMENT_NOTIFICATION_MISMATCH' });

    gateway.getStatus.mockResolvedValueOnce({
      order_id: created.payment.orderId, status_code: '200', gross_amount: '275000.00', currency: 'IDR',
      transaction_status: 'settlement', payment_type: 'bank_transfer', va_numbers: [{ bank: 'bca' }], transaction_id: 'midtrans-trx-1',
    });
    await service.handleNotification(signedNotification(created.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY));
    expect(payments[0]).toMatchObject({ status: 'paid', midtransStatus: 'settlement', paymentMethod: 'bca_va', transactionId: 'midtrans-trx-1' });
  });

  test('does not downgrade paid state on a repeated stale pending notification', async () => {
    const { service, env, gateway, payments } = createHarness();
    const created = await service.begin(2, 50);
    gateway.getStatus.mockResolvedValueOnce({
      order_id: created.payment.orderId, status_code: '200', gross_amount: '275000.00', currency: 'IDR',
      transaction_status: 'settlement', payment_type: 'echannel', transaction_id: 'midtrans-trx-2',
    });
    await service.handleNotification(signedNotification(created.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY));
    const stale = signedNotification(created.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY, { status_code: '201', transaction_status: 'pending' });
    await service.handleNotification(stale);
    expect(payments[0].status).toBe('paid');
    expect(gateway.getStatus).toHaveBeenCalledTimes(1);
  });

  test('rejects a settlement with a mismatched currency or non-success status code', async () => {
    const { service, env, gateway, payments } = createHarness();
    const created = await service.begin(2, 50);
    gateway.getStatus.mockResolvedValueOnce({
      order_id: created.payment.orderId, status_code: '201', gross_amount: '275000.00', currency: 'USD',
      transaction_status: 'settlement', payment_type: 'echannel', transaction_id: 'bad-trx',
    });
    await expect(service.handleNotification(signedNotification(created.payment.orderId, 275000, env.MIDTRANS_SERVER_KEY)))
      .rejects.toMatchObject({ code: 'PAYMENT_STATUS_MISMATCH' });
    expect(payments[0].status).toBe('pending');
  });
});
