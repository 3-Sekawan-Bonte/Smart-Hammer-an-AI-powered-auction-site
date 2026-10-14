const { validateAuctionInput, validateAuctionId, validateEmptyBody } = require('../utils/auctionValidation');
const { auctionToJSON } = require('../utils/auctionSerializer');
const { createAuctionService } = require('../services/auctionService');

function createAuctionController(dependencies) {
  const service = createAuctionService(dependencies);
  return {
    create: async (req, res) => {
      const auction = await service.create(req.user.id, validateAuctionInput(req.body));
      return res.status(201).json({ message: 'Auction draft created successfully.', data: { auction: auctionToJSON(auction) } });
    },
    list: async (req, res) => {
      const { rows, meta } = await service.list(req.user.id, req.query);
      return res.json({ message: 'Auctions retrieved successfully.', data: rows.map(auctionToJSON), meta });
    },
    get: async (req, res) => {
      const auction = await service.getById(validateAuctionId(req.params.id), req.user.id);
      return res.json({
        message: 'Auction retrieved successfully.',
        data: { auction: auctionToJSON(auction), serverNow: new Date().toISOString() },
      });
    },
    update: async (req, res) => {
      const auction = await service.update(validateAuctionId(req.params.id), req.user.id, validateAuctionInput(req.body, { partial: true }));
      return res.json({ message: 'Auction draft updated successfully.', data: { auction: auctionToJSON(auction) } });
    },
    remove: async (req, res) => {
      const result = await service.remove(validateAuctionId(req.params.id), req.user.id);
      return res.json({ message: 'Auction draft deleted successfully.', data: result });
    },
    start: async (req, res) => {
      validateEmptyBody(req.body);
      const auction = await service.start(validateAuctionId(req.params.id), req.user.id);
      return res.json({ message: 'Auction started successfully.', data: { auction: auctionToJSON(auction) } });
    },
  };
}

module.exports = { createAuctionController };
