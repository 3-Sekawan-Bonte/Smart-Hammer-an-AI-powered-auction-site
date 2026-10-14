const { validateBidInput, validateAuctionId } = require('../utils/bidValidation');
const { createBidService } = require('../services/bidService');
const { auctionToJSON } = require('../utils/auctionSerializer');

function createBidController(dependencies) {
  const service = createBidService(dependencies);
  return {
    create: async (req, res) => {
      const result = await service.place(req.user.id, validateAuctionId(req.params.id), validateBidInput(req.body));
      return res.status(result.replayed ? 200 : 201).json({
        message: result.replayed ? 'Original bid result returned.' : 'Bid accepted successfully.',
        data: { auction: auctionToJSON(result.auction), bid: result.bid,
          clientRequestId: result.clientRequestId, replayed: result.replayed },
      });
    },
    list: async (req, res) => {
      const result = await service.list(req.user.id, validateAuctionId(req.params.id), req.query);
      return res.json({ message: 'Bids retrieved successfully.', data: result.rows, meta: result.meta });
    },
  };
}

module.exports = { createBidController };
