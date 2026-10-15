const HttpError = require('../utils/httpError');

const MAX_BID = 2_000_000_000;

function serializeBid(bid, bidder = null) {
  const value = typeof bid.toJSON === 'function' ? bid.toJSON() : bid;
  return {
    id: value.id,
    auctionId: value.auctionId,
    userId: value.userId,
    amount: value.amount,
    clientRequestId: value.clientRequestId,
    createdAt: new Date(value.createdAt).toISOString(),
    bidder: bidder?.id != null && typeof bidder.username === 'string'
      ? { id: bidder.id, username: bidder.username }
      : value.bidder?.id != null && typeof value.bidder.username === 'string'
        ? { id: value.bidder.id, username: value.bidder.username }
        : null,
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

function createBidService({ Auction, Bid, User, sequelize, eventPublisher, auctioneer }) {
  const auctionIncludes = User ? [
    { model: User, as: 'seller', attributes: ['id', 'username'], required: false },
    { model: User, as: 'highestBidder', attributes: ['id', 'username'], required: false },
    { model: User, as: 'winner', attributes: ['id', 'username'], required: false },
  ] : [];
  async function findExisting(userId, clientRequestId, transaction) {
    return Bid.findOne({ where: { userId, clientRequestId }, transaction });
  }

  async function verifyReplay(existing, auctionId, amount, transaction) {
    if (existing.auctionId !== auctionId || existing.amount !== amount) throw idempotencyConflict();
    const bidder = User ? await User.findByPk(existing.userId, { attributes: ['id', 'username'], transaction }) : null;
    return { bid: serializeBid(existing, bidder), replayed: true };
  }

  async function place(userId, auctionId, input) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const auction = await Auction.findByPk(auctionId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!auction) throw notFound();

        const existing = await findExisting(userId, input.clientRequestId, transaction);
        if (existing) {
          const replay = await verifyReplay(existing, auctionId, input.amount, transaction);
          const bidCount = await Bid.count({ where: { auctionId }, transaction });
          if (typeof auction.setDataValue === 'function') auction.setDataValue('bidCount', bidCount);
          else auction.bidCount = bidCount;
          return { ...replay, auction, bidCount };
        }

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
        const bidder = User ? await User.findByPk(userId, { attributes: ['id', 'username'], transaction }) : null;
        await auction.update({
          currentPrice: input.amount,
          highestBidderId: userId,
          endsAt,
          version: auction.version + 1,
        }, { transaction });
        const updatedAuction = User
          ? await Auction.findByPk(auctionId, { transaction, include: auctionIncludes })
          : auction;
        const bidCount = auctioneer && typeof Bid.count === 'function'
          ? await Bid.count({ where: { auctionId }, transaction })
          : await Bid.count({ where: { auctionId }, transaction });
        if (typeof updatedAuction.setDataValue === 'function') updatedAuction.setDataValue('bidCount', bidCount);
        else updatedAuction.bidCount = bidCount;
        return { bid: serializeBid(bid, bidder), replayed: false, auction: updatedAuction, bidCount };
      });
      if (!result.replayed) {
        const { clientRequestId: _privateRequestId, ...publicBid } = result.bid;
        try { eventPublisher?.publish('bid:updated', result.auction, { bid: publicBid, bidCount: result.bidCount }); } catch (_error) { /* Socket delivery cannot undo an accepted bid. */ }
        if (result.bidCount && result.bidCount % 3 === 0) {
          try {
            auctioneer?.trigger({
              auction: result.auction,
              trigger: 'bid_milestone',
              triggerData: { bidCount: result.bidCount, acceptedBid: result.bid },
            });
          } catch (_error) { /* Commentary never changes bid acceptance. */ }
        }
      }
      return { ...result, clientRequestId: input.clientRequestId };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await findExisting(userId, input.clientRequestId);
      if (!existing) throw error;
      const replay = await verifyReplay(existing, auctionId, input.amount);
      const auction = await Auction.findByPk(auctionId, { include: auctionIncludes });
      const bidCount = await Bid.count({ where: { auctionId } });
      if (auction && typeof auction.setDataValue === 'function') auction.setDataValue('bidCount', bidCount);
      return { ...replay, auction, bidCount, clientRequestId: input.clientRequestId };
    }
  }

  async function list(userId, auctionId, query = {}) {
    const fields = {};
    function positiveInteger(key, fallback, max) {
      const raw = query[key];
      if (raw === undefined) return fallback;
      if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
        fields[key] = `Must be an integer from 1 to ${max}.`;
        return fallback;
      }
      return Number(raw);
    }
    for (const key of Object.keys(query)) if (!['page', 'limit'].includes(key)) fields[key] = 'Unknown query parameter.';
    const page = positiveInteger('page', 1, Number.MAX_SAFE_INTEGER);
    const limit = positiveInteger('limit', 20, 50);
    if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Query validation failed.', fields);
    const auction = await Auction.findByPk(auctionId);
    if (!auction || (auction.status === 'draft' && auction.sellerId !== userId)) throw notFound();
    const { count, rows } = await Bid.findAndCountAll({
      where: { auctionId },
      include: User ? [{ model: User, as: 'bidder', attributes: ['id', 'username'], required: false }] : [],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return {
      rows: rows.map((row) => {
        const value = typeof row.toJSON === 'function' ? row.toJSON() : row;
        return { id: value.id, auctionId: value.auctionId, userId: value.userId, amount: value.amount,
          createdAt: new Date(value.createdAt).toISOString(),
          bidder: value.bidder ? { id: value.bidder.id, username: value.bidder.username } : null };
      }),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  return { place, list };
}

module.exports = { createBidService, serializeBid };
