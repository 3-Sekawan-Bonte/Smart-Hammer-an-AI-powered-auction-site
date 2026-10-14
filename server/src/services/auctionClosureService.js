const HttpError = require('../utils/httpError');

function createAuctionClosureService({ Auction, Bid, sequelize, clock = () => new Date() }) {
  async function close(auctionId) {
    return sequelize.transaction(async (transaction) => {
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
      const hasBids = Boolean(lastBid);
      const winnerId = hasBids ? auction.highestBidderId : null;
      await auction.update({
        status: 'ended',
        winnerId,
        version: auction.version + 1,
      }, { transaction });

      return { closed: true, auction, finalPrice: hasBids ? auction.currentPrice : null };
    });
  }

  return { close };
}

function finalPriceFor(auction) {
  return auction.status === 'ended' && auction.highestBidderId !== null ? auction.currentPrice : null;
}

module.exports = { createAuctionClosureService, finalPriceFor };
