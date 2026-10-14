const HttpError = require('../utils/httpError');
const { createAIQuestionRateLimiter } = require('./aiQuestionRateLimiter');
const { createOpenAIProvider } = require('./openAIProvider');

const SAFE_PROVIDER_CODES = new Set(['AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_INVALID_RESPONSE']);

function notFound() {
  return new HttpError(404, 'NOT_FOUND', 'Auction was not found.');
}

function safeProductContext(auction, snapshotAt) {
  const sourceFacts = auction.productFacts && typeof auction.productFacts === 'object' ? auction.productFacts : {};
  const boundedText = (value, max) => typeof value === 'string' ? value.slice(0, max) : null;
  return {
    title: boundedText(auction.title, 120),
    description: boundedText(auction.description, 3000),
    condition: boundedText(auction.condition, 20),
    category: boundedText(auction.category, 30),
    productFacts: {
      specifications: boundedText(sourceFacts.specifications, 2000),
      defects: boundedText(sourceFacts.defects, 1000),
      accessories: Array.isArray(sourceFacts.accessories)
        ? sourceFacts.accessories.slice(0, 10).filter((item) => typeof item === 'string').map((item) => item.slice(0, 100))
        : [],
      warranty: boundedText(sourceFacts.warranty, 500),
    },
    sourceVersion: auction.version,
    snapshotAt: snapshotAt.toISOString(),
  };
}

function interactionToJSON(interaction) {
  const value = typeof interaction.toJSON === 'function' ? interaction.toJSON() : interaction;
  return {
    id: value.id,
    auctionId: value.auctionId,
    userId: value.userId ?? null,
    kind: value.kind,
    visibility: value.visibility,
    question: value.question,
    answer: value.answer,
    missingInformation: Array.isArray(value.missingInformation) ? value.missingInformation : [],
    status: value.status,
    sourceVersion: value.sourceVersion,
    snapshotAt: value.snapshotAt ? new Date(value.snapshotAt).toISOString() : null,
    errorCode: value.errorCode ?? null,
    createdAt: value.createdAt ? new Date(value.createdAt).toISOString() : null,
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : null,
    user: value.user ? { id: value.user.id, username: value.user.username } : null,
  };
}

function createAIInteractionService({
  Auction,
  AIInteraction,
  User,
  provider = createOpenAIProvider(),
  rateLimiter = createAIQuestionRateLimiter(),
  eventPublisher,
  clock = () => new Date(),
}) {
  function publish(event, interaction, message) {
    try {
      eventPublisher?.publishAIInteraction(event, {
        auctionId: interaction.auctionId,
        version: interaction.sourceVersion,
        interaction: interactionToJSON(interaction),
        ...(message ? { message } : {}),
      });
    } catch (_error) {
      // Socket delivery is best-effort; persisted Q&A state remains authoritative.
    }
  }

  async function getAccessibleAuction(id, userId) {
    const auction = await Auction.findByPk(id);
    if (!auction || (auction.status === 'draft' && auction.sellerId !== userId)) throw notFound();
    return auction;
  }

  async function ask(userId, auctionId, question) {
    const auction = await getAccessibleAuction(auctionId, userId);
    if (!['live', 'ended'].includes(auction.status)) {
      throw new HttpError(409, 'AUCTION_NOT_LIVE', 'Questions are available only for live or ended auctions.');
    }
    if (!rateLimiter.consume(userId)) {
      throw new HttpError(429, 'RATE_LIMITED', 'Please wait before asking another question.', {}, { retryAfterSeconds: 10 });
    }

    const snapshotAt = clock();
    const context = safeProductContext(auction, snapshotAt);
    const interaction = await AIInteraction.create({
      auctionId,
      userId,
      kind: 'question',
      visibility: 'public',
      question,
      answer: null,
      missingInformation: [],
      status: 'pending',
      sourceVersion: auction.version,
      snapshotAt,
      errorCode: null,
    });
    publish('ai:pending', interaction);

    let result;
    try {
      result = await provider.answerQuestion({ question, context });
    } catch (error) {
      const errorCode = SAFE_PROVIDER_CODES.has(error?.code) ? error.code : 'AI_UNAVAILABLE';
      try {
        await interaction.update({ status: 'failed', answer: null, missingInformation: [], errorCode });
        publish('ai:error', interaction, 'The AI answer service is temporarily unavailable.');
      } catch (_persistError) {
        // No error event is sent unless the failed state was persisted.
      }
      throw new HttpError(503, 'AI_UNAVAILABLE', 'The AI answer service is temporarily unavailable.');
    }

    try {
      await interaction.update({
        answer: result.answer,
        missingInformation: result.missingInformation,
        status: 'completed',
        errorCode: null,
      });
      publish('ai:message', interaction);
    } catch (_error) {
      try { await interaction.update({ status: 'failed', answer: null, missingInformation: [], errorCode: 'AI_UNAVAILABLE' }); } catch (_persistError) { /* Database failure prevents recording the final state. */ }
      throw new HttpError(500, 'INTERNAL_ERROR', 'The AI interaction could not be saved.');
    }
    return interaction;
  }

  async function list(userId, auctionId, { page, limit }) {
    await getAccessibleAuction(auctionId, userId);
    const { count, rows } = await AIInteraction.findAndCountAll({
      where: { auctionId, visibility: 'public' },
      include: User ? [{ model: User, as: 'user', attributes: ['id', 'username'], required: false }] : [],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return { rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
  }

  async function recoverPending() {
    const [count] = await AIInteraction.update(
      { status: 'failed', errorCode: 'AI_INTERRUPTED', answer: null, missingInformation: [] },
      { where: { status: 'pending' } },
    );
    return count;
  }

  return { ask, list, getAccessibleAuction, recoverPending };
}

module.exports = { SAFE_PROVIDER_CODES, safeProductContext, interactionToJSON, createAIInteractionService };
