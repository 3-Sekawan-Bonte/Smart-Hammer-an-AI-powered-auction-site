const { Op } = require('sequelize');
const { createAuctionClosureScheduler } = require('../src/services/auctionClosureScheduler');

describe('auction closure scheduler', () => {
  test('recovers expired auctions in stable batches through the closure service', async () => {
    const rows = [[{ id: 3 }, { id: 8 }], []];
    const Auction = { findAll: jest.fn(async () => rows.shift()) };
    const closureService = { close: jest.fn(async () => ({ closed: true })) };
    const logger = { error: jest.fn() };
    const scheduler = createAuctionClosureScheduler({
      Auction,
      closureService,
      batchSize: 2,
      clock: () => new Date('2026-10-14T12:00:00.000Z'),
      logger,
    });

    await expect(scheduler.recover()).resolves.toEqual({ skipped: false, attempted: 2 });
    expect(closureService.close.mock.calls).toEqual([[3], [8]]);
    expect(Auction.findAll.mock.calls[0][0]).toMatchObject({
      where: { status: 'live', endsAt: { [Op.lte]: new Date('2026-10-14T12:00:00.000Z') }, id: { [Op.gt]: 0 } },
      order: [['id', 'ASC']],
      limit: 2,
      raw: true,
    });
    expect(Auction.findAll.mock.calls[1][0].where.id[Op.gt]).toBe(8);
  });

  test('continues after an individual closure failure', async () => {
    const rows = [[{ id: 4 }, { id: 5 }], []];
    const Auction = { findAll: jest.fn(async () => rows.shift()) };
    const closureService = {
      close: jest.fn(async (id) => {
        if (id === 4) throw Object.assign(new Error('internal detail'), { name: 'DatabaseError' });
        return { closed: true };
      }),
    };
    const logger = { error: jest.fn() };
    const scheduler = createAuctionClosureScheduler({ Auction, closureService, logger });
    await expect(scheduler.run()).resolves.toEqual({ skipped: false, attempted: 2 });
    expect(closureService.close).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('Auction closure failed for auction 4 (DatabaseError).');
    expect(logger.error.mock.calls[0][0]).not.toContain('internal detail');
  });

  test('skips overlapping sweeps in the same process', async () => {
    let releaseQuery;
    const Auction = {
      findAll: jest.fn(() => new Promise((resolve) => { releaseQuery = resolve; })),
    };
    const scheduler = createAuctionClosureScheduler({ Auction, closureService: { close: jest.fn() } });
    const current = scheduler.run();
    await Promise.resolve();
    await expect(scheduler.run()).resolves.toEqual({ skipped: true, attempted: 0 });
    releaseQuery([]);
    await expect(current).resolves.toEqual({ skipped: false, attempted: 0 });
  });

  test('starts a five second interval and can stop it', () => {
    const timer = { unref: jest.fn() };
    const setIntervalFn = jest.fn(() => timer);
    const clearIntervalFn = jest.fn();
    const scheduler = createAuctionClosureScheduler({
      Auction: { findAll: jest.fn() },
      closureService: { close: jest.fn() },
      setIntervalFn,
      clearIntervalFn,
    });
    scheduler.start();
    scheduler.start();
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(setIntervalFn.mock.calls[0][1]).toBe(5_000);
    expect(timer.unref).toHaveBeenCalledTimes(1);
    scheduler.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(timer);
  });
});
