import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSocketEvent } from '../src/features/auctions/auctionRoom.js';

test('normalizes the backend data envelope for auction and AI events', () => {
  const base = { auctionId: 12, version: 4, serverNow: '2026-10-14T00:00:00.000Z' };
  const auction = { id: 12, version: 4, status: 'live' };
  assert.deepEqual(normalizeSocketEvent({ ...base, data: { auction, bid: { id: 5, auctionId: 12 }, bidCount: 5 } }),
    { ...base, auction, bid: { id: 5, auctionId: 12 }, bidCount: 5, data: { auction, bid: { id: 5, auctionId: 12 }, bidCount: 5 } });
  assert.deepEqual(normalizeSocketEvent({ ...base, data: { interaction: { id: 9, status: 'completed' } } }).interaction,
    { id: 9, status: 'completed', auctionId: 12 });
  assert.deepEqual(normalizeSocketEvent({ ...base, data: { auction, bids: [], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } }).bidsMeta,
    { currentPage: 1, limit: 20, totalData: 1, totalPages: 1 });
});
