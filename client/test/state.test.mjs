import assert from 'node:assert/strict';
import test from 'node:test';
import api, { getApiData, getApiErrorDetails, isPublicAuthRequest, TOKEN_KEY, USER_ID_KEY } from '../src/lib/api.js';
import auctionReducer, { createAuction, loadAuctionSnapshot } from '../src/features/auctions/auctionSlice.js';
import authReducer, { canRestoreSession, login, logout, register, restoreSession, selectAuthLoading } from '../src/features/auth/authSlice.js';

test('API response helper unwraps the contract envelope and accepts raw mock values', () => {
  assert.deepEqual(getApiData({ data: { message: 'ok', data: [{ id: 1 }], meta: {} } }), [{ id: 1 }]);
  assert.deepEqual(getApiData({ data: [{ id: 1 }] }), [{ id: 1 }]);
});

test('API errors use documented codes and preserve field errors without exposing an invalid-credentials detail', () => {
  assert.deepEqual(getApiErrorDetails({ response: { data: {
    message: 'internal server text',
    error: { code: 'INVALID_CREDENTIALS', fields: {} },
  } } }), { message: 'Email atau password salah.', code: 'INVALID_CREDENTIALS', fields: {} });
  assert.deepEqual(getApiErrorDetails({ response: { data: {
    message: 'Data tidak valid.',
    error: { code: 'VALIDATION_ERROR', fields: { email: 'Email tidak valid.' } },
  } } }), { message: 'Periksa kembali data yang dimasukkan.', code: 'VALIDATION_ERROR', fields: { email: 'Email tidak valid.' } });
});

test('public login and registration requests are excluded from bearer-session handling', () => {
  assert.equal(isPublicAuthRequest({ url: '/users/login' }), true);
  assert.equal(isPublicAuthRequest({ url: '/users/register' }), true);
  assert.equal(isPublicAuthRequest({ url: '/users/me' }), false);
  assert.equal(isPublicAuthRequest({ url: '/auctions' }), false);
});

test('401 from public auth or a stale account request cannot clear the active session', async () => {
  const values = new Map([[TOKEN_KEY, 'token-old'], [USER_ID_KEY, '1']]);
  const events = [];
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  const requestInterceptor = api.interceptors.request.handlers[0].fulfilled;
  const responseInterceptor = api.interceptors.response.handlers[0].rejected;

  const publicRequest = requestInterceptor({ url: '/users/login', headers: { Authorization: 'Bearer token-old' } });
  assert.equal(publicRequest.headers.Authorization, undefined);
  await assert.rejects(responseInterceptor({ response: { status: 401 }, config: publicRequest }));
  assert.equal(values.get(TOKEN_KEY), 'token-old');
  assert.deepEqual(events, []);

  const oldAccountRequest = requestInterceptor({ url: '/users/me', headers: {} });
  values.set(TOKEN_KEY, 'token-new');
  await assert.rejects(responseInterceptor({ response: { status: 401 }, config: oldAccountRequest }));
  assert.equal(values.get(TOKEN_KEY), 'token-new');
  assert.deepEqual(events, []);

  const invalidSessionRequest = requestInterceptor({ url: '/auctions', headers: {} });
  await assert.rejects(responseInterceptor({ response: { status: 401 }, config: invalidSessionRequest }));
  assert.equal(values.has(TOKEN_KEY), false);
  assert.equal(values.has(USER_ID_KEY), false);
  assert.deepEqual(events, ['smart-hammer:unauthorized']);
  delete globalThis.localStorage;
  delete globalThis.window;
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

test('logout invalidates a pending session restoration so a late profile cannot sign the user back in', () => {
  const removed = [];
  globalThis.localStorage = { removeItem: (key) => removed.push(key) };
  let state = authReducer(undefined, { type: '@@test/init' });
  state = authReducer(state, restoreSession.pending('restore-old', undefined));
  assert.equal(state.restoreRequestId, 'restore-old');
  state = authReducer(state, logout());
  state = authReducer(state, restoreSession.fulfilled({
    token: 'old-token', user: { id: 1, username: 'old-user', email: 'old@example.com' },
  }, 'restore-old', undefined));
  assert.equal(state.status, 'anonymous');
  assert.equal(state.user, null);
  assert.equal(state.accessToken, null);
  assert.deepEqual(removed, ['smart_hammer_access_token', 'smart_hammer_user_id']);
  delete globalThis.localStorage;
});

test('a new login invalidates an older pending profile restoration', () => {
  let state = authReducer(undefined, { type: '@@test/init' });
  state = authReducer(state, restoreSession.pending('restore-old', undefined));
  state = authReducer(state, login.pending('login-new', { email: 'new@example.com', password: 'DemoPass123!' }));
  state = authReducer(state, restoreSession.fulfilled({
    token: 'old-token', user: { id: 1, username: 'old-user', email: 'old@example.com' },
  }, 'restore-old', undefined));
  assert.equal(state.status, 'loading');
  assert.equal(state.restoreRequestId, null);
  assert.equal(state.user, null);
});

test('anonymous state can start one session restore after a cross-tab token change', () => {
  assert.equal(canRestoreSession('anonymous'), true);
  assert.equal(canRestoreSession('restoring'), false);
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
