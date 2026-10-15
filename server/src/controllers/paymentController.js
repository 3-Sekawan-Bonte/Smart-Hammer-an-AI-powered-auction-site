const { validateAuctionId, validateEmptyBody } = require('../utils/auctionValidation');
const { createPaymentService } = require('../services/paymentService');

function createPaymentController(dependencies) {
  const service = createPaymentService(dependencies);
  return {
    begin: async (req, res) => {
      validateEmptyBody(req.body);
      const result = await service.begin(req.user.id, validateAuctionId(req.params.id));
      return res.status(result.created ? 201 : 200).json({
        message: result.created ? 'Sandbox payment created.' : 'Payment status retrieved successfully.',
        data: { payment: result.payment, clientKey: result.clientKey },
      });
    },
    status: async (req, res) => {
      const result = await service.status(req.user.id, validateAuctionId(req.params.id));
      return res.json({ message: 'Payment status retrieved successfully.', data: result });
    },
    notification: async (req, res) => {
      const result = await service.handleNotification(req.body);
      return res.json({ message: 'Payment notification processed.', data: result });
    },
  };
}

module.exports = { createPaymentController };
