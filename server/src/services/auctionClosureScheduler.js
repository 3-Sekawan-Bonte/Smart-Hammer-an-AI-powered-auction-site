const { Op } = require('sequelize');

function createAuctionClosureScheduler({
  Auction,
  closureService,
  intervalMs = 5_000,
  batchSize = 100,
  clock = () => new Date(),
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let running = false;
  let timer = null;

  function logFailure(auctionId, error) {
    const name = typeof error?.name === 'string' ? error.name : 'Error';
    logger.error(`Auction closure failed${auctionId ? ` for auction ${auctionId}` : ''} (${name}).`);
  }

  async function runSweep() {
    if (running) return { skipped: true, attempted: 0 };
    running = true;
    let attempted = 0;
    try {
      const sweepTime = clock();
      let afterId = 0;
      while (true) {
        const expired = await Auction.findAll({
          attributes: ['id'],
          where: {
            status: 'live',
            endsAt: { [Op.lte]: sweepTime },
            id: { [Op.gt]: afterId },
          },
          order: [['id', 'ASC']],
          limit: batchSize,
          raw: true,
        });
        if (expired.length === 0) break;

        for (const row of expired) {
          afterId = row.id;
          attempted += 1;
          try {
            await closureService.close(row.id);
          } catch (error) {
            logFailure(row.id, error);
          }
        }
      }
      return { skipped: false, attempted };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setIntervalFn(() => {
      runSweep().catch((error) => logFailure(null, error));
    }, intervalMs);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
  }

  return { recover: runSweep, run: runSweep, start, stop };
}

module.exports = { createAuctionClosureScheduler };
