const crypto = require('node:crypto');
const HttpError = require('../utils/httpError');
const { createMidtransGateway } = require('./midtransGateway');

const TERMINAL_STATUSES = new Set(['paid', 'failed', 'expired', 'canceled']);
const PAYMENT_METHODS = new Set(['bca_va', 'echannel']);

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Payment or auction was not found.');
}

function amountMatches(value, amount) {
  if (!(typeof value === 'string' || typeof value === 'number')) return false;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false;
  return Number(text) === amount;
}

function normalizeMethod(status) {
  if (status.payment_type === 'echannel') return 'echannel';
  if (status.payment_type === 'bank_transfer' && Array.isArray(status.va_numbers)
    && status.va_numbers.some((entry) => entry?.bank === 'bca')) return 'bca_va';
  return null;
}

function mapMidtransStatus(status) {
  switch (String(status).toLowerCase()) {
    case 'settlement': return 'paid';
    case 'pending': return 'pending';
    case 'expire': return 'expired';
    case 'cancel': return 'canceled';
    case 'deny': return 'failed';
    default: return null;
  }
}

function paymentToJSON(payment, { includeCheckout = false } = {}) {
  if (!payment) return null;
  const value = typeof payment.toJSON === 'function' ? payment.toJSON() : payment;
  return {
    id: value.id,
    auctionId: value.auctionId,
    orderId: value.orderId,
    amount: value.amount,
    currency: value.currency,
    paymentMethod: value.paymentMethod ?? null,
    transactionId: value.transactionId ?? null,
    status: value.status,
    midtransStatus: value.midtransStatus ?? null,
    expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
    createdAt: value.createdAt ? new Date(value.createdAt).toISOString() : null,
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : null,
    ...(includeCheckout && value.status === 'pending' ? {
      snapToken: value.snapToken ?? null,
      redirectUrl: value.redirectUrl ?? null,
    } : {}),
  };
}

