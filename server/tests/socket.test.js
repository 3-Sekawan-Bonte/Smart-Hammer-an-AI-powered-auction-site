const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const { createSocketServer } = require('../src/socket/createSocketServer');

const secret = 'socket-test-secret';

function makeAuction(overrides = {}) {
  return {
    id: 12,
    sellerId: 7,
    title: 'Camera',
    description: 'A camera listing with enough description.',
    condition: 'used_good',
    category: 'camera',
    productFacts: { specifications: null, defects: null, accessories: [], warranty: null },
    imageUrl: null,
    startingPrice: 1000,
    currentPrice: 1000,
    minIncrement: 100,
    durationSeconds: 60,
    startsAt: null,
    endsAt: null,
    status: 'live',
    highestBidderId: null,
    winnerId: null,
    version: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    seller: { id: 7, username: 'seller', email: 'private@example.test', password: 'private-hash' },
    highestBidder: null,
    winner: null,
    ...overrides,
  };
}

function setup() {
  const auction = makeAuction();
  const User = { async findByPk(id) { return id > 0 ? { id, username: id === 7 ? 'seller' : 'buyer' } : null; } };
  const Auction = { async findByPk(id) { return id === auction.id ? auction : null; } };
  const Bid = { async findAndCountAll() { return { count: 0, rows: [] }; } };
  const sequelize = { async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); } };
  const server = http.createServer();
  const io = createSocketServer(server, { User, Auction, Bid, sequelize }, { env: { JWT_SECRET: secret } });
  return { server, io, auction };
}

async function start(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function connect(url, token) {
  const client = createClient(url, { autoConnect: false, reconnection: false, auth: token === undefined ? {} : { token } });
  const connected = new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  client.connect();
  return { client, connected };
}

function emitAck(client, event, payload) {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

describe('Socket.IO auction synchronization', () => {
  let server;
  let io;
  let url;

  afterEach(async () => {
    if (io) await new Promise((resolve) => io.close(resolve));
    else if (server?.listening) await new Promise((resolve) => server.close(resolve));
    server = null;
    io = null;
  });

  test('authenticates JWTs and returns safe authoritative snapshots on repeated joins', async () => {
    const state = setup();
    ({ server, io } = state);
    url = await start(server);
    const token = jwt.sign({ sub: '8' }, secret, { expiresIn: '1h' });
    const { client, connected } = connect(url, token);
    await connected;
    const snapshots = [];
    client.on('auction:snapshot', (snapshot) => snapshots.push(snapshot));

    await expect(emitAck(client, 'auction:join', { auctionId: 12 })).resolves.toEqual({ ok: true, data: { auctionId: 12 } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      auctionId: 12,
      version: 3,
      data: { auction: { id: 12, version: 3, seller: { id: 7, username: 'seller' } }, bids: [], meta: { page: 1, limit: 10, total: 0 } },
    });
    expect(Number.isNaN(Date.parse(snapshots[0].serverNow))).toBe(false);
    expect(JSON.stringify(snapshots[0])).not.toContain('private@example.test');
    expect(JSON.stringify(snapshots[0])).not.toContain('private-hash');

    state.auction.version = 4;
    state.auction.currentPrice = 1200;
    await expect(emitAck(client, 'auction:join', { auctionId: 12 })).resolves.toEqual({ ok: true, data: { auctionId: 12 } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({ version: 4, data: { auction: { currentPrice: 1200 } } });

    await expect(emitAck(client, 'auction:join', { auctionId: 0 })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    await expect(emitAck(client, 'auction:join', { auctionId: 12, room: 'other' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    await expect(emitAck(client, 'auction:join', { auctionId: 999 })).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const socket = io.sockets.sockets.get(client.id);
    await socket.join('unrelated');
    await expect(emitAck(client, 'auction:leave', { auctionId: 12 })).resolves.toEqual({ ok: true, data: { auctionId: 12 } });
    await expect(emitAck(client, 'auction:leave', { auctionId: 12 })).resolves.toEqual({ ok: true, data: { auctionId: 12 } });
    expect(socket.rooms.has('auction:12')).toBe(false);
    expect(socket.rooms.has('unrelated')).toBe(true);
    client.disconnect();
  });

  test.each([
    ['missing', undefined],
    ['malformed', 'not-a-jwt'],
    ['expired', jwt.sign({ sub: '7' }, secret, { expiresIn: '-1s' })],
    ['invalid signature', jwt.sign({ sub: '7' }, 'another-secret')],
  ])('rejects %s handshake tokens', async (_label, token) => {
    ({ server, io } = setup());
    url = await start(server);
    const { client, connected } = connect(url, token);
    await expect(connected).rejects.toMatchObject({ message: 'Authentication is required.' });
    client.disconnect();
  });

  test('does not grant a non-owner access to a private draft', async () => {
    ({ server, io, auction } = setup());
    auction.status = 'draft';
    auction.sellerId = 8;
    url = await start(server);
    const token = jwt.sign({ sub: '7' }, secret, { expiresIn: '1h' });
    const { client, connected } = connect(url, token);
    await connected;
    await expect(emitAck(client, 'auction:join', { auctionId: 12 })).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(io.sockets.sockets.get(client.id).rooms.has('auction:12')).toBe(false);
    client.disconnect();
  });
});
