const { auctionToJSON } = require('../utils/auctionSerializer');

function createAuctionEventPublisher() {
  let io = null;
  return {
    attach(socketServer) {
      if (io && io !== socketServer) throw new Error('Auction event publisher already has a Socket.IO server.');
      io = socketServer;
    },
    publish(event, auction, eventData = {}) {
      if (!io || !auction) return;
      const state = auctionToJSON(auction);
      io.to(`auction:${state.id}`).emit(event, {
        auctionId: state.id,
        version: state.version,
        serverNow: new Date().toISOString(),
        data: { ...eventData, auction: state },
      });
    },
    publishAIInteraction(event, { auctionId, version, interaction, message }) {
      if (!io || !Number.isSafeInteger(auctionId) || !Number.isSafeInteger(version)) return;
      io.to(`auction:${auctionId}`).emit(event, {
        auctionId,
        version,
        serverNow: new Date().toISOString(),
        data: { interaction, ...(message ? { message } : {}) },
      });
    },
  };
}

module.exports = { createAuctionEventPublisher };
