const { createGroqProvider } = require('./groqProvider');
const { interactionToJSON } = require('./aiInteractionService');

const SAFE_FAILURE_CODES = new Set(['AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_INVALID_RESPONSE']);
const PROVIDER_DIAGNOSTIC_CODES = new Set([
  ...SAFE_FAILURE_CODES,
  'AI_CONFIG_MISSING',
  'AI_AUTH_FAILED',
  'AI_RATE_LIMITED',
  'AI_REQUEST_INVALID',
  'AI_PROVIDER_ERROR',
  'AI_NETWORK_ERROR',
]);

function safeLog(logger, auctionId, code, statusCode) {
  const status = Number.isInteger(statusCode) ? ` status=${statusCode}` : '';
  try { logger.error(`AI Auctioneer failed for auction ${auctionId} (${code}${status}).`); } catch (_error) { /* Diagnostics must not interrupt auction operations. */ }
}

function buildContext(auction, trigger, triggerData = {}, snapshotAt = new Date()) {
  const facts = auction.productFacts && typeof auction.productFacts === 'object' ? auction.productFacts : {};
  const bounded = (value, length) => typeof value === 'string' ? value.slice(0, length) : null;
  const bidCount = Number.isSafeInteger(triggerData.bidCount) && triggerData.bidCount >= 0 ? triggerData.bidCount : null;
  const hasBids = auction.highestBidderId !== null && auction.highestBidderId !== undefined;
  const winner = auction.winner ? { id: auction.winner.id, username: auction.winner.username } : null;

  return {
    trigger,
    snapshotAt: snapshotAt.toISOString(),
    auction: {
      id: auction.id,
      title: bounded(auction.title, 120),
      description: bounded(auction.description, 3000),
      condition: bounded(auction.condition, 20),
      category: bounded(auction.category, 30),
      productFacts: {
        specifications: bounded(facts.specifications, 2000),
        defects: bounded(facts.defects, 1000),
        accessories: Array.isArray(facts.accessories)
          ? facts.accessories.slice(0, 10).filter((item) => typeof item === 'string').map((item) => item.slice(0, 100))
          : [],
        warranty: bounded(facts.warranty, 500),
      },
      status: auction.status,
      startsAt: auction.startsAt ? new Date(auction.startsAt).toISOString() : null,
      endsAt: auction.endsAt ? new Date(auction.endsAt).toISOString() : null,
      startingPrice: auction.startingPrice,
      currentPrice: auction.currentPrice,
      finalPrice: trigger === 'end' && hasBids ? auction.currentPrice : null,
      priceChange: auction.currentPrice - auction.startingPrice,
      bidCount,
      acceptedBid: triggerData.acceptedBid
        ? { amount: triggerData.acceptedBid.amount, createdAt: new Date(triggerData.acceptedBid.createdAt).toISOString() }
        : null,
      winner: trigger === 'end' ? winner : null,
      version: auction.version,
    },
  };
}

function createAuctioneerService({
  AIInteraction,
  provider = createGroqProvider(),
  eventPublisher,
  clock = () => new Date(),
  logger = console,
  maxConcurrent = 3,
}) {
  const activeAuctions = new Set();
  const tasks = new Map();

  function publish(event, interaction, message) {
    try {
      eventPublisher?.publishAIInteraction(event, {
        auctionId: interaction.auctionId,
        version: interaction.sourceVersion,
        interaction: interactionToJSON(interaction),
        ...(message ? { message } : {}),
      });
    } catch (_error) {
      safeLog(logger, interaction.auctionId, 'EVENT_DELIVERY_FAILED');
    }
  }

  async function generate({ auction, trigger, triggerKey, triggerData = {} }) {
    const snapshotAt = clock();
    const context = buildContext(auction, trigger, triggerData, snapshotAt);
    let interaction;
    try {
      interaction = await AIInteraction.create({
        auctionId: auction.id,
        userId: null,
        kind: 'commentary',
        triggerKey,
        visibility: 'public',
        question: null,
        answer: null,
        missingInformation: [],
        status: 'pending',
        sourceVersion: auction.version,
        snapshotAt,
        errorCode: null,
      });
    } catch (error) {
      if (error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === '23505') return;
      safeLog(logger, auction.id, 'PERSISTENCE_FAILED');
      return;
    }

    publish('ai:pending', interaction);
    try {
      const result = await provider.generateCommentary({ context });
      await interaction.update({
        answer: result.answer,
        missingInformation: result.missingInformation,
        status: 'completed',
        errorCode: null,
      });
      publish('ai:message', interaction);
    } catch (error) {
      const errorCode = SAFE_FAILURE_CODES.has(error?.code) ? error.code : 'AI_UNAVAILABLE';
      const diagnosticCode = PROVIDER_DIAGNOSTIC_CODES.has(error?.code) ? error.code : 'AI_UNAVAILABLE';
      try {
        await interaction.update({ status: 'failed', answer: null, missingInformation: [], errorCode });
        publish('ai:error', interaction, 'Auctioneer commentary is temporarily unavailable.');
      } catch (_persistError) {
        safeLog(logger, auction.id, 'PERSISTENCE_FAILED');
      }
      safeLog(logger, auction.id, diagnosticCode, error?.statusCode);
    }
  }

  function trigger(input) {
    const { auction, trigger, triggerData = {} } = input || {};
    if (!auction || !Number.isSafeInteger(auction.id) || !Number.isSafeInteger(auction.version)) return false;
    if (!['start', 'bid_milestone', 'end'].includes(trigger)) return false;
    if ((trigger === 'end' && auction.status !== 'ended') || (trigger !== 'end' && auction.status !== 'live')) return false;
    const triggerKey = trigger === 'bid_milestone' ? `bid:${triggerData.bidCount}` : trigger;
    if (trigger === 'bid_milestone' && (!Number.isSafeInteger(triggerData.bidCount) || triggerData.bidCount < 3 || triggerData.bidCount % 3 !== 0)) return false;
    if (activeAuctions.has(auction.id)) {
      logger.warn(`AI Auctioneer trigger skipped while another commentary is running for auction ${auction.id}.`);
      return false;
    }
    if (activeAuctions.size >= maxConcurrent) {
      logger.warn(`AI Auctioneer concurrency limit reached; trigger skipped for auction ${auction.id}.`);
      return false;
    }

    activeAuctions.add(auction.id);
    const task = Promise.resolve()
      .then(() => generate({ auction, trigger, triggerKey, triggerData }))
      .catch(() => safeLog(logger, auction.id, 'UNEXPECTED_FAILURE'))
      .finally(() => {
        activeAuctions.delete(auction.id);
        tasks.delete(auction.id);
      });
    tasks.set(auction.id, task);
    return true;
  }

  async function waitForIdle() {
    while (tasks.size) await Promise.all([...tasks.values()]);
  }

  return { trigger, waitForIdle };
}

module.exports = { buildContext, createAuctioneerService };
