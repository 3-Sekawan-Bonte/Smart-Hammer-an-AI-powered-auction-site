import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMockServer } from '../mock/start.mjs';

const fixturePath = fileURLToPath(new URL('../mock/db.json', import.meta.url));

async function createHarness(t) {
  const directory = await mkdtemp(join(tmpdir(), 'smart-hammer-fe01-'));
  const databasePath = join(directory, 'db.json');
  await copyFile(fixturePath, databasePath);
  const server = createMockServer({ databasePath });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const login = async (email = 'demo@smart-hammer.id', password = 'smart123') => {
    const response = await request('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).data.access_token;
  };
  return { request, login };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('register returns only the new user; login and session restoration use the documented envelope', async (t) => {
  const { request } = await createHarness(t);
  const registration = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username: '  Buyer Test ', email: 'NEW.USER@EXAMPLE.COM', password: 'DemoPass123!' }),
  });
  assert.equal(registration.status, 201);
  const registeredBody = await registration.json();
  assert.deepEqual(registeredBody.data.user, { id: 5, username: 'Buyer Test', email: 'new.user@example.com' });
  assert.equal('access_token' in registeredBody.data, false);
  assert.equal('password' in registeredBody.data.user, false);

  const anonymousProfile = await request('/users/me');
  assert.equal(anonymousProfile.status, 401);
  const loginResponse = await request('/users/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'NEW.USER@EXAMPLE.COM', password: 'DemoPass123!' }),
  });
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.data.user.id, 5);
  assert.equal(loginBody.data.tokenType, 'Bearer');
  assert.equal(loginBody.data.expiresIn, 86400);
  assert.match(loginBody.data.access_token, /^mock-user-5$/);

  const profile = await request('/users/me', { headers: auth(loginBody.data.access_token) });
  assert.deepEqual((await profile.json()).data.user, registeredBody.data.user);
});

test('auth rejects invalid input and returns the same credential error for unknown users', async (t) => {
  const { request } = await createHarness(t);
  const invalid = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'x', email: 'bad', password: 'short' }),
  });
  const invalidBody = await invalid.json();
  assert.equal(invalid.status, 400);
  assert.equal(invalidBody.error.code, 'VALIDATION_ERROR');
  assert.ok(invalidBody.error.fields.email);
  assert.ok(invalidBody.error.fields.password);
  assert.deepEqual(invalidBody.error.details, {});

  const duplicate = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'Another Buyer', email: 'DEMO@SMART-HAMMER.ID', password: 'DemoPass123!' }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'EMAIL_EXISTS');

  for (const credentials of [
    { email: 'unknown@example.com', password: 'DemoPass123!' },
    { email: 'demo@smart-hammer.id', password: 'incorrect1' },
  ]) {
    const response = await request('/users/login', { method: 'POST', body: JSON.stringify(credentials) });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(body.message, 'Email atau password salah.');
  }
});

test('auction list requires auth and returns paginated contract objects without private data', async (t) => {
  const { request, login } = await createHarness(t);
  const unauthenticated = await request('/auctions');
  assert.equal(unauthenticated.status, 401);

  const token = await login();
  const response = await request('/auctions?status=live&page=1&limit=2', { headers: auth(token) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message, 'Daftar lelang berhasil diambil.');
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.meta, { currentPage: 1, limit: 2, totalData: 6, totalPages: 3 });
  assert.equal(body.data[0].category, 'electronics');
  assert.deepEqual(body.data[0].seller, { id: 2, username: 'rania.shop' });
  assert.equal(body.data[0].bidCount, 0);
  assert.equal(body.data[0].currentPrice, body.data[0].startingPrice);
  assert.equal(body.data[0].nextMinimumBid, body.data[0].startingPrice);
  assert.ok(Array.isArray(body.data[0].productFacts.accessories));
  assert.equal('password' in body.data[0], false);
  assert.equal(JSON.stringify(body).includes('smart123'), false);

  const emptyPage = await request('/auctions?status=live&page=99&limit=2', { headers: auth(token) });
  const emptyBody = await emptyPage.json();
  assert.equal(emptyPage.status, 200);
  assert.deepEqual(emptyBody.data, []);
  assert.equal(emptyBody.meta.totalPages, 3);
  const ended = await request('/auctions?status=ended', { headers: auth(token) });
  const endedBody = await ended.json();
  assert.equal(endedBody.data.length, 1);
  assert.equal(endedBody.data[0].status, 'ended');
  const invalidQuery = await request('/auctions?limit=0', { headers: auth(token) });
  assert.equal(invalidQuery.status, 400);
});

