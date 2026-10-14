import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, {
  aiFailed, aiPending, aiReceived, auctionEnded, auctionSnapshotReceived, auctionStarted,
  bidReceived, loadAuctionSnapshot, resyncRequested,
  submitBid,
} from '../src/features/auctions/auctionSlice.js';

const snapshot = (id = 12, version = 1, overrides = {}) => ({
  auction: {
    id, version, status: 'live', title: 'Camera', startingPrice: 500000,
    currentPrice: 500000, nextMinimumBid: 550000, bidCount: 0,
    highestBidder: null, highestBidderId: null, startsAt: '2026-10-14T00:00:00Z',
    endsAt: '2026-10-14T01:00:00Z', winner: null, winnerId: null, finalPrice: null,
    seller: { id: 1, username: 'seller' }, ...overrides,
  },
  bids: [], aiInteractions: [], bidsMeta: { total: 0 }, aiMeta: { total: 0 },
  serverNow: '2026-10-14T00:00:00Z',
});
const bidEvent = (version, id = 101, idAuction = 12) => ({
  auctionId: idAuction,
  version,
  serverNow: `2026-10-14T00:0${version}:00Z`,
  bid: { id, auctionId: idAuction, amount: 550000, createdAt: `2026-10-14T00:0${version}:00Z` },
  auction: { ...snapshot(idAuction, version).auction, currentPrice: 550000, nextMinimumBid: 600000, bidCount: 1, endsAt: '2026-10-14T02:00:00Z', highestBidder: { id: 2, username: 'buyer' }, highestBidderId: 2 },
});

test('snapshot handles empty histories, public AI filtering, metadata, and server clock', () => {
  let state = reducer(undefined, auctionSnapshotReceived({ ...snapshot(), aiInteractions: [
    { id: 1, auctionId: 12, kind: 'commentary', visibility: 'public', status: 'completed' },
    { id: 2, auctionId: 12, kind: 'question', visibility: 'private', status: 'completed' },
  ] }));
  assert.deepEqual(state.active.bids, []);
  assert.deepEqual(state.active.publicAIInteractions.map((item) => item.id), [1]);
  assert.deepEqual(state.active.bidsMeta, { total: 0 });
  assert.equal(state.active.version, 1);
  assert.equal(state.active.serverNow, '2026-10-14T00:00:00Z');
  assert.equal(Number.isFinite(state.active.serverTimeOffsetMs), true);
});

test('snapshot thunk rejects invalid ID and malformed response, and stale snapshots do not roll state back', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot(12, 6)));
  state = reducer(state, auctionSnapshotReceived(snapshot(12, 4, { currentPrice: 1 })));
  assert.equal(state.active.version, 6);
  assert.equal(state.active.auction.currentPrice, 500000);
  state = reducer(state, loadAuctionSnapshot.pending('req-old', '13'));
  state = reducer(state, loadAuctionSnapshot.fulfilled(snapshot(12, 7), 'req-old', '13'));
  assert.equal(state.active.currentId, '13');
  assert.equal(state.active.auction, null);
  assert.equal(state.active.loading, true);
  state = reducer(state, auctionSnapshotReceived(snapshot(14, '8')));
  assert.equal(state.active.resyncRequired, true);
});

test('stale same-room HTTP response finishes loading without replacing a newer event', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot(12, 2, { currentPrice: 550000 })));
  state = reducer(state, loadAuctionSnapshot.pending('req-resync', '12'));
  assert.equal(state.active.loading, true);
  state = reducer(state, loadAuctionSnapshot.fulfilled(snapshot(12, 1), 'req-resync', '12'));
  assert.equal(state.active.version, 2);
  assert.equal(state.active.auction.currentPrice, 550000);
  assert.equal(state.active.loading, false);
});

