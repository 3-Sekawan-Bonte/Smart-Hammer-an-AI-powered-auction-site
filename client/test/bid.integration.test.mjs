import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import { io as socketClient } from 'socket.io-client';
import auctionReducer, { selectActiveAuction, selectActiveBids, selectActiveBidsMeta, submitBid } from '../src/features/auctions/auctionSlice.js';
import socketReducer from '../src/features/socket/socketSlice.js';
import { disconnectSocket, initSocket, joinAuctionRoom, setSocketDispatch } from '../src/lib/socket.js';
import api, { TOKEN_KEY } from '../src/lib/api.js';
import { createMockServer } from '../mock/start.mjs';

const fixture = fileURLToPath(new URL('../mock/db.json', import.meta.url));
const secret = randomBytes(32).toString('base64url');
const waitFor = (predicate, label) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timeout: ${label}`)), 3000);
  const check = () => predicate() ? (clearTimeout(timeout), resolve()) : setTimeout(check, 10);
  check();
});
const once = (socket, event) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, receive); reject(new Error(`Timeout: ${event}`)); }, 3000);
  const receive = (value) => { clearTimeout(timeout); resolve(value); };
  socket.once(event, receive);
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'smart-hammer-fe06-'));
  const databasePath = join(directory, 'db.json');
  await copyFile(fixture, databasePath);
  const server = createMockServer({ databasePath, jwtSecret: secret });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { token, method = 'GET', body } = {}) => fetch(`${url}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const login = async (email = 'demo@smart-hammer.id', password = 'smart123') => {
    const response = await request('/users/login', { method: 'POST', body: { email, password } });
    assert.equal(response.status, 200);
    return (await response.json()).data.access_token;
  };
  const createBuyer = async () => {
    const email = `buyer-${randomUUID()}@example.test`;
    const registered = await request('/users/register', { method: 'POST', body: { username: `buyer-${randomUUID().slice(0, 8)}`, email, password: 'buyer-pass-123' } });
    assert.equal(registered.status, 201);
    return login(email, 'buyer-pass-123');
  };
  const readDb = async () => JSON.parse(await readFile(databasePath, 'utf8'));
  const writeDb = (data) => writeFile(databasePath, `${JSON.stringify(data, null, 2)}\n`);
  t.after(async () => {
    disconnectSocket();
    await new Promise((resolve) => server.io.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { createBuyer, databasePath, login, readDb, request, server, url, writeDb };
}

test('two buyers submit real HTTP bids, receive Socket.IO updates, and Redux reconciles without duplicates', async (t) => {
  const app = await setup(t);
  const buyerAToken = await app.login();
  const buyerBToken = await app.createBuyer();
  const originalBaseUrl = api.defaults.baseURL;
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => key === TOKEN_KEY ? buyerAToken : null } });
  api.defaults.baseURL = app.url;
  t.after(() => {
    api.defaults.baseURL = originalBaseUrl;
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
    else delete globalThis.localStorage;
  });
  const store = configureStore({ reducer: { auction: auctionReducer, socket: socketReducer } });
  setSocketDispatch(store.dispatch);
  const buyerA = initSocket(buyerAToken, app.url);
  t.after(() => buyerA?.disconnect());
  await once(buyerA, 'connect');
  const initialSnapshot = once(buyerA, 'auction:snapshot');
  await joinAuctionRoom(12);
  await initialSnapshot;
  const buyerB = socketClient(app.url, { auth: { token: buyerBToken }, transports: ['websocket'], reconnection: false });
  t.after(() => buyerB.disconnect());
  await once(buyerB, 'connect');
  const buyerBSnapshot = once(buyerB, 'auction:snapshot');
  const buyerBJoin = await new Promise((resolve) => buyerB.timeout(1000).emit('auction:join', { auctionId: 12 }, (_error, value) => resolve(value)));
  assert.equal(buyerBJoin.ok, true);
  await buyerBSnapshot;

  const firstId = randomUUID();
  const firstEventA = once(buyerA, 'bid:updated');
  const firstEventB = once(buyerB, 'bid:updated');
  const acceptedA = await store.dispatch(submitBid({ auctionId: 12, amount: 2_000_000, clientRequestId: firstId })).unwrap();
  const [eventA, eventB] = await Promise.all([firstEventA, firstEventB]);
  assert.equal(acceptedA.replayed, false);
  assert.equal(acceptedA.bid.amount, 2_000_000, 'first bid may equal starting price');
  assert.equal(eventA.version, acceptedA.auction.version);
  assert.equal(eventA.auction.endsAt, acceptedA.auction.endsAt);
  assert.ok(Date.parse(acceptedA.auction.endsAt) >= Date.now() + 3_590_000, 'accepted bid extends the deadline toward server time plus one hour');
  assert.deepEqual(eventA, eventB);
  assert.equal(Object.hasOwn(eventA, 'clientRequestId'), false);
  assert.equal(Object.hasOwn(eventA.bid, 'clientRequestId'), false);
  await waitFor(() => selectActiveAuction(store.getState())?.version === acceptedA.auction.version, 'Redux first bid');
  assert.equal(selectActiveBids(store.getState()).length, 1);
  assert.equal(selectActiveBidsMeta(store.getState()).totalData, 1);
  assert.equal(selectActiveAuction(store.getState()).nextMinimumBid, 2_050_000);

  const secondEventA = once(buyerA, 'bid:updated');
  const secondEventB = once(buyerB, 'bid:updated');
  const secondResponse = await app.request('/auctions/12/bids', { token: buyerBToken, method: 'POST', body: { amount: 2_050_000, clientRequestId: randomUUID() } });
  const acceptedB = (await secondResponse.json()).data;
  const [secondA, secondB] = await Promise.all([secondEventA, secondEventB]);
  assert.equal(secondResponse.status, 201);
  assert.deepEqual(secondA, secondB);
  assert.equal(acceptedB.auction.bidCount, 2);
  assert.ok(Date.parse(acceptedB.auction.endsAt) >= Date.parse(acceptedA.auction.endsAt));
  await waitFor(() => selectActiveAuction(store.getState())?.version === acceptedB.auction.version, 'Redux second bid');
  assert.equal(selectActiveBids(store.getState()).length, 2);
  assert.equal(selectActiveBidsMeta(store.getState()).totalData, 2);
  assert.equal(selectActiveAuction(store.getState()).currentPrice, 2_050_000);

  let extraEvents = 0;
  buyerA.on('bid:updated', () => { extraEvents += 1; });
  const retryId = randomUUID();
  const retryEvent = once(buyerB, 'bid:updated');
  const replayRequests = await Promise.all([
    app.request('/auctions/12/bids', { token: buyerAToken, method: 'POST', body: { amount: 2_100_000, clientRequestId: retryId } }),
    app.request('/auctions/12/bids', { token: buyerAToken, method: 'POST', body: { amount: 2_100_000, clientRequestId: retryId } }),
  ]);
  const replayBodies = await Promise.all(replayRequests.map((response) => response.json()));
  await retryEvent;
  await pause(40);
  assert.deepEqual(replayRequests.map((response) => response.status).sort(), [200, 201]);
  assert.equal(replayBodies.filter((body) => body.data.replayed).length, 1);
  assert.equal(replayBodies[0].data.auction.version, replayBodies[1].data.auction.version);
  assert.equal(replayBodies[0].data.auction.endsAt, replayBodies[1].data.auction.endsAt, 'retry must not extend the deadline again');
  assert.equal(extraEvents, 1, 'only the new acceptance is broadcast');
  assert.equal((await app.readDb()).bids.filter((bid) => bid.clientRequestId === retryId).length, 1);

  const sameUuidOtherBuyer = await app.request('/auctions/12/bids', { token: buyerBToken, method: 'POST', body: { amount: 2_150_000, clientRequestId: retryId } });
  assert.equal(sameUuidOtherBuyer.status, 201, 'request identifiers are scoped to the authenticated bidder');
  const otherBuyerBody = (await sameUuidOtherBuyer.json()).data;
  await waitFor(() => selectActiveAuction(store.getState())?.version === otherBuyerBody.auction.version, 'Redux other buyer bid');
  const currentVersion = otherBuyerBody.auction.version;
  const deadlineBeforeLowBid = otherBuyerBody.auction.endsAt;
  const conflict = await app.request('/auctions/12/bids', { token: buyerAToken, method: 'POST', body: { amount: 2_150_000, clientRequestId: retryId } });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'IDEMPOTENCY_CONFLICT');
  const tooLow = await app.request('/auctions/12/bids', { token: buyerBToken, method: 'POST', body: { amount: 2_150_000, clientRequestId: randomUUID() } });
  assert.equal(tooLow.status, 409);
  const tooLowBody = await tooLow.json();
  assert.equal(tooLowBody.error.code, 'BID_TOO_LOW');
  assert.equal(tooLowBody.error.details.nextMinimumBid, 2_200_000);
  await pause(40);
  assert.equal(extraEvents, 2, 'rejected bids do not broadcast');
  const currentDb = await app.readDb();
  assert.equal(currentDb.auctions.find((item) => Number(item.id) === 12).version, currentVersion);
  assert.equal(currentDb.auctions.find((item) => Number(item.id) === 12).endsAt, deadlineBeforeLowBid, 'rejected bid does not extend the deadline');
  assert.equal(selectActiveBids(store.getState()).length, 4, 'REST response and socket event deduplicate accepted bids');
  assert.equal(selectActiveBidsMeta(store.getState()).totalData, 4);

  const endResponse = await app.request('/__mock/auctions/12/end', { token: buyerAToken, method: 'POST' });
  assert.equal(endResponse.status, 200);
  const replayAfterEnd = await app.request('/auctions/12/bids', { token: buyerAToken, method: 'POST', body: { amount: 2_100_000, clientRequestId: retryId } });
  assert.equal(replayAfterEnd.status, 200, 'accepted intent remains replayable after auction closes');
  assert.equal((await replayAfterEnd.json()).data.replayed, true);

  const history = await app.request('/auctions/12/bids?page=1&limit=20', { token: buyerAToken });
  const historyBody = await history.json();
  assert.equal(historyBody.data.length, 4);
  assert.equal(historyBody.meta.totalData, 4);
  assert.deepEqual(historyBody.data.map((bid) => bid.amount), [2_150_000, 2_100_000, 2_050_000, 2_000_000]);
  assert.ok(historyBody.data.every((bid) => !Object.hasOwn(bid, 'clientRequestId') && !Object.hasOwn(bid, 'email')));
});

