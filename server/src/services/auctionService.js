const { Op } = require('sequelize');
const HttpError = require('../utils/httpError');
const { MAX_PRICE } = require('../utils/auctionValidation');

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Auction was not found.');
}

function validateListQuery(query, userId) {
  const allowed = new Set(['page', 'limit', 'status', 'category', 'seller', 'search']);
  const fields = {};
  for (const key of Object.keys(query)) if (!allowed.has(key)) fields[key] = 'Unknown query parameter.';

  function integerParam(key, fallback, max = Number.MAX_SAFE_INTEGER) {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
      fields[key] = `Must be an integer from 1 to ${max}.`;
      return fallback;
    }
    return Number(raw);
  }

  const page = integerParam('page', 1);
  const limit = integerParam('limit', 10, 50);
  if (query.status !== undefined && !['draft', 'live', 'ended'].includes(query.status)) fields.status = 'Must be draft, live, or ended.';
  const Auction = require('../models/auction');
  if (query.category !== undefined && !Auction.categories.includes(query.category)) fields.category = 'Unsupported category.';
  if (query.seller !== undefined && query.seller !== 'me') fields.seller = 'Only seller=me is supported.';
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 120)) fields.search = 'Must be at most 120 characters.';
  if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Query validation failed.', fields);

  const where = {};
  if (query.seller === 'me') where.sellerId = userId;
  if (query.status) where.status = query.status;
  if (query.category) where.category = query.category;
  if (query.search && query.search.trim()) {
    const escaped = query.search.trim().replace(/[\\%_]/g, '\\$&');
    where.title = { [Op.iLike]: `%${escaped}%` };
  }

  // Drafts belong to their seller. General listings expose only available auctions.
  if (query.seller !== 'me') {
    if (query.status === 'draft') where.id = { [Op.eq]: null };
    else if (!query.status) where.status = { [Op.in]: ['live', 'ended'] };
  }
  return { page, limit, where };
}

function createAuctionService({ Auction, User, sequelize }) {
  const publicUserInclude = (as) => ({ model: User, as, attributes: ['id', 'username'], required: false });
  const associations = [publicUserInclude('seller'), publicUserInclude('highestBidder'), publicUserInclude('winner')];

  async function getOwnedDraft(id, userId, transaction) {
    const auction = await Auction.findOne({
      where: { id, sellerId: userId },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    if (!auction) throw notFound();
    if (auction.status !== 'draft') {
      throw new HttpError(409, 'AUCTION_NOT_DRAFT', 'Only draft auctions can be changed or started.');
    }
    return auction;
  }

  return {
    async create(userId, input) {
      if (input.startingPrice + input.minIncrement > MAX_PRICE) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Auction validation failed.', {
          minIncrement: 'Starting price plus minimum increment must not exceed 2000000000.',
        });
      }
      const auction = await Auction.create({
        ...input,
        sellerId: userId,
        currentPrice: input.startingPrice,
        startsAt: null,
        endsAt: null,
        status: 'draft',
        highestBidderId: null,
        winnerId: null,
        version: 0,
      });
      return Auction.findByPk(auction.id, { include: associations });
    },

    async list(userId, query) {
      const { page, limit, where } = validateListQuery(query, userId);
      const { count, rows } = await Auction.findAndCountAll({
        where,
        include: [publicUserInclude('seller')],
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });
      return { rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
    },

    async getById(id, userId) {
      const auction = await Auction.findByPk(id, { include: associations });
      if (!auction || (auction.status === 'draft' && auction.sellerId !== userId)) throw notFound();
      return auction;
    },

    async update(id, userId, changes) {
      return sequelize.transaction(async (transaction) => {
        const auction = await getOwnedDraft(id, userId, transaction);
        const nextStarting = changes.startingPrice ?? auction.startingPrice;
        const nextIncrement = changes.minIncrement ?? auction.minIncrement;
        if (nextStarting + nextIncrement > MAX_PRICE) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Auction validation failed.', {
            minIncrement: 'Starting price plus minimum increment must not exceed 2000000000.',
          });
        }
        await auction.update(changes, { transaction });
        return Auction.findByPk(id, { include: associations, transaction });
      });
    },

    async remove(id, userId) {
      return sequelize.transaction(async (transaction) => {
        const auction = await getOwnedDraft(id, userId, transaction);
        await auction.destroy({ transaction });
        return { id: auction.id };
      });
    },

    async start(id, userId, now = new Date()) {
      return sequelize.transaction(async (transaction) => {
        const auction = await getOwnedDraft(id, userId, transaction);
        const startsAt = new Date(now);
        const endsAt = new Date(startsAt.getTime() + auction.durationSeconds * 1000);
        await auction.update({ startsAt, endsAt, status: 'live', version: auction.version + 1 }, { transaction });
        return Auction.findByPk(id, { include: associations, transaction });
      });
    },
  };
}

module.exports = { createAuctionService, validateListQuery };
