import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatRupiah, getBidAvailability, parseBidAmount, resolveBidSubmissionAmount } from '../src/features/auctions/bidUtils.js';
import { clearPendingBidIntent, createBidIntent, getPendingBidIntent, savePendingBidIntent } from '../src/features/auctions/bidIntent.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('bid amount parsing accepts integer IDR only and enforces the documented range', () => {
  assert.deepEqual(parseBidAmount('550000'), { amount: 550000, error: null });
  for (const value of ['', '0', '-1', '1.5', 'Rp 550.000', 'Infinity', 'NaN', '2000000001']) {
    assert.equal(parseBidAmount(value).amount, null, `reject ${value}`);
    assert.ok(parseBidAmount(value).error);
  }
  assert.match(formatRupiah(550000), /550\.000/);
});

test('empty bid input resolves to the latest authoritative minimum for one-click submission', () => {
  assert.deepEqual(resolveBidSubmissionAmount('', { nextMinimumBid: 550_100_000 }), { amount: 550_100_000, error: null });
  assert.deepEqual(resolveBidSubmissionAmount('', { nextMinimumBid: 400_000 }), { amount: 400_000, error: null });
  assert.deepEqual(resolveBidSubmissionAmount('   ', { nextMinimumBid: 2_000_000_000 }), { amount: 2_000_000_000, error: null });
});

test('manual bids stay unchanged; unavailable minimums and amounts below the latest minimum are rejected', () => {
  assert.deepEqual(resolveBidSubmissionAmount('500000', { nextMinimumBid: 400_000 }), { amount: 500_000, error: null });
  assert.deepEqual(resolveBidSubmissionAmount('500000000', { nextMinimumBid: 400_000 }), { amount: 500_000_000, error: null });
  assert.equal(resolveBidSubmissionAmount('399999', { nextMinimumBid: 400_000 }).amount, null);
  assert.match(resolveBidSubmissionAmount('', { nextMinimumBid: null }).error, /belum tersedia/);
  assert.match(resolveBidSubmissionAmount('', { nextMinimumBid: 2_000_000_001 }).error, /belum tersedia/);
});

test('the bid form reads its live Redux auction and never submits the visual placeholder', async () => {
  const form = await readSource('../src/components/BidForm.jsx');
  assert.match(form, /const latestAuction = state\.auction\.active\.auction/);
  assert.match(form, /resolveBidSubmissionAmount\(amountText, latestAuction\)/);
  assert.match(form, /placeholder=\{minimum \? String\(minimum\)/);
  assert.match(form, /createBidIntent\(resolved\.amount\)/);
  assert.match(form, /void sendIntent\(nextIntent\)/);
  assert.match(form, /if \(inFlight\.current\) return/);
  assert.match(form, /if \(inFlight\.current/);
});

test('bid history renders the associated public username and truncates long names responsively', async () => {
  const history = await readSource('../src/components/BidHistory.jsx');
  const css = await readSource('../src/index.css');
  assert.match(history, /bid\.bidder\?\.username\s*\|\|\s*'Peserta'/);
  assert.match(css, /\.bid-person strong, \.bid-person span \{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s);
});

test('auction detail prices preserve every digit and use container-responsive sizing', async () => {
  for (const value of [10_000, 550_000_000, 2_000_000_000]) {
    assert.equal(formatRupiah(value).replace(/\D/g, ''), String(value));
  }
  const css = await readSource('../src/index.css');
  assert.match(css, /\.bid-zone\s*\{[^}]*container-type:\s*inline-size/s);
  assert.match(css, /\.current-price\s*\{[^}]*clamp\([^}]*cqi/s);
  assert.match(css, /\.current-price\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.bid-form\s*\{[^}]*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.bid-form\s*\{\s*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.next-bid strong\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.next-bid\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.detail-price-block strong\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.winner-price strong\s*\{[^}]*white-space:\s*nowrap/s);
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
