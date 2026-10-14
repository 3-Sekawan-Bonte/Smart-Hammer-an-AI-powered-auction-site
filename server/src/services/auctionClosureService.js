const HttpError = require('../utils/httpError');

function createAuctionClosureService({ Auction, Bid, User, sequelize, clock = () => new Date(), eventPublisher, auctioneer }) {
  const auctionIncludes = User ? [
    { model: User, as: 'seller', attributes: ['id', 'username'], required: false },
    { model: User, as: 'highestBidder', attributes: ['id', 'username'], required: false },
    { model: User, as: 'winner', attributes: ['id', 'username'], required: false },
  ] : [];
  async function close(auctionId) {
    const result = await sequelize.transaction(async (transaction) => {
      const auction = await Auction.findByPk(auctionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!auction) throw new HttpError(404, 'NOT_FOUND', 'Auction was not found.');

      if (auction.status !== 'live' || !auction.endsAt || new Date(auction.endsAt).getTime() > clock().getTime()) {
        return { closed: false, auction, finalPrice: finalPriceFor(auction) };
      }

      const lastBid = await Bid.findOne({
        where: { auctionId },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        transaction,
      });
      const bidCount = typeof Bid.count === 'function'
        ? await Bid.count({ where: { auctionId }, transaction })
        : (lastBid ? 1 : 0);
      const hasBids = Boolean(lastBid);
      const winnerId = hasBids ? auction.highestBidderId : null;
      await auction.update({
        status: 'ended',
        winnerId,
        version: auction.version + 1,
      }, { transaction });
      const updatedAuction = User
        ? await Auction.findByPk(auctionId, { transaction, include: auctionIncludes })
        : auction;
      if (typeof updatedAuction.setDataValue === 'function') updatedAuction.setDataValue('bidCount', bidCount);
      else updatedAuction.bidCount = bidCount;
      return { closed: true, auction: updatedAuction, finalPrice: hasBids ? auction.currentPrice : null, bidCount };
    });
    if (result.closed) {
      try {
        eventPublisher?.publish('auction:ended', result.auction, {
          winner: result.auction.winner ? { id: result.auction.winner.id, username: result.auction.winner.username } : null,
          finalPrice: result.finalPrice,
          bidCount: result.bidCount,
        });
      } catch (_error) { /* Socket delivery cannot undo committed closure. */ }
      try { auctioneer?.trigger({ auction: result.auction, trigger: 'end', triggerData: { bidCount: result.bidCount } }); } catch (_error) { /* Commentary never changes closure success. */ }
    }
    return result;
  }

  return { close };
}

function finalPriceFor(auction) {
  return auction.status === 'ended' && auction.highestBidderId !== null ? auction.currentPrice : null;
}

module.exports = { createAuctionClosureService, finalPriceFor };
