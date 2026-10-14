import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { io as socketClient } from 'socket.io-client';
import { createMockServer } from '../mock/start.mjs';

const fixture = fileURLToPath(new URL('../mock/db.json', import.meta.url));
const secret = randomBytes(32).toString('base64url');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, label, timeoutMs = 2000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (predicate()) return;
    await pause(10);
  }
  assert.fail(`Timed out waiting for ${label}`);
};
const once = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2000);
  socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});

async function harness(t, { clock = () => Date.now(), schedulerIntervalMs = 60_000, mutateDatabase } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'smart-hammer-fe07-'));
  const databasePath = join(directory, 'db.json');
  await copyFile(fixture, databasePath);
  if (mutateDatabase) {
    const database = JSON.parse(await readFile(databasePath, 'utf8'));
    mutateDatabase(database);
    await writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`);
  }
  const server = createMockServer({ databasePath, jwtSecret: secret, clock, schedulerIntervalMs });
  await server.ready;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, body, method = 'GET') => fetch(`${url}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const login = async (email = 'demo@smart-hammer.id') => {
    const response = await request('/users/login', null, { email, password: 'smart123' }, 'POST');
    assert.equal(response.status, 200);
    return (await response.json()).data.access_token;
  };
  t.after(async () => {
    await new Promise((resolve) => server.io.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { databasePath, login, request, server, url };
}

test('startup recovery closes persisted expired auctions with and without bids', async (t) => {
  const now = Date.parse('2026-10-14T10:00:00.000Z');
  const app = await harness(t, {
    clock: () => now,
    mutateDatabase(database) {
      const withBid = database.auctions.find((auction) => auction.id === 12);
      withBid.endsAt = new Date(now - 1000).toISOString();
      withBid.version = 8;
      withBid.currentPrice = 2_250_000;
      withBid.highestBidderId = 1;
      database.bids.push({ id: 90, auctionId: 12, userId: 1, amount: 2_250_000, createdAt: new Date(now - 5000).toISOString() });
      const noBid = database.auctions.find((auction) => auction.id === 13);
      noBid.endsAt = new Date(now - 1000).toISOString();
      noBid.version = 3;
    },
  });
  const token = await app.login();
  const [withBidResponse, noBidResponse] = await Promise.all([
    app.request('/auctions/12', token), app.request('/auctions/13', token),
  ]);
  const withBid = (await withBidResponse.json()).data.auction;
  const noBid = (await noBidResponse.json()).data.auction;
  assert.equal(withBid.status, 'ended');
  assert.equal(withBid.version, 9);
  assert.deepEqual(withBid.winner, { id: 1, username: 'demo.bidder' });
  assert.equal(withBid.finalPrice, 2_250_000);
  assert.equal(noBid.status, 'ended');
  assert.equal(noBid.version, 4);
  assert.equal(noBid.winner, null);
  assert.equal(noBid.highestBidder, null);
  assert.equal(noBid.finalPrice, null);
  assert.equal(noBid.nextMinimumBid, null);
});

test('periodic closure broadcasts one authoritative result to both room clients and is idempotent', async (t) => {
  let now = Date.parse('2026-10-14T10:00:00.000Z');
  const app = await harness(t, {
    clock: () => now,
    schedulerIntervalMs: 10,
    mutateDatabase(database) {
      const auction = database.auctions.find((item) => item.id === 12);
      auction.endsAt = new Date(now + 20).toISOString();
      auction.version = 8;
      auction.currentPrice = 2_300_000;
      auction.highestBidderId = 1;
      database.bids.push({ id: 91, auctionId: 12, userId: 1, amount: 2_300_000, createdAt: new Date(now - 1000).toISOString() });
    },
  });
  const token = await app.login();
  const clients = [0, 1].map(() => socketClient(app.url, { auth: { token }, transports: ['websocket'], reconnection: false }));
  t.after(() => clients.forEach((client) => client.disconnect()));
  await Promise.all(clients.map((client) => once(client, 'connect')));
  for (const client of clients) {
    const snapshot = once(client, 'auction:snapshot');
    await new Promise((resolve) => client.timeout(1000).emit('auction:join', { auctionId: 12 }, resolve));
    await snapshot;
  }
  const endedA = once(clients[0], 'auction:ended');
  const endedB = once(clients[1], 'auction:ended');
  now += 21;
  const [eventA, eventB] = await Promise.all([endedA, endedB]);
  assert.deepEqual(eventA, eventB);
  assert.equal(eventA.version, 9);
  assert.equal(eventA.auction.status, 'ended');
  assert.deepEqual(eventA.auction.winner, { id: 1, username: 'demo.bidder' });
  assert.equal(eventA.auction.finalPrice, 2_300_000);
  assert.equal(eventA.auction.nextMinimumBid, null);
  let duplicateEvents = 0;
  clients[0].on('auction:ended', () => { duplicateEvents += 1; });
  await Promise.all([app.server.closeExpiredAuctions(), app.server.closeExpiredAuctions()]);
  await pause(30);
  assert.equal(duplicateEvents, 0);
  assert.equal((await (await app.request('/auctions/12', token)).json()).data.auction.version, 9);
});

test('read-time closure finalizes an expired live auction even before a scheduler scan', async (t) => {
  const now = Date.parse('2026-10-14T10:00:00.000Z');
  const app = await harness(t, {
    clock: () => now,
    mutateDatabase(database) { database.auctions.find((auction) => auction.id === 12).endsAt = new Date(now + 60_000).toISOString(); },
  });
  const token = await app.login();
  const db = JSON.parse(await readFile(app.databasePath, 'utf8'));
  db.auctions.find((auction) => auction.id === 12).endsAt = new Date(now - 1).toISOString();
  await writeFile(app.databasePath, `${JSON.stringify(db, null, 2)}\n`);
  const response = await app.request('/auctions/12', token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.auction.status, 'ended');
});

test('accepted bid extends deadline; old deadline stays live, then bid and closure race resolves ended once', async (t) => {
  let now = Date.parse('2026-10-14T10:00:00.000Z');
  let originalDeadline;
  const app = await harness(t, {
    clock: () => now,
    mutateDatabase(database) {
      const auction = database.auctions.find((item) => item.id === 12);
      originalDeadline = now + 5000;
      auction.endsAt = new Date(originalDeadline).toISOString();
    },
  });
  const token = await app.login();
  const bidResponse = await app.request('/auctions/12/bids', token, { amount: 2_000_000, clientRequestId: randomUUID() }, 'POST');
  assert.equal(bidResponse.status, 201);
  const bidResult = (await bidResponse.json()).data;
  assert.equal(Date.parse(bidResult.auction.endsAt), now + 3_600_000);
  now = originalDeadline + 1;
  await app.server.closeExpiredAuctions();
  const stillLive = (await (await app.request('/auctions/12', token)).json()).data.auction;
  assert.equal(stillLive.status, 'live');
  assert.equal(stillLive.endsAt, bidResult.auction.endsAt);

  now = Date.parse(stillLive.endsAt);
  const bidAndClose = await Promise.all([
    app.request('/auctions/12/bids', token, { amount: 2_050_000, clientRequestId: randomUUID() }, 'POST'),
    app.server.closeExpiredAuctions(),
    app.server.closeExpiredAuctions(),
  ]);
  const racedBidResponse = bidAndClose[0];
  assert.equal(racedBidResponse.status, 409);
  assert.equal((await racedBidResponse.json()).error.code, 'AUCTION_ENDED');
  const result = (await (await app.request('/auctions/12', token)).json()).data.auction;
  assert.equal(result.status, 'ended');
  assert.equal(result.winner.id, 1);
  assert.equal(result.finalPrice, 2_000_000);
  assert.equal(result.version, stillLive.version + 1);
});

test('backend restart recovers from the same persisted mock file and does not close twice', async (t) => {
  let now = Date.parse('2026-10-14T10:00:00.000Z');
  const directory = await mkdtemp(join(tmpdir(), 'smart-hammer-fe07-restart-'));
  const databasePath = join(directory, 'db.json');
  await copyFile(fixture, databasePath);
  const first = createMockServer({ databasePath, jwtSecret: secret, clock: () => now, schedulerIntervalMs: 60_000 });
  await first.ready;
  await new Promise((resolve, reject) => { first.once('error', reject); first.listen(0, '127.0.0.1', resolve); });
  const db = JSON.parse(await readFile(databasePath, 'utf8'));
  const auction = db.auctions.find((item) => item.id === 12);
  auction.endsAt = new Date(now + 1000).toISOString();
  auction.version = 4;
  await writeFile(databasePath, `${JSON.stringify(db, null, 2)}\n`);
  await new Promise((resolve) => first.io.close(resolve));

  now += 2000;
  const recovered = createMockServer({ databasePath, jwtSecret: secret, clock: () => now, schedulerIntervalMs: 60_000 });
  t.after(async () => { if (recovered.listening) await new Promise((resolve) => recovered.io.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  await recovered.ready;
  const persisted = JSON.parse(await readFile(databasePath, 'utf8')).auctions.find((item) => item.id === 12);
  assert.equal(persisted.status, 'ended');
  assert.equal(persisted.version, 5);
  await recovered.closeExpiredAuctions();
  assert.equal(JSON.parse(await readFile(databasePath, 'utf8')).auctions.find((item) => item.id === 12).version, 5);
});
