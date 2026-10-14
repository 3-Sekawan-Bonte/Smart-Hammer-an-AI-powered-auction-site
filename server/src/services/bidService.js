const HttpError = require('../utils/httpError');

const MAX_BID = 2_000_000_000;

function serializeBid(bid) {
  const value = typeof bid.toJSON === 'function' ? bid.toJSON() : bid;
  return {
    id: value.id,
    auctionId: value.auctionId,
    userId: value.userId,
    amount: value.amount,
    clientRequestId: value.clientRequestId,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Auction was not found.');
}

function idempotencyConflict() {
  return new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This clientRequestId was already used with a different bid.');
}

function isUniqueViolation(error) {
  return error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === '23505';
}

function createBidService({ Auction, Bid, sequelize }) {
  async function findExisting(userId, clientRequestId, transaction) {
    return Bid.findOne({ where: { userId, clientRequestId }, transaction });
  }

  function verifyReplay(existing, auctionId, amount) {
    if (existing.auctionId !== auctionId || existing.amount !== amount) throw idempotencyConflict();
    return { bid: serializeBid(existing), replayed: true };
  }

  async function place(userId, auctionId, input) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const auction = await Auction.findByPk(auctionId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!auction) throw notFound();

        const existing = await findExisting(userId, input.clientRequestId, transaction);
        if (existing) return verifyReplay(existing, auctionId, input.amount);

        if (auction.status === 'ended') throw new HttpError(409, 'AUCTION_ENDED', 'This auction has ended.');
        if (auction.status !== 'live') throw new HttpError(409, 'AUCTION_NOT_LIVE', 'This auction is not live.');

        const acceptedBidTime = new Date();
        if (!auction.endsAt || new Date(auction.endsAt).getTime() <= acceptedBidTime.getTime()) {
          throw new HttpError(409, 'AUCTION_ENDED', 'This auction has ended.');
        }
        if (auction.sellerId === userId) {
          throw new HttpError(403, 'SELF_BID_FORBIDDEN', 'Sellers cannot bid on their own auctions.');
        }

        const minimum = auction.highestBidderId === null ? auction.startingPrice : auction.currentPrice + auction.minIncrement;
        if (minimum > MAX_BID) throw new HttpError(409, 'BID_LIMIT_REACHED', 'The maximum permitted bid has been reached.');
        if (input.amount < minimum) {
          throw new HttpError(409, 'BID_TOO_LOW', 'The bid is below the minimum acceptable amount.', {
            amount: `Must be at least ${minimum}.`,
          });
        }

        const deadlineCandidate = new Date(acceptedBidTime.getTime() + 3_600_000);
        const endsAt = new Date(Math.max(new Date(auction.endsAt).getTime(), deadlineCandidate.getTime()));
        const bid = await Bid.create({
          auctionId,
          userId,
          amount: input.amount,
          clientRequestId: input.clientRequestId,
          createdAt: acceptedBidTime,
        }, { transaction });
        await auction.update({
          currentPrice: input.amount,
          highestBidderId: userId,
          endsAt,
          version: auction.version + 1,
        }, { transaction });
        return { bid: serializeBid(bid), replayed: false };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await findExisting(userId, input.clientRequestId);
      if (!existing) throw error;
      return verifyReplay(existing, auctionId, input.amount);
    }
  }

  return { place };
}

module.exports = { createBidService, serializeBid };