test('server-side restrictions, unknown fields, invalid amounts, deadline and maximum are enforced', async (t) => {
  const app = await setup(t);
  const buyer = await app.login();
  const seller = await app.login('seller@smart-hammer.id');
  const requestBid = (id, token, body) => app.request(`/auctions/${id}/bids`, { token, method: 'POST', body });
  for (const amount of [0, -1, 1.5, '2000000', 2_000_000_001]) {
    const response = await requestBid(12, buyer, { amount, clientRequestId: randomUUID() });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  const unknown = await requestBid(12, buyer, { amount: 2_000_000, clientRequestId: randomUUID(), userId: 1 });
  assert.equal((await unknown.json()).error.fields.userId, 'Field tidak diizinkan.');
  const missingUuid = await requestBid(12, buyer, { amount: 2_000_000 });
  assert.equal((await missingUuid.json()).error.fields.clientRequestId, 'Harus berupa UUID yang valid.');
  const unauthenticated = await requestBid(12, null, { amount: 2_000_000, clientRequestId: randomUUID() });
  assert.equal(unauthenticated.status, 401);
  const missingAuction = await requestBid(999, buyer, { amount: 2_000_000, clientRequestId: randomUUID() });
  assert.equal(missingAuction.status, 404);
  const selfBid = await requestBid(12, seller, { amount: 2_000_000, clientRequestId: randomUUID() });
  assert.equal(selfBid.status, 403);
  assert.equal((await selfBid.json()).error.code, 'SELF_BID_FORBIDDEN');
  const draft = await requestBid(8, buyer, { amount: 1_000_000, clientRequestId: randomUUID() });
  assert.equal(draft.status, 404, 'private draft is not disclosed to another user');
  const ended = await requestBid(7, buyer, { amount: 1_000_000, clientRequestId: randomUUID() });
  assert.equal(ended.status, 409);
  assert.equal((await ended.json()).error.code, 'AUCTION_ENDED');

  const db = await app.readDb();
  const live = db.auctions.find((item) => Number(item.id) === 12);
  live.startingPrice = 2_000_000_000;
  live.currentPrice = 2_000_000_000;
  live.minIncrement = 1;
  live.highestBidderId = 3;
  db.bids.push({ id: 901, auctionId: 12, userId: 3, amount: 2_000_000_000, createdAt: new Date().toISOString() });
  await app.writeDb(db);
  const atLimit = await requestBid(12, buyer, { amount: 2_000_000_000, clientRequestId: randomUUID() });
  assert.equal(atLimit.status, 409);
  assert.equal((await atLimit.json()).error.code, 'BID_LIMIT_REACHED');

  const expiredDb = await app.readDb();
  expiredDb.auctions.find((item) => Number(item.id) === 13).endsAt = new Date(Date.now() - 1000).toISOString();
  await app.writeDb(expiredDb);
  const afterDeadline = await requestBid(13, buyer, { amount: 4_000_000, clientRequestId: randomUUID() });
  assert.equal(afterDeadline.status, 409);
  assert.equal((await afterDeadline.json()).error.code, 'AUCTION_ENDED');
  const endedState = await app.readDb();
  assert.equal(endedState.auctions.find((item) => Number(item.id) === 13).status, 'ended');
});

test('same-minimum concurrent buyers serialize to one acceptance and one BID_TOO_LOW', async (t) => {
  const app = await setup(t);
  const buyerA = await app.login();
  const buyerB = await app.createBuyer();
  const clientA = socketClient(app.url, { auth: { token: buyerA }, transports: ['websocket'], reconnection: false });
  const clientB = socketClient(app.url, { auth: { token: buyerB }, transports: ['websocket'], reconnection: false });
  t.after(() => { clientA.disconnect(); clientB.disconnect(); });
  await Promise.all([once(clientA, 'connect'), once(clientB, 'connect')]);
  const join = (socket) => new Promise((resolve) => socket.timeout(1000).emit('auction:join', { auctionId: 12 }, (_error, response) => resolve(response)));
  const snapshots = [once(clientA, 'auction:snapshot'), once(clientB, 'auction:snapshot')];
  await Promise.all([join(clientA), join(clientB)]);
  await Promise.all(snapshots);
  let broadcasts = 0;
  clientA.on('bid:updated', () => { broadcasts += 1; });
  clientB.on('bid:updated', () => { broadcasts += 1; });
  const results = await Promise.all([
    app.request('/auctions/12/bids', { token: buyerA, method: 'POST', body: { amount: 2_000_000, clientRequestId: randomUUID() } }),
    app.request('/auctions/12/bids', { token: buyerB, method: 'POST', body: { amount: 2_000_000, clientRequestId: randomUUID() } }),
  ]);
  const bodies = await Promise.all(results.map((response) => response.json()));
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  assert.equal(bodies.find((body) => body.error)?.error.code, 'BID_TOO_LOW');
  await pause(30);
  assert.equal(broadcasts, 2, 'one accepted event reaches two connected clients');
  const finalDb = await app.readDb();
  assert.equal(finalDb.bids.filter((bid) => Number(bid.auctionId) === 12).length, 1);
  assert.equal(finalDb.auctions.find((auction) => Number(auction.id) === 12).version, 4);
});

test('different concurrent bid amounts are evaluated in actual serialized request order', async (t) => {
  const app = await setup(t);
  const buyerA = await app.login();
  const buyerB = await app.createBuyer();
  const results = await Promise.all([
    app.request('/auctions/12/bids', { token: buyerA, method: 'POST', body: { amount: 2_000_000, clientRequestId: randomUUID() } }),
    app.request('/auctions/12/bids', { token: buyerB, method: 'POST', body: { amount: 2_050_000, clientRequestId: randomUUID() } }),
  ]);
  const bodies = await Promise.all(results.map((response) => response.json()));
  const accepted = bodies.filter((body) => body.data?.bid);
  const rejected = bodies.filter((body) => body.error);
  assert.ok(accepted.length === 1 || accepted.length === 2);
  if (rejected.length) assert.equal(rejected[0].error.code, 'BID_TOO_LOW');
  const database = await app.readDb();
  const bids = database.bids.filter((bid) => Number(bid.auctionId) === 12);
  const auction = database.auctions.find((item) => Number(item.id) === 12);
  assert.equal(bids.length, accepted.length);
  assert.equal(auction.currentPrice, Math.max(...bids.map((bid) => bid.amount)));
  assert.equal(auction.version, 3 + accepted.length);
  const snapshot = await app.request('/auctions/12', { token: buyerA });
  assert.equal((await snapshot.json()).data.auction.bidCount, accepted.length);
});

test('bid history endpoint paginates newest-first and does not expose idempotency keys', async (t) => {
  const app = await setup(t);
  const token = await app.login();
  const db = await app.readDb();
  db.bids = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, auctionId: 12, userId: index % 2 ? 1 : 4, amount: 2_000_000 + index * 50_000,
    clientRequestId: randomUUID(), createdAt: new Date(Date.UTC(2026, 9, 14, 1, 0, index)).toISOString(),
  }));
  db.auctions.find((auction) => Number(auction.id) === 12).currentPrice = db.bids.at(-1).amount;
  await app.writeDb(db);
  const response = await app.request('/auctions/12/bids?page=2&limit=10', { token });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 10);
  assert.deepEqual(body.meta, { currentPage: 2, limit: 10, totalData: 25, totalPages: 3 });
  assert.equal(body.data[0].id, 15);
  assert.equal(body.data.at(-1).id, 6);
  assert.ok(body.data.every((bid) => !Object.hasOwn(bid, 'clientRequestId')));
});
