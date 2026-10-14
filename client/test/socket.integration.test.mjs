import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import { io as socketClient } from 'socket.io-client';
import auctionReducer, { selectActiveAuction, selectActiveBids, selectActiveAIInteractions } from '../src/features/auctions/auctionSlice.js';
import socketReducer, { selectConnectionStatus, selectRoomStatus } from '../src/features/socket/socketSlice.js';
import { disconnectSocket, getSocket, getSocketListenerCounts, getSocketRooms, initSocket, joinAuctionRoom, leaveAuctionRoom, setSocketDispatch } from '../src/lib/socket.js';
import { createMockAccessToken, createMockServer } from '../mock/start.mjs';

const fixture = fileURLToPath(new URL('../mock/db.json', import.meta.url));
const secret = randomBytes(32).toString('base64url');
const timeout = (promise, ms = 5000, label = 'operation') => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});
const once = (target, event, ms = 5000) => timeout(new Promise((resolve) => target.once(event, resolve)), ms, event);
const waitFor = (predicate, ms = 5000, label = 'condition') => timeout(new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    if (predicate()) return resolve();
    if (Date.now() - started > ms) return reject(new Error(`Timed out waiting for ${label}`));
    setTimeout(check, 20);
  };
  check();
}), ms + 100, label);

async function harness(t) {
  const directory = await mkdtemp(join(tmpdir(), 'smart-hammer-fe05-'));
  const databasePath = join(directory, 'db.json');
  await copyFile(fixture, databasePath);
  let server = createMockServer({ databasePath, jwtSecret: secret });
  const servers = [server];
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => fetch(`${url}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const login = async (email = 'demo@smart-hammer.id') => {
    const response = await request('/users/login', { method: 'POST', body: JSON.stringify({ email, password: 'smart123' }) });
    assert.equal(response.status, 200);
    return (await response.json()).data.access_token;
  };
  const restart = async () => {
    await new Promise((resolve) => server.io.close(resolve));
    server = createMockServer({ databasePath, jwtSecret: secret });
    servers.push(server);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  };
  t.after(async () => {
    disconnectSocket();
    for (const active of servers) {
      if (active.listening) await new Promise((resolve) => active.io.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, databasePath, server: () => server, request, login, restart, url, setPort: (value) => { port = value; } };
}

function waitForAck(socket, event, payload) {
  return new Promise((resolve) => socket.timeout(2000).emit(event, payload, (error, response) => resolve(error ? null : response)));
}

test('real Socket.IO validates sessions, authorizes rooms, broadcasts to two clients and shares REST state', async (t) => {
  const app = await harness(t);
  const buyerToken = await app.login();
  const sellerToken = await app.login('seller@smart-hammer.id');
  const clientA = socketClient(app.url, { auth: { token: buyerToken }, transports: ['websocket'], reconnection: false });
  const clientB = socketClient(app.url, { auth: { token: buyerToken }, transports: ['websocket'], reconnection: false });
  const unrelated = socketClient(app.url, { auth: { token: buyerToken }, transports: ['websocket'], reconnection: false });
  const seller = socketClient(app.url, { auth: { token: sellerToken }, transports: ['websocket'], reconnection: false });
  t.after(() => [clientA, clientB, unrelated, seller].forEach((client) => client.disconnect()));
  await Promise.all([once(clientA, 'connect'), once(clientB, 'connect'), once(unrelated, 'connect'), once(seller, 'connect')]);

  const snapshotA = once(clientA, 'auction:snapshot');
  const snapshotB = once(clientB, 'auction:snapshot');
  assert.deepEqual(await waitForAck(clientA, 'auction:join', { auctionId: 12 }), { ok: true, data: { auctionId: 12 } });
  assert.deepEqual(await waitForAck(clientB, 'auction:join', { auctionId: 12 }), { ok: true, data: { auctionId: 12 } });
  const [joinedSnapshotA, joinedSnapshotB] = await Promise.all([snapshotA, snapshotB]);
  assert.equal(joinedSnapshotA.auctionId, 12);
  assert.equal(joinedSnapshotA.auction.version, 3);
  assert.deepEqual(joinedSnapshotA.bidsMeta, { currentPage: 1, limit: 20, totalData: 0, totalPages: 0 });
  assert.deepEqual(joinedSnapshotA.aiMeta, { currentPage: 1, limit: 20, totalData: 0, totalPages: 0 });
  assert.equal(joinedSnapshotB.auction.currentPrice, joinedSnapshotA.auction.currentPrice);
  const otherSnapshot = once(unrelated, 'auction:snapshot');
  assert.equal((await waitForAck(unrelated, 'auction:join', { auctionId: 15 })).ok, true);
  await otherSnapshot;

  const privateDraft = await waitForAck(clientA, 'auction:join', { auctionId: 8 });
  assert.equal(privateDraft.ok, false);
  assert.equal(privateDraft.error.code, 'NOT_FOUND');
  const missing = await waitForAck(clientA, 'auction:join', { auctionId: 999 });
  assert.equal(missing.error.code, 'NOT_FOUND');
  assert.equal((await waitForAck(clientA, 'auction:join', { auctionId: 'nope' })).error.code, 'VALIDATION_ERROR');

  let unrelatedBidEvents = 0;
  unrelated.on('bid:updated', () => { unrelatedBidEvents += 1; });
  const eventA = once(clientA, 'bid:updated');
  const eventB = once(clientB, 'bid:updated');
  const simulation = await app.request('/__mock/auctions/12/duplicate-bid', { method: 'POST', headers: { Authorization: `Bearer ${buyerToken}` } });
  assert.equal(simulation.status, 200);
  const [bidA, bidB] = await Promise.all([eventA, eventB]);
  assert.equal(bidA.version, bidB.version);
  assert.equal(bidA.auction.currentPrice, bidB.auction.currentPrice);
  assert.equal(bidA.auction.bidCount, 1);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(unrelatedBidEvents, 0);
  const rest = await (await app.request('/auctions/12', { headers: { Authorization: `Bearer ${buyerToken}` } })).json();
  assert.equal(rest.data.auction.version, bidA.version);
  assert.equal(rest.data.auction.currentPrice, bidA.auction.currentPrice);
  assert.equal(rest.data.bids[0].id, bidA.bid.id);

  let priorPendingInteractionId = null;
  for (const [eventName, route] of [['ai:pending', 'ai-pending'], ['ai:message', 'ai-message'], ['ai:error', 'ai-error']]) {
    const receivedA = once(clientA, eventName);
    const receivedB = once(clientB, eventName);
    const result = await app.request(`/__mock/auctions/12/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${buyerToken}` } });
    assert.equal(result.status, 200);
    const [a, b] = await Promise.all([receivedA, receivedB]);
    assert.equal(a.data.interaction.id, b.data.interaction.id);
    assert.equal(a.data.interaction.visibility, 'private');
    if (route === 'ai-message') {
      assert.match(a.data.interaction.answer, /simulasi lokal/);
      assert.equal(a.data.interaction.id, priorPendingInteractionId);
    }
    if (route === 'ai-error') assert.equal(a.data.interaction.errorCode, 'AI_UNAVAILABLE');
    if (route === 'ai-pending') priorPendingInteractionId = a.data.interaction.id;
  }

  const privateSnapshot = once(seller, 'auction:snapshot');
  await waitForAck(seller, 'auction:join', { auctionId: 8 });
  await privateSnapshot;
  const started = once(seller, 'auction:started');
  const startResponse = await app.request('/auctions/8/start', { method: 'POST', headers: { Authorization: `Bearer ${sellerToken}` } });
  assert.equal(startResponse.status, 200);
  assert.equal((await started).auction.status, 'live');

  const ended = once(clientA, 'auction:ended');
  await app.request('/__mock/auctions/12/end', { method: 'POST', headers: { Authorization: `Bearer ${buyerToken}` } });
  const endedPayload = await ended;
  assert.equal(endedPayload.auction.status, 'ended');
  assert.equal(endedPayload.auction.winner.id, 1);
  const restEnded = await (await app.request('/auctions/12', { headers: { Authorization: `Bearer ${buyerToken}` } })).json();
  assert.equal(restEnded.data.auction.version, endedPayload.version);

  const noBidSnapshot = once(unrelated, 'auction:snapshot');
  await waitForAck(unrelated, 'auction:join', { auctionId: 13 });
  await noBidSnapshot;
  const noBidEnded = once(unrelated, 'auction:ended');
  await app.request('/__mock/auctions/13/end', { method: 'POST', headers: { Authorization: `Bearer ${buyerToken}` } });
  const noBidResult = (await noBidEnded).auction;
  assert.equal(noBidResult.status, 'ended');
  assert.equal(noBidResult.winner, null);
  assert.equal(noBidResult.highestBidder, null);
  assert.equal(noBidResult.bidCount, 0);
  assert.equal(noBidResult.finalPrice, null);
  assert.equal(noBidResult.nextMinimumBid, null);

  assert.deepEqual(await waitForAck(clientA, 'auction:leave', { auctionId: 12 }), { ok: true, data: { auctionId: 12 } });
  assert.deepEqual(await waitForAck(clientA, 'auction:leave', { auctionId: 12 }), { ok: true, data: { auctionId: 12 } });
  await waitFor(() => !app.server().io.sockets.adapter.rooms.get('auction:12')?.has(clientA.id), 1000, 'leave membership');
  assert.equal(app.server().io.sockets.adapter.rooms.get('auction:15')?.has(unrelated.id), true);
});

test('frontend service owns one connection/listener set, joins and switches rooms, handles events and rejoins after server restart', async (t) => {
  const app = await harness(t);
  const token = await app.login();
  const store = configureStore({ reducer: { auction: auctionReducer, socket: socketReducer } });
  setSocketDispatch(store.dispatch);
  const clientB = socketClient(app.url, { auth: { token }, transports: ['websocket'], reconnection: false });
  t.after(() => { clientB.disconnect(); disconnectSocket(); });
  await once(clientB, 'connect');

  const client = initSocket(token, app.url);
  assert.equal(initSocket(token, app.url), client);
  await waitFor(() => store.getState().socket.connectionStatus === 'connected', 3000, 'frontend connection');
  assert.ok(Object.values(getSocketListenerCounts()).every((count) => count === 1));
  const firstSnapshot = once(client, 'auction:snapshot');
  const joined = await joinAuctionRoom(12);
  assert.equal(joined.ok, true);
  await firstSnapshot;
  await waitFor(() => store.getState().auction.active.currentId === '12', 1000, 'Redux snapshot');
  assert.equal(selectActiveAuction(store.getState()).version >= 0, true);
  assert.equal(selectRoomStatus(store.getState()), 'joined');

  const otherSnapshot = once(clientB, 'auction:snapshot');
  await waitForAck(clientB, 'auction:join', { auctionId: 12 });
  await otherSnapshot;
  const receivedA = once(client, 'bid:updated');
  const receivedB = once(clientB, 'bid:updated');
  await app.request('/__mock/auctions/12/bid', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  await Promise.all([receivedA, receivedB]);
  await waitFor(() => selectActiveAuction(store.getState())?.version === 4, 1000, 'Redux bid event');
  assert.equal(selectActiveBids(store.getState()).length, 1);
  assert.equal(selectActiveAuction(store.getState()).bidCount, 1);

  const room15Snapshot = once(client, 'auction:snapshot');
  assert.equal((await joinAuctionRoom(15)).ok, true);
  await room15Snapshot;
  await waitFor(() => app.server().io.sockets.adapter.rooms.get('auction:15')?.has(client.id), 1000, 'new room join');
  assert.equal(app.server().io.sockets.adapter.rooms.get('auction:12')?.has(client.id) || false, false);
  await leaveAuctionRoom(15);
  await waitFor(() => !app.server().io.sockets.adapter.rooms.get('auction:15')?.has(client.id), 1000, 'new room leave');

  const rejoinSnapshot = once(client, 'auction:snapshot');
  assert.equal((await joinAuctionRoom(12)).ok, true);
  await rejoinSnapshot;
  const reconnect = once(client, 'connect', 7000);
  await app.restart();
  await reconnect;
  await waitFor(() => app.server().io.sockets.adapter.rooms.get('auction:12')?.has(client.id), 7000, 'rejoin after server restart');
  await waitFor(() => selectRoomStatus(store.getState()) === 'joined', 3000, 'room state after reconnect');
  assert.equal(selectConnectionStatus(store.getState()), 'connected');
  assert.equal(getSocketRooms().desiredRoom, '12');
  assert.equal(getSocketRooms().joinedRoom, '12');
  assert.ok(Object.values(getSocketListenerCounts()).every((count) => count === 1));

  const rapidA = joinAuctionRoom(12);
  const rapidB = joinAuctionRoom(15);
  const rapidC = joinAuctionRoom(12);
  const [, , rapidResult] = await Promise.all([rapidA, rapidB, rapidC]);
  assert.equal(rapidResult.ok, true);
  await waitFor(() => app.server().io.sockets.adapter.rooms.get('auction:12')?.has(client.id), 1000, 'rapid switch final room');
  assert.equal(app.server().io.sockets.adapter.rooms.get('auction:15')?.has(client.id) || false, false);

  const sellerToken = await app.login('seller@smart-hammer.id');
  const previousClient = client;
  const replacementClient = initSocket(sellerToken, app.url);
  assert.notEqual(replacementClient, previousClient);
  await waitFor(() => replacementClient.connected && app.server().io.sockets.sockets.get(replacementClient.id)?.data.userId === 2, 3000, 'replacement account authentication');
  const replacementSnapshot = once(replacementClient, 'auction:snapshot');
  assert.equal((await joinAuctionRoom(8)).ok, true);
  await replacementSnapshot;
  assert.equal(getSocketRooms().desiredRoom, '8');
  assert.equal(app.server().io.sockets.adapter.rooms.get('auction:8')?.has(replacementClient.id), true);
  assert.equal(app.server().io.sockets.adapter.rooms.get('auction:12')?.has(previousClient.id) || false, false);
  assert.ok(Object.values(getSocketListenerCounts()).every((count) => count === 1));

  disconnectSocket();
  assert.equal(getSocket(), null);
  assert.equal(selectActiveAIInteractions(store.getState()).length, 0);
});

test('Socket.IO rejects missing, malformed, and expired mock JWTs; mock controls are development-only', async (t) => {
  const app = await harness(t);
  const missing = socketClient(app.url, { transports: ['websocket'], reconnection: false });
  const invalid = socketClient(app.url, { auth: { token: 'not-a-jwt' }, transports: ['websocket'], reconnection: false });
  const expiredToken = createMockAccessToken(1, secret, Date.now() - 86_401_000);
  const expired = socketClient(app.url, { auth: { token: expiredToken }, transports: ['websocket'], reconnection: false });
  t.after(() => [missing, invalid, expired].forEach((client) => client.disconnect()));
  const [missingError, invalidError, expiredError] = await Promise.all([
    once(missing, 'connect_error'), once(invalid, 'connect_error'), once(expired, 'connect_error'),
  ]);
  for (const error of [missingError, invalidError, expiredError]) {
    assert.equal(error.message, 'Unauthorized');
    assert.equal(error.data.code, 'UNAUTHORIZED');
  }
  const token = await app.login();
  const productionServer = createMockServer({ databasePath: app.databasePath, jwtSecret: secret, environment: 'production' });
  const port = await new Promise((resolve, reject) => { productionServer.once('error', reject); productionServer.listen(0, '127.0.0.1', () => resolve(productionServer.address().port)); });
  t.after(() => new Promise((resolve) => productionServer.io.close(resolve)));
  const blocked = await fetch(`http://127.0.0.1:${port}/__mock/auctions/12/bid`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(blocked.status, 404);
});

test('mock server reports an occupied port without an unhandled listen error', async (t) => {
  const blocker = createNetServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = blocker.address().port;
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const moduleUrl = new URL('../mock/start.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import { startMockServer } from ${JSON.stringify(moduleUrl)}; startMockServer({ port: ${port} });`], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, BIDWAR_MOCK_DB: join(tmpdir(), `fe05-port-${randomBytes(5).toString('hex')}.json`) },
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const exit = await timeout(new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  }), 3000, 'port conflict process exit');
  assert.equal(exit, 1);
  assert.match(output, /Port mock \d+ sudah digunakan/);
});
