import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRupiah, getBidAvailability, parseBidAmount } from '../src/features/auctions/bidUtils.js';
import { clearPendingBidIntent, createBidIntent, getPendingBidIntent, savePendingBidIntent } from '../src/features/auctions/bidIntent.js';

test('bid amount parsing accepts integer IDR only and enforces the documented range', () => {
  assert.deepEqual(parseBidAmount('550000'), { amount: 550000, error: null });
  for (const value of ['', '0', '-1', '1.5', 'Rp 550.000', 'Infinity', 'NaN', '2000000001']) {
    assert.equal(parseBidAmount(value).amount, null, `reject ${value}`);
    assert.ok(parseBidAmount(value).error);
  }
  assert.match(formatRupiah(550000), /550\.000/);
});

test('bid availability follows auth restore, auction status, seller ownership, and bid limit', () => {
  const user = { id: 1 };
  const auction = { id: 12, seller: { id: 2 }, status: 'live', nextMinimumBid: 500000 };
  assert.equal(getBidAvailability({ auction, user }).allowed, true);
  assert.equal(getBidAvailability({ auction, user, authRestoring: true }).allowed, false);
  assert.equal(getBidAvailability({ auction, user: null }).allowed, false);
  assert.equal(getBidAvailability({ auction: { ...auction, seller: user }, user }).allowed, false);
  assert.equal(getBidAvailability({ auction: { ...auction, status: 'draft' }, user }).allowed, false);
  assert.equal(getBidAvailability({ auction: { ...auction, status: 'ended' }, user }).allowed, false);
  assert.equal(getBidAvailability({ auction: { ...auction, status: 'unknown' }, user }).allowed, false);
  assert.equal(getBidAvailability({ auction: { ...auction, nextMinimumBid: null }, user }).allowed, false);
});

test('an unresolved bid intent keeps the same UUID and exact amount for retries, scoped by account and auction', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const firstIntent = createBidIntent(550000, () => `00000000-0000-4000-8000-00000000000${++sequence}`);
  savePendingBidIntent(12, 1, firstIntent, storage);
  const restored = getPendingBidIntent(12, 1, storage);
  assert.deepEqual(restored, firstIntent);
  const retryPayload = { auctionId: 12, ...restored };
  assert.deepEqual({ auctionId: 12, ...getPendingBidIntent(12, 1, storage) }, retryPayload);
  assert.equal(getPendingBidIntent(12, 2, storage), null);
  assert.equal(getPendingBidIntent(15, 1, storage), null);
  const secondIntent = createBidIntent(600000, () => `00000000-0000-4000-8000-00000000000${++sequence}`);
  assert.notEqual(secondIntent.clientRequestId, firstIntent.clientRequestId);
  clearPendingBidIntent(12, 1, storage);
  assert.equal(getPendingBidIntent(12, 1, storage), null);
});
