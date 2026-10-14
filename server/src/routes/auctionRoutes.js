const express = require('express');
const { createAuthenticate } = require('../middleware/authenticate');
const { createAuctionController } = require('../controllers/auctionController');
const { createBidController } = require('../controllers/bidController');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createAuctionRoutes(dependencies) {
  const router = express.Router();
  const authenticate = createAuthenticate(dependencies);
  const controller = createAuctionController(dependencies);
  const bidController = createBidController(dependencies);
  router.use(asyncRoute(authenticate));
  router.route('/')
    .post(asyncRoute(controller.create))
    .get(asyncRoute(controller.list));
  router.route('/:id')
    .get(asyncRoute(controller.get))
    .patch(asyncRoute(controller.update))
    .delete(asyncRoute(controller.remove));
  router.post('/:id/start', asyncRoute(controller.start));
  router.post('/:id/bids', asyncRoute(bidController.create));
  return router;
}

module.exports = { createAuctionRoutes };
