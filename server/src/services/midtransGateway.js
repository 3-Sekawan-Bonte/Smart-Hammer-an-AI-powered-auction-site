const HttpError = require('../utils/httpError');

function createMidtransGateway({ env = process.env, sdk } = {}) {
  let snap;

  function getSnap() {
    if (env.MIDTRANS_IS_PRODUCTION !== 'false') {
      throw new HttpError(503, 'PAYMENT_CONFIGURATION_ERROR', 'Sandbox payments are not configured.');
    }
    if (!env.MIDTRANS_SERVER_KEY || !env.MIDTRANS_CLIENT_KEY) {
      throw new HttpError(503, 'PAYMENT_CONFIGURATION_ERROR', 'Sandbox payments are not configured.');
    }
    if (!snap) {
      const midtrans = sdk || require('midtrans-client');
      snap = new midtrans.Snap({
        isProduction: false,
        serverKey: env.MIDTRANS_SERVER_KEY,
        clientKey: env.MIDTRANS_CLIENT_KEY,
      });
      const httpClient = snap.httpClient?.http_client;
      if (httpClient?.defaults) httpClient.defaults.timeout = 10_000;
    }
    return snap;
  }

  return {
    get clientKey() {
      getSnap();
      return env.MIDTRANS_CLIENT_KEY;
    },
    createTransaction(parameter) {
      return getSnap().createTransaction(parameter);
    },
    getStatus(orderId) {
      return getSnap().transaction.status(orderId);
    },
  };
}

module.exports = { createMidtransGateway };
