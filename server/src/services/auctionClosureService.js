const HttpError = require('../utils/httpError');

function createAuctionClosureService({ Auction, Bid, User, sequelize, clock = () => new Date(), eventPublisher }) {
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
      return { closed: true, auction: updatedAuction, finalPrice: hasBids ? auction.currentPrice : null };
    });
    if (result.closed) eventPublisher?.publish('auction:ended', result.auction, {
      winner: result.auction.winner ? { id: result.auction.winner.id, username: result.auction.winner.username } : null,
      finalPrice: result.finalPrice,
    });
    return result;
  }

  return { close };
}

function finalPriceFor(auction) {
  return auction.status === 'ended' && auction.highestBidderId !== null ? auction.currentPrice : null;
}

module.exports = { createAuctionClosureService, finalPriceFor };