test('auction snapshot uses consistent nested shapes and missing resources return contract errors', async (t) => {
  const { request, login } = await createHarness(t);
  const token = await login();
  const response = await request('/auctions/12', { headers: auth(token) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.data.serverNow, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(body.data.auction.id, 12);
  assert.deepEqual(body.data.auction.seller, { id: 2, username: 'rania.shop' });
  assert.deepEqual(body.data.bids, []);
  assert.deepEqual(body.data.aiInteractions, []);
  assert.deepEqual(body.data.bidsMeta, { currentPage: 1, limit: 20, totalData: 0, totalPages: 0 });
  assert.deepEqual(body.data.aiMeta, { currentPage: 1, limit: 20, totalData: 0, totalPages: 0 });

  const missing = await request('/auctions/9999', { headers: auth(token) });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  const invalid = await request('/auctions/12oops', { headers: auth(token) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});

test('draft creation applies contract defaults, validates fields, and protects owner-only drafts', async (t) => {
  const { request, login } = await createHarness(t);
  const sellerToken = await login('seller@smart-hammer.id', 'smart123');
  const payload = {
    title: '  Headphone Test  ',
    description: '  Sample condition description.  ',
    condition: 'used_good',
    category: 'wrong-category-is-ignored',
    productFacts: { specifications: 'Wireless', accessories: ['Case'], warranty: null },
    imageUrl: 'https://example.com/test.jpg',
    startingPrice: 250000,
    minIncrement: 10000,
    durationSeconds: 180,
  };
  const response = await request('/auctions', { method: 'POST', headers: auth(sellerToken), body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  const created = (await response.json()).data.auction;
  assert.ok(Number.isInteger(created.id) && created.id > 0);
  assert.deepEqual(created.seller, { id: 2, username: 'rania.shop' });
  assert.equal(created.title, 'Headphone Test');
  assert.equal(created.category, 'electronics');
  assert.equal(created.status, 'draft');
  assert.equal(created.currentPrice, 250000);
  assert.equal(created.bidCount, 0);
  assert.equal(created.startsAt, null);
  assert.equal(created.endsAt, null);
  assert.equal(created.nextMinimumBid, null);
  assert.equal(created.highestBidder, null);
  assert.equal(created.winner, null);
  assert.equal(created.finalPrice, null);
  assert.deepEqual(created.productFacts, { specifications: 'Wireless', defects: null, accessories: ['Case'], warranty: null });
  assert.match(created.createdAt, /^\d{4}-\d\d-\d\dT.*Z$/);

  const ownSnapshot = await request(`/auctions/${created.id}`, { headers: auth(sellerToken) });
  assert.equal(ownSnapshot.status, 200);
  const buyerToken = await login();
  const hiddenDraft = await request(`/auctions/${created.id}`, { headers: auth(buyerToken) });
  assert.equal(hiddenDraft.status, 404);
  const list = await request('/auctions', { headers: auth(sellerToken) });
  assert.equal((await list.json()).data.some((auction) => auction.id === created.id), false);

  const invalid = await request('/auctions', {
    method: 'POST', headers: auth(sellerToken),
    body: JSON.stringify({ ...payload, sellerId: 2 }),
  });
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error.fields.sellerId);
  const invalidImage = await request('/auctions', {
    method: 'POST', headers: auth(sellerToken),
    body: JSON.stringify({ ...payload, imageUrl: 'http://example.com/image.jpg' }),
  });
  assert.equal(invalidImage.status, 400);
});

test('unsupported bidding, AI, and start actions are explicit and do not mutate mock state', async (t) => {
  const { request, login } = await createHarness(t);
  const token = await login();
  for (const path of ['/auctions/12/bids', '/auctions/12/ai/questions', '/auctions/12/start']) {
    const response = await request(path, { method: 'POST', headers: auth(token), body: JSON.stringify({ amount: 2100000 }) });
    assert.equal(response.status, 501);
    assert.equal((await response.json()).error.code, 'NOT_IMPLEMENTED');
  }
  const snapshot = await request('/auctions/12', { headers: auth(token) });
  const body = await snapshot.json();
  assert.equal(body.data.auction.bidCount, 0);
  assert.deepEqual(body.data.bids, []);
  assert.deepEqual(body.data.aiInteractions, []);
});

test('generic user collection access cannot expose mock passwords', async (t) => {
  const { request, login } = await createHarness(t);
  const token = await login();
  for (const path of ['/users', '/users/1', '/bids', '/aiInteractions']) {
    const response = await request(path, { headers: auth(token) });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
});