test('incremental event applies consecutive authoritative versions, ignores older updates, and flags gaps', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot()));
  state = reducer(state, bidReceived(bidEvent(2)));
  assert.equal(state.active.version, 2);
  assert.equal(state.active.auction.currentPrice, 550000);
  assert.equal(state.active.auction.endsAt, '2026-10-14T02:00:00Z');
  state = reducer(state, bidReceived(bidEvent(1, 99)));
  assert.equal(state.active.version, 2);
  state = reducer(state, bidReceived(bidEvent(4, 104)));
  assert.equal(state.active.version, 2);
  assert.equal(state.active.resyncRequired, true);
  assert.match(state.active.resyncReason, /meloncat/);
  state = reducer(state, bidReceived({ ...bidEvent(3, 103), version: 4 }));
  assert.equal(state.active.version, 2);
  assert.match(state.active.resyncReason, /tidak valid/);
});

test('duplicate bid from socket and REST paths is unique and never increments authoritative totals locally', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot()));
  const event = bidEvent(2);
  state = reducer(state, bidReceived(event));
  state = reducer(state, bidReceived(event));
  assert.equal(state.active.bids.length, 1);
  assert.equal(state.active.bids[0].id, 101);
  assert.equal(state.active.version, 2);
  assert.equal(state.active.auction.bidCount, 1);
  assert.equal(state.active.auction.currentPrice, 550000);
  assert.equal(state.active.auction.nextMinimumBid, 600000);
});

test('REST bid response and socket event converge regardless of arrival order', () => {
  const event = bidEvent(2);
  const rest = submitBid.fulfilled(event, 'bid-request', { auctionId: 12, amount: 550000, clientRequestId: 'request' });
  let socketThenRest = reducer(undefined, auctionSnapshotReceived(snapshot()));
  socketThenRest = reducer(socketThenRest, bidReceived(event));
  socketThenRest = reducer(socketThenRest, rest);
  let restThenSocket = reducer(undefined, auctionSnapshotReceived(snapshot()));
  restThenSocket = reducer(restThenSocket, rest);
  restThenSocket = reducer(restThenSocket, bidReceived(event));
  for (const state of [socketThenRest, restThenSocket]) {
    assert.equal(state.active.version, 2);
    assert.equal(state.active.auction.currentPrice, 550000);
    assert.equal(state.active.bids.length, 1);
    assert.equal(state.active.bids[0].id, 101);
  }
});

test('history resync merges old pages and updates duplicate records newest-first', () => {
  let state = reducer(undefined, auctionSnapshotReceived({
    ...snapshot(), bids: [
      { id: 10, auctionId: 12, amount: 600000, createdAt: '2026-10-14T00:02:00Z' },
      { id: 9, auctionId: 12, amount: 550000, createdAt: '2026-10-14T00:01:00Z' },
    ],
  }));
  state = reducer(state, auctionSnapshotReceived({
    ...snapshot(12, 2), bids: [
      { id: 10, auctionId: 12, amount: 600000, bidder: { id: 2 }, createdAt: '2026-10-14T00:02:00Z' },
    ],
  }));
  assert.deepEqual(state.active.bids.map((bid) => bid.id), [10, 9]);
  assert.deepEqual(state.active.bids[0].bidder, { id: 2 });
});

test('AI interactions deduplicate, advance pending to terminal, and ignore late pending/private updates', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot(12, 8)));
  const pending = { id: 5, auctionId: 12, userId: 7, kind: 'question', visibility: 'private', status: 'pending', sourceVersion: 6, snapshotAt: '2026-10-14T00:00:00Z', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' };
  state = reducer(state, aiPending({ interaction: pending, authenticatedUserId: 7 }));
  state = reducer(state, aiReceived({ ...pending, status: 'completed', answer: 'OK', missingInformation: [], updatedAt: '2026-10-14T00:00:02Z' }));
  state = reducer(state, aiPending({ interaction: { ...pending, updatedAt: '2026-10-14T00:00:03Z' }, authenticatedUserId: 7 }));
  state = reducer(state, aiFailed({ interaction: { ...pending, status: 'failed', errorCode: 'AI_UNAVAILABLE' }, authenticatedUserId: 7 }));
  assert.equal(state.active.publicAIInteractions.length, 0);
  assert.equal(state.active.privateAIInteractions.length, 1);
  assert.equal(state.active.privateAIInteractions[0].status, 'completed');
  assert.equal(state.active.privateAIInteractions[0].sourceVersion, 6);
  assert.equal(state.active.privateAIInteractions[0].snapshotAt, '2026-10-14T00:00:00Z');
});

