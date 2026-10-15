const express = require('express');
const { createPaymentController } = require('../controllers/paymentController');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createPaymentNotificationRoutes(dependencies) {
  const router = express.Router();
  const controller = createPaymentController(dependencies);
  router.post('/midtrans/notifications', asyncRoute(controller.notification));
  return router;
}

module.exports = { createPaymentNotificationRoutes };
