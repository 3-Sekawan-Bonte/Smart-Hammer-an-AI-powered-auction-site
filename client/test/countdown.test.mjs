import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCountdown, getRemainingSeconds } from '../src/features/auctions/countdownUtils.js';
import { estimateServerOffset, createServerClock } from '../src/features/auctions/serverClock.js';
import { getAuctionResultState } from '../src/features/auctions/auctionResult.js';

test('countdown computes from authoritative server time and formats hours and days', () => {
  assert.equal(getRemainingSeconds('2026-10-14T15:10:00.000Z', Date.parse('2026-10-14T15:00:00.000Z')), 600);
  assert.equal(formatCountdown(600), '00:10:00');
  assert.equal(formatCountdown(90_061), '1 hari 01j 01m');
});

test('server offset compensates for client clocks five minutes ahead or behind', () => {
  const server = Date.parse('2026-10-14T15:00:00.000Z');
  const deadline = server + 10 * 60_000;
  const aheadLocal = server + 5 * 60_000;
  const behindLocal = server - 5 * 60_000;
  const ahead = createServerClock({ serverNow: new Date(server).toISOString(), localNow: aheadLocal, monotonicNow: 50 });
  const behind = createServerClock({ serverNow: new Date(server).toISOString(), localNow: behindLocal, monotonicNow: 50 });
  assert.equal(getRemainingSeconds(deadline, ahead.now(50)), 600);
  assert.equal(getRemainingSeconds(deadline, behind.now(50)), 600);
  assert.equal(getRemainingSeconds(deadline, ahead.now(1050)), 599);
});

test('HTTP clock calibration uses the request midpoint and rejects invalid samples', () => {
  assert.equal(estimateServerOffset('2026-10-14T15:00:00.000Z', 1000, 3000), Date.parse('2026-10-14T15:00:00.000Z') - 2000);
  assert.equal(estimateServerOffset('invalid', 1000, 3000), null);
  assert.equal(estimateServerOffset('2026-10-14T15:00:00.000Z', 3000, 1000), null);
});

test('invalid and elapsed deadlines are safe and never infer auction status', () => {
  assert.equal(getRemainingSeconds('not-a-date', Date.now()), null);
  assert.equal(getRemainingSeconds('2026-10-14T15:00:00.000Z', Date.parse('2026-10-14T15:00:01.000Z')), 0);
});

test('winner result only renders for complete authoritative ended state', () => {
  assert.deepEqual(getAuctionResultState({ status: 'live', endsAt: '2026-10-14T15:00:00.000Z' }), { kind: 'hidden' });
  assert.deepEqual(getAuctionResultState({ status: 'draft' }), { kind: 'hidden' });
  assert.deepEqual(getAuctionResultState({ status: 'ended', version: 2, bidCount: 0, highestBidder: null, winner: null, finalPrice: null }), { kind: 'no-bids' });
  assert.deepEqual(getAuctionResultState({ status: 'ended', version: 3, bidCount: 1, currentPrice: 200, nextMinimumBid: null, highestBidder: { id: 7 }, winner: { id: 7, username: 'Buyer' }, finalPrice: 200 }), { kind: 'winner', winner: { id: 7, username: 'Buyer' }, finalPrice: 200 });
  assert.deepEqual(getAuctionResultState({ status: 'ended', version: 3, bidCount: 1, currentPrice: 200, nextMinimumBid: null, highestBidder: null, winner: { id: 7, username: 'Buyer' }, finalPrice: 200 }), { kind: 'loading' });
  assert.deepEqual(getAuctionResultState({ status: 'ended', version: 3, bidCount: 0, highestBidder: null, winner: { id: 7, username: 'Buyer' }, finalPrice: 200 }), { kind: 'loading' });
});