test('private Q&A state is owner-bound and cleared on logout or account switch', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot()));
  const privateInteraction = { id: 5, auctionId: 12, userId: 7, kind: 'question', visibility: 'private', status: 'completed' };
  state = reducer(state, aiReceived({ interaction: privateInteraction, authenticatedUserId: 7 }));
  assert.equal(state.active.privateAIInteractions.length, 1);
  state = reducer(state, aiReceived({ interaction: { ...privateInteraction, id: 6, userId: 8 }, authenticatedUserId: 7 }));
  assert.equal(state.active.privateAIInteractions.length, 1);
  state = reducer(state, { type: 'auth/login/fulfilled', payload: { user: { id: 8 } } });
  assert.deepEqual(state.active.privateAIInteractions, []);
  state = reducer(state, aiReceived({ interaction: privateInteraction, authenticatedUserId: 8 }));
  assert.deepEqual(state.active.privateAIInteractions, []);
  state = reducer(state, { type: 'auth/logout' });
  assert.deepEqual(state.active.privateAIInteractions, []);
});

test('room isolation, equal-version conflicts, resync flags, and ended lifecycle are protected', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot()));
  state = reducer(state, bidReceived(bidEvent(2, 200, 99)));
  assert.equal(state.active.version, 1);
  assert.equal(state.active.bids.length, 0);
  state = reducer(state, auctionStarted({ ...bidEvent(2), auction: { ...bidEvent(2).auction, status: 'live' } }));
  state = reducer(state, auctionEnded({ ...bidEvent(3), auction: { ...bidEvent(3).auction, status: 'ended', winner: null, finalPrice: null } }));
  assert.equal(state.active.auction.status, 'ended');
  assert.equal(state.active.auction.winner, null);
  assert.equal(state.active.auction.finalPrice, null);
  state = reducer(state, auctionStarted({ ...bidEvent(4), auction: { ...bidEvent(4).auction, status: 'live' } }));
  assert.equal(state.active.auction.status, 'ended');
  state = reducer(state, resyncRequested('manual verification'));
  assert.equal(state.active.resyncRequired, true);
  assert.equal(state.active.resyncReason, 'manual verification');
});

test('account restoration clears room-specific private state before another account can view it', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot()));
  assert.equal(state.active.currentId, '12');
  state = reducer(state, { type: 'auth/restoreSession/fulfilled', payload: { user: { id: 2 } } });
  assert.equal(state.active.currentId, null);
  assert.equal(state.active.auction, null);
  assert.deepEqual(state.active.bids, []);
});

test('draft starts from server timestamps and can end without inventing a winner or final price', () => {
  let state = reducer(undefined, auctionSnapshotReceived(snapshot(12, 0, {
    status: 'draft', startsAt: null, endsAt: null, winner: null, finalPrice: null,
  })));
  assert.equal(state.active.auction.startsAt, null);
  assert.equal(state.active.auction.endsAt, null);
  const started = { auctionId: 12, version: 1, serverNow: '2026-10-14T00:00:00Z', auction: {
    ...snapshot(12, 1).auction, status: 'live', startsAt: '2026-10-14T00:00:00Z', endsAt: '2026-10-14T01:00:00Z',
  } };
  state = reducer(state, auctionStarted(started));
  assert.equal(state.active.auction.status, 'live');
  const ended = { ...started, version: 2, auction: {
    ...started.auction, version: 2, status: 'ended', winner: null, winnerId: null, finalPrice: null,
  } };
  state = reducer(state, auctionEnded(ended));
  assert.equal(state.active.auction.status, 'ended');
  assert.equal(state.active.auction.winner, null);
  assert.equal(state.active.auction.finalPrice, null);
});