function createPaymentService({
  Auction, Bid, Payment, User, sequelize, env = process.env,
  gateway = createMidtransGateway({ env }),
  clock = () => new Date(),
  orderIdFactory = (auctionId) => `SH-${auctionId}-${crypto.randomUUID()}`,
  logger = console,
}) {
  const expiryHours = Number(env.MIDTRANS_PAYMENT_EXPIRY_HOURS || 24);

  function safeLog(code) {
    try { logger.error(`Sandbox payment operation failed (${code}).`); } catch (_error) { /* Logging must not affect payment state. */ }
  }

  function assertSandboxConfiguration() {
    if (env.MIDTRANS_IS_PRODUCTION !== 'false') {
      throw new HttpError(503, 'PAYMENT_CONFIGURATION_ERROR', 'Sandbox payments are not configured.');
    }
    if (!Number.isInteger(expiryHours) || expiryHours < 1 || expiryHours > 72) {
      throw new HttpError(503, 'PAYMENT_CONFIGURATION_ERROR', 'Sandbox payments are not configured.');
    }
  }

  async function assertWinner(auctionId, userId, transaction) {
    const auction = await Auction.findByPk(auctionId, {
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
    if (!auction || auction.status !== 'ended' || !auction.winnerId || auction.winnerId !== userId
      || auction.highestBidderId !== userId || auction.sellerId === userId) throw notFound();

    const winningBid = await Bid.findOne({
      where: { auctionId, userId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      transaction,
    });
    if (!winningBid || winningBid.amount !== auction.currentPrice || auction.currentPrice < 1) throw notFound();
    return { auction, winningBid };
  }

  async function getPaymentForWinner(auctionId, userId) {
    await assertWinner(auctionId, userId);
    return Payment.findOne({ where: { auctionId, userId }, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
  }

  function verifyStatus(status, payment) {
    if (!status || status.order_id !== payment.orderId
      || !amountMatches(status.gross_amount, payment.amount)
      || status.currency !== payment.currency) {
      throw new HttpError(400, 'PAYMENT_STATUS_MISMATCH', 'Midtrans payment details did not match the stored order.');
    }
    const paymentMethod = normalizeMethod(status);
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      throw new HttpError(400, 'PAYMENT_METHOD_INVALID', 'The reported payment method is not enabled for this order.');
    }
    const midtransStatus = String(status.transaction_status || '').toLowerCase();
    const internalStatus = mapMidtransStatus(midtransStatus);
    if (!internalStatus) throw new HttpError(400, 'PAYMENT_STATUS_INVALID', 'Midtrans returned an unsupported payment status.');
    if (internalStatus === 'paid'
      && (String(status.status_code) !== '200' || (status.fraud_status && String(status.fraud_status).toLowerCase() !== 'accept'))) {
      throw new HttpError(400, 'PAYMENT_STATUS_INVALID', 'Midtrans has not confirmed a successful settlement.');
    }
    return { internalStatus, midtransStatus, paymentMethod, transactionId: status.transaction_id || null };
  }

  async function persistVerifiedStatus(paymentId, status) {
    return sequelize.transaction(async (transaction) => {
      const payment = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!payment) throw notFound();
      const verified = verifyStatus(status, payment);
      if (payment.status === 'paid') return payment;
      if (TERMINAL_STATUSES.has(payment.status) && verified.internalStatus !== 'paid') return payment;
      await payment.update({
        status: verified.internalStatus,
        midtransStatus: verified.midtransStatus,
        paymentMethod: verified.paymentMethod,
        transactionId: verified.transactionId,
      }, { transaction });
      return payment;
    });
  }

  async function refreshStatus(payment) {
    if (!payment || payment.status !== 'pending') return payment;
    try {
      const status = await gateway.getStatus(payment.orderId);
      return await persistVerifiedStatus(payment.id, status);
    } catch (_error) {
      safeLog('STATUS_REFRESH_FAILED');
      return payment;
    }
  }

  async function status(userId, auctionId) {
    const payment = await getPaymentForWinner(auctionId, userId);
    const current = await refreshStatus(payment);
    const clientKey = current && current.status === 'pending' ? gateway.clientKey : null;
    return { payment: paymentToJSON(current, { includeCheckout: true }), clientKey };
  }

  function formatMidtransTime(value) {
    const local = new Date(value.getTime() + (7 * 60 * 60 * 1000));
    return `${local.toISOString().slice(0, 19).replace('T', ' ')} +0700`;
  }

  async function begin(userId, auctionId) {
    assertSandboxConfiguration();
    const decision = await sequelize.transaction(async (transaction) => {
      const { auction } = await assertWinner(auctionId, userId, transaction);
      const latest = await Payment.findOne({
        where: { auctionId, userId },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (latest?.status === 'paid') return { payment: latest, existing: true };
      if (latest && ['creating', 'pending'].includes(latest.status)) {
        if (latest.status === 'pending' && latest.expiresAt && new Date(latest.expiresAt) <= clock()) {
          throw new HttpError(409, 'PAYMENT_STATUS_REFRESH_REQUIRED', 'Refresh the payment status before retrying.');
        }
        if (latest.status === 'pending' && latest.snapToken) return { payment: latest, existing: true };
        throw new HttpError(409, 'PAYMENT_PROCESSING', 'A payment attempt is already being prepared.');
      }

      const now = clock();
      const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
      const payment = await Payment.create({
        auctionId,
        userId,
        orderId: orderIdFactory(auctionId),
        amount: auction.currentPrice,
        currency: 'IDR',
        paymentMethod: null,
        transactionId: null,
        snapToken: null,
        redirectUrl: null,
        status: 'creating',
        midtransStatus: null,
        expiresAt,
      }, { transaction });
      const customer = await User.findByPk(userId, { attributes: ['id', 'username', 'email'], transaction });
      return { payment, auction, customer, existing: false, now };
    });

    if (decision.existing) {
      const clientKey = decision.payment.status === 'pending' ? gateway.clientKey : null;
      return { created: false, payment: paymentToJSON(decision.payment, { includeCheckout: true }), clientKey };
    }

    let transactionResult;
    try {
      transactionResult = await gateway.createTransaction({
        transaction_details: { order_id: decision.payment.orderId, gross_amount: decision.payment.amount, currency: 'IDR' },
        enabled_payments: ['bca_va', 'echannel'],
        customer_details: {
          first_name: String(decision.customer?.username || 'Smart Hammer').slice(0, 50),
          email: decision.customer?.email,
        },
        item_details: [{ id: `auction-${auctionId}`, price: decision.payment.amount, quantity: 1, name: String(decision.auction.title || 'Auction win').slice(0, 50) }],
        expiry: { start_time: formatMidtransTime(decision.now), unit: 'hour', duration: expiryHours },
      });
      if (typeof transactionResult?.token !== 'string' || !transactionResult.token
        || typeof transactionResult?.redirect_url !== 'string' || !transactionResult.redirect_url.startsWith('https://')) {
        throw new Error('Invalid Midtrans Snap response.');
      }
    } catch (_error) {
      safeLog('SNAP_TRANSACTION_FAILED');
      await Payment.update({ status: 'failed', midtransStatus: 'creation_failed' }, { where: { id: decision.payment.id, status: 'creating' } });
      throw new HttpError(503, 'PAYMENT_UNAVAILABLE', 'The Sandbox payment could not be started.');
    }

    const saved = await sequelize.transaction(async (transaction) => {
      const payment = await Payment.findByPk(decision.payment.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!payment) throw notFound();
      if (payment.status !== 'paid') {
        await payment.update({ status: 'pending', snapToken: transactionResult.token, redirectUrl: transactionResult.redirect_url }, { transaction });
      }
      return payment;
    });
    return { created: true, payment: paymentToJSON(saved, { includeCheckout: true }), clientKey: gateway.clientKey };
  }

  function verifyNotificationSignature(notification) {
    if (env.MIDTRANS_IS_PRODUCTION !== 'false' || !env.MIDTRANS_SERVER_KEY
      || !notification || typeof notification !== 'object' || Array.isArray(notification)
      || typeof notification.order_id !== 'string' || typeof notification.status_code !== 'string'
      || typeof notification.gross_amount !== 'string' || typeof notification.signature_key !== 'string'
      || !/^[a-f\d]{128}$/i.test(notification.signature_key)) return false;
    const expected = crypto.createHash('sha512')
      .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${env.MIDTRANS_SERVER_KEY}`)
      .digest();
    const supplied = Buffer.from(notification.signature_key, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }

  async function handleNotification(notification) {
    if (!verifyNotificationSignature(notification)) {
      throw new HttpError(401, 'MIDTRANS_SIGNATURE_INVALID', 'Payment notification signature is invalid.');
    }
    const payment = await Payment.findOne({ where: { orderId: notification.order_id } });
    if (!payment) throw notFound();
    if (!amountMatches(notification.gross_amount, payment.amount)
      || (notification.currency != null && notification.currency !== payment.currency)) {
      throw new HttpError(400, 'PAYMENT_NOTIFICATION_MISMATCH', 'Payment notification details did not match the stored order.');
    }
    if (payment.status === 'paid') return { accepted: true };
    let status;
    try {
      status = await gateway.getStatus(payment.orderId);
    } catch (_error) {
      safeLog('STATUS_VERIFICATION_FAILED');
      throw new HttpError(503, 'PAYMENT_VERIFICATION_UNAVAILABLE', 'Payment status could not be verified.');
    }
    await persistVerifiedStatus(payment.id, status);
    return { accepted: true };
  }

  return { begin, status, handleNotification, verifyNotificationSignature, paymentToJSON };
}

module.exports = {
  TERMINAL_STATUSES,
  amountMatches,
  normalizeMethod,
  mapMidtransStatus,
  paymentToJSON,
  createPaymentService,
};
