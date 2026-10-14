const { validateBidInput, validateAuctionId } = require('../utils/bidValidation');
const { createBidService } = require('../services/bidService');

function createBidController(dependencies) {
  const service = createBidService(dependencies);
  return {
    create: async (req, res) => {
      const result = await service.place(req.user.id, validateAuctionId(req.params.id), validateBidInput(req.body));
      return res.status(result.replayed ? 200 : 201).json({
        message: result.replayed ? 'Original bid result returned.' : 'Bid accepted successfully.',
        data: { bid: result.bid },
      });
    },
  };
}

module.exports = { createBidController };
