import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiData } from '../src/lib/api.js';
import auctionReducer, { createAuction, loadAuctionSnapshot } from '../src/features/auctions/auctionSlice.js';
import authReducer, { register, selectAuthLoading } from '../src/features/auth/authSlice.js';

test('API response helper unwraps the contract envelope and accepts raw mock values', () => {
  assert.deepEqual(getApiData({ data: { message: 'ok', data: [{ id: 1 }], meta: {} } }), [{ id: 1 }]);
  assert.deepEqual(getApiData({ data: [{ id: 1 }] }), [{ id: 1 }]);
});

test('registration reducer never creates an authenticated session', () => {
  let state = authReducer(undefined, { type: '@@test/init' });
  assert.equal(selectAuthLoading({ auth: state }), true);
  state = authReducer(state, register.fulfilled(
    { id: 3, username: 'New User', email: 'new@example.com' },
    'request-1',
    { username: 'New User', email: 'new@example.com', password: 'DemoPass123!' },
  ));
  assert.equal(state.status, 'anonymous');
  assert.equal(state.user, null);
  assert.equal(state.accessToken, null);
});

test('late auction snapshots cannot overwrite the route selected later', () => {
  let state = auctionReducer(undefined, { type: '@@test/init' });
  state = auctionReducer(state, loadAuctionSnapshot.pending('request-12', '12'));
  state = auctionReducer(state, loadAuctionSnapshot.pending('request-13', '13'));

  state = auctionReducer(state, loadAuctionSnapshot.fulfilled({
    auction: { id: 12, currentPrice: 10, startingPrice: 10, status: 'live', version: 1 },
    bids: [], aiInteractions: [], serverNow: '2026-10-14T00:00:00.000Z',
  }, 'request-12', '12'));
  assert.equal(state.active.currentId, '13');
  assert.equal(state.active.auction, null);
  assert.equal(state.active.loading, true);

  state = auctionReducer(state, loadAuctionSnapshot.fulfilled({
    auction: { id: 13, currentPrice: 25, startingPrice: 25, status: 'live', version: 1 },
    bids: [], aiInteractions: [], serverNow: '2026-10-14T00:00:00.000Z',
  }, 'request-13', '13'));
  assert.equal(state.active.auction.id, 13);
  assert.equal(state.active.auction.price, 25);
  assert.equal(state.active.loading, false);
});

test('a successful draft save does not leak the private draft into the public catalog', () => {
  let state = auctionReducer(undefined, { type: '@@test/init' });
  state = auctionReducer(state, createAuction.fulfilled(
    { id: 18, status: 'draft', title: 'Draft sample' },
    'request-create',
    { title: 'Draft sample' },
  ));
  assert.equal(state.create.status, 'success');
  assert.deepEqual(state.catalog.auctions, []);
});

test('logout clears private auction state', () => {
  let state = auctionReducer(undefined, { type: '@@test/init' });
  state = auctionReducer(state, loadAuctionSnapshot.pending('request-12', '12'));
  state = auctionReducer(state, { type: 'auth/logout' });
  assert.equal(state.active.auction, null);
  assert.deepEqual(state.catalog.auctions, []);
  assert.equal(state.active.requestId, null);
});
