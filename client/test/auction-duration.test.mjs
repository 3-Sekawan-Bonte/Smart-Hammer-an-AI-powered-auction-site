import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUCTION_DURATION_OPTIONS,
  auctionDurationLabel,
  auctionDurationSelection,
  isSupportedAuctionDuration,
  parseAuctionDuration,
} from '../src/features/auctions/auctionDuration.js';

const readForm = () => readFile(new URL('../src/components/AuctionForm.jsx', import.meta.url), 'utf8');

test('auction form offers exactly the three readable duration choices with seconds values', async () => {
  assert.deepEqual(AUCTION_DURATION_OPTIONS, [
    { label: '1 day', seconds: 86400 },
    { label: '3 days', seconds: 259200 },
    { label: '7 days', seconds: 604800 },
  ]);
  const form = await readForm();
  assert.match(form, /<select[\s\S]*?id="auction-duration"/);
  assert.match(form, /AUCTION_DURATION_OPTIONS\.map\(\(\{ label, seconds \}\)/);
  assert.doesNotMatch(form, /id="auction-duration" type="number"/);
  assert.match(form, /durationSeconds,\s*productFacts/);
});

test('new forms default to one day and draft editing preserves a supported stored duration', async () => {
  assert.equal(auctionDurationSelection(undefined), '86400');
  assert.equal(auctionDurationSelection(259200), '259200');
  assert.equal(auctionDurationLabel(259200), '3 days');
  assert.equal(auctionDurationLabel(3600), '1 hour');
  const form = await readForm();
  assert.match(form, /durationSeconds: String\(AUCTION_DURATION_OPTIONS\[0\]\.seconds\)/);
  assert.match(form, /durationSeconds: auctionDurationSelection\(auction\?\.durationSeconds\)/);
  assert.match(form, /value=\{isSupportedAuctionDuration\(Number\(values\.durationSeconds\)\) \? values\.durationSeconds : ''\}/);
});

test('frontend duration validation maps dropdown selections to integer seconds and rejects invalid choices', () => {
  for (const seconds of [86400, 259200, 604800]) {
    assert.equal(isSupportedAuctionDuration(seconds), true);
    assert.equal(parseAuctionDuration(String(seconds)), seconds);
  }
  for (const seconds of [60, 3600, 604801, '259200']) assert.equal(isSupportedAuctionDuration(seconds), false);
  for (const value of ['60', '3600', '604801', 'not-a-duration']) assert.equal(parseAuctionDuration(value), null);
});
