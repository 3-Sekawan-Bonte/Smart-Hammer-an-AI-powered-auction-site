import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDatabasePath = fileURLToPath(new URL('./db.json', import.meta.url));
const defaultPort = Number(process.env.BIDWAR_MOCK_PORT || 3001);
const MAX_AMOUNT = 2_000_000_000;
const CONDITIONS = new Set(['new', 'used_good', 'used_fair']);
const AUCTION_FIELDS = new Set([
  'title', 'description', 'condition', 'category', 'productFacts', 'imageUrl',
  'startingPrice', 'minIncrement', 'durationSeconds',
]);

async function readDatabase(databasePath) {
  return JSON.parse(await readFile(databasePath, 'utf8'));
}

async function saveDatabase(databasePath, database) {
  await writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
}

function send(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(status === 204 ? '' : JSON.stringify(body));
}

function errorResponse(response, status, code, message, fields = {}, details = {}) {
  return send(response, status, { message, error: { code, fields, details } });
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request terlalu besar.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Body harus berupa object JSON.');
    return body;
  } catch {
    throw Object.assign(new Error('Body harus berupa JSON yang valid.'), { statusCode: 400 });
  }
}

function publicUser(user) {
  return user ? { id: Number(user.id), username: user.username } : null;
}

function selfUser(user) {
  return user ? { ...publicUser(user), email: user.email } : null;
}

function getCurrentUser(database, request) {
  const match = /^Bearer mock-user-(\d+)$/.exec(request.headers.authorization || '');
  if (!match) return null;
  return database.users.find((user) => Number(user.id) === Number(match[1])) || null;
}

function isOwner(auction, user) {
  return Number(auction.sellerId ?? auction.seller?.id) === Number(user?.id);
}

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value || '')) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function paginate(items, searchParams, defaultLimit = 10) {
  const allowed = new Set(['page', 'limit']);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) return { error: 'Query parameter tidak dikenal.' };
  }
  const pageValue = searchParams.get('page') ?? '1';
  const limitValue = searchParams.get('limit') ?? String(defaultLimit);
  if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
    return { error: 'page dan limit harus berupa integer positif.' };
  }
  const page = Number(pageValue);
  const limit = Number(limitValue);
  if (!Number.isSafeInteger(page) || limit > 50) return { error: 'page terlalu besar atau limit melebihi 50.' };
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    meta: { currentPage: page, limit, totalData: items.length, totalPages: Math.ceil(items.length / limit) },
  };
}

function serializeAuction(database, auction) {
  const seller = database.users.find((user) => Number(user.id) === Number(auction.sellerId ?? auction.seller?.id))
    ?? (auction.seller && typeof auction.seller === 'object' ? auction.seller : null);
  const bids = database.bids.filter((bid) => Number(bid.auctionId) === Number(auction.id));
  const bidCount = bids.length;
  const currentPrice = bidCount ? Number(auction.currentPrice) : Number(auction.startingPrice);
  const highestBidderId = bidCount ? (auction.highestBidderId ?? bids.at(-1)?.userId ?? null) : null;
  const highestBidder = database.users.find((user) => Number(user.id) === Number(highestBidderId));
  const winnerId = auction.status === 'ended' ? (auction.winnerId ?? highestBidderId) : null;
  const winner = database.users.find((user) => Number(user.id) === Number(winnerId));
  const facts = auction.productFacts ?? {};
  return {
    id: Number(auction.id),
    seller: publicUser(seller),
    title: auction.title,
    description: auction.description,
    condition: auction.condition,
    category: 'electronics',
    productFacts: {
      specifications: facts.specifications ?? null,
      defects: facts.defects ?? null,
      accessories: Array.isArray(facts.accessories) ? facts.accessories : [],
      warranty: facts.warranty ?? null,
    },
    imageUrl: auction.imageUrl ?? null,
    startingPrice: Number(auction.startingPrice),
    currentPrice,
    minIncrement: Number(auction.minIncrement),
    nextMinimumBid: auction.status === 'draft' || auction.status === 'ended'
      ? null
      : bidCount ? currentPrice + Number(auction.minIncrement) : Number(auction.startingPrice),
    bidCount,
    durationSeconds: Number(auction.durationSeconds),
    startsAt: auction.startsAt ?? null,
    endsAt: auction.endsAt ?? null,
    status: auction.status,
    highestBidder: publicUser(highestBidder),
    winner: publicUser(winner),
    finalPrice: auction.status === 'ended' && bidCount ? currentPrice : null,
    version: Number(auction.version ?? 0),
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt ?? auction.createdAt,
  };
}

function serializeBid(database, bid) {
  const bidder = database.users.find((user) => Number(user.id) === Number(bid.userId));
  return {
    id: Number(bid.id),
    auctionId: Number(bid.auctionId),
    bidder: publicUser(bidder),
    amount: Number(bid.amount),
    createdAt: bid.createdAt,
  };
}

function validateAuthBody(body, registerMode = false) {
  const allowed = registerMode ? new Set(['username', 'email', 'password']) : new Set(['email', 'password']);
  const fields = {};
  for (const key of Object.keys(body)) if (!allowed.has(key)) fields[key] = 'Field tidak diizinkan.';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) fields.email = 'Email tidak valid.';
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) fields.password = 'Password harus 8–72 byte.';
  let username;
  if (registerMode) {
    username = typeof body.username === 'string' ? body.username.trim() : '';
    if (username.length < 2 || username.length > 40) fields.username = 'Username harus 2–40 karakter.';
  }
  return { fields, email, password, username };
}

function validateAuctionBody(body, isUpdate = false) {
  const fields = {};
  for (const key of Object.keys(body)) if (!AUCTION_FIELDS.has(key)) fields[key] = 'Field tidak diizinkan.';
  if (!isUpdate || Object.hasOwn(body, 'title')) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 3 || title.length > 120) fields.title = 'Judul harus 3–120 karakter.';
  }
  if (!isUpdate || Object.hasOwn(body, 'description')) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length < 10 || description.length > 3000) fields.description = 'Deskripsi harus 10–3000 karakter.';
  }
  if (!isUpdate || Object.hasOwn(body, 'condition')) {
    if (!CONDITIONS.has(body.condition)) fields.condition = 'Kondisi tidak valid.';
  }
  if (!isUpdate || Object.hasOwn(body, 'imageUrl')) {
    try {
      if (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2048 || new URL(body.imageUrl).protocol !== 'https:') {
        fields.imageUrl = 'Gunakan URL gambar HTTPS maksimal 2048 karakter.';
      }
    } catch {
      fields.imageUrl = 'Gunakan URL gambar HTTPS yang valid.';
    }
  }
  for (const key of ['startingPrice', 'minIncrement']) {
    if ((!isUpdate || Object.hasOwn(body, key)) && (!Number.isSafeInteger(body[key]) || body[key] < 1 || body[key] > MAX_AMOUNT)) {
      fields[key] = `Harus integer rupiah 1–${MAX_AMOUNT}.`;
    }
  }
  if ((!isUpdate || Object.hasOwn(body, 'durationSeconds')) &&
      (!Number.isSafeInteger(body.durationSeconds) || body.durationSeconds < 60 || body.durationSeconds > 86400)) {
    fields.durationSeconds = 'Durasi harus integer 60–86400 detik.';
  }
  if (!isUpdate || Object.hasOwn(body, 'productFacts')) {
    const facts = body.productFacts;
    if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
      fields.productFacts = 'Fakta produk harus berupa object.';
    } else {
      const allowedFacts = new Set(['specifications', 'defects', 'accessories', 'warranty']);
      for (const key of Object.keys(facts)) if (!allowedFacts.has(key)) fields[`productFacts.${key}`] = 'Field tidak diizinkan.';
      for (const [key, max] of [['specifications', 2000], ['defects', 1000], ['warranty', 500]]) {
        const value = facts[key];
        if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > max)) {
          fields[`productFacts.${key}`] = `Harus teks maksimal ${max} karakter atau null.`;
        }
      }
      if (facts.accessories !== undefined && (!Array.isArray(facts.accessories) || facts.accessories.length > 10 ||
          facts.accessories.some((item) => typeof item !== 'string' || item.trim().length > 100))) {
        fields['productFacts.accessories'] = 'Maksimal 10 aksesori berupa teks hingga 100 karakter.';
      }
    }
  }
  return fields;
}

function normalizeFacts(facts = {}) {
  return {
    specifications: typeof facts.specifications === 'string' ? facts.specifications.trim() || null : null,
    defects: typeof facts.defects === 'string' ? facts.defects.trim() || null : null,
    accessories: (facts.accessories ?? []).map((item) => item.trim()).filter(Boolean),
    warranty: typeof facts.warranty === 'string' ? facts.warranty.trim() || null : null,
  };
}

export function createMockServer({ databasePath = defaultDatabasePath } = {}) {
  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return send(response, 204);
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const database = await readDatabase(databasePath);

      if (pathname === '/users/register' && request.method === 'POST') {
        const body = await readBody(request);
        const { fields, email, password, username } = validateAuthBody(body, true);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Data registrasi tidak valid.', fields);
        if (database.users.some((user) => user.email.toLowerCase() === email)) {
          return errorResponse(response, 409, 'EMAIL_EXISTS', 'Email sudah terdaftar.', { email: 'Email sudah terdaftar.' });
        }
        const id = Math.max(0, ...database.users.map((user) => Number(user.id) || 0)) + 1;
        const user = { id, username, email, password, createdAt: new Date().toISOString() };
        database.users.push(user);
        await saveDatabase(databasePath, database);
        return send(response, 201, { message: 'Register berhasil.', data: { user: selfUser(user) } });
      }

      if (pathname === '/users/login' && request.method === 'POST') {
        const body = await readBody(request);
        const { fields, email, password } = validateAuthBody(body);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Email dan password wajib diisi.', fields);
        const user = database.users.find((entry) => entry.email.toLowerCase() === email && entry.password === password);
        if (!user) return errorResponse(response, 401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
        return send(response, 200, {
          message: 'Login berhasil.',
          data: { access_token: `mock-user-${user.id}`, tokenType: 'Bearer', expiresIn: 86400, user: selfUser(user) },
        });
      }

      const currentUser = getCurrentUser(database, request);
      if (!currentUser) return errorResponse(response, 401, 'UNAUTHORIZED', 'Silakan login untuk melanjutkan.');

      if (pathname === '/users/me' && request.method === 'GET') {
        return send(response, 200, { message: 'Profil berhasil diambil.', data: { user: selfUser(currentUser) } });
      }

      if (pathname === '/auctions' && request.method === 'GET') {
        const allowedQueries = new Set(['page', 'limit', 'status', 'search', 'sortBy', 'sort']);
        const unknown = [...url.searchParams.keys()].find((key) => !allowedQueries.has(key));
        if (unknown) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Query tidak valid.', { [unknown]: 'Query tidak dikenal.' });
        const status = url.searchParams.get('status');
        const sortBy = url.searchParams.get('sortBy') ?? 'createdAt';
        const sort = (url.searchParams.get('sort') ?? 'DESC').toUpperCase();
        const search = (url.searchParams.get('search') ?? '').trim();
        if (status && !['live', 'ended'].includes(status)) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Status tidak valid.', { status: 'Pilih live atau ended.' });
        if (!['createdAt', 'currentPrice', 'endsAt'].includes(sortBy) || !['ASC', 'DESC'].includes(sort)) {
          return errorResponse(response, 400, 'VALIDATION_ERROR', 'Urutan tidak valid.', { sortBy: 'Urutan tidak didukung.' });
        }
        if (search.length > 100) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Pencarian terlalu panjang.', { search: 'Maksimal 100 karakter.' });
        let auctions = database.auctions.filter((auction) => ['live', 'ended'].includes(auction.status));
        if (status) auctions = auctions.filter((auction) => auction.status === status);
        if (search) auctions = auctions.filter((auction) => `${auction.title} ${auction.description}`.toLowerCase().includes(search.toLowerCase()));
        auctions.sort((left, right) => {
          const a = sortBy === 'currentPrice' ? Number(left.currentPrice) : Date.parse(left[sortBy] || 0);
          const b = sortBy === 'currentPrice' ? Number(right.currentPrice) : Date.parse(right[sortBy] || 0);
          return (a - b) * (sort === 'ASC' ? 1 : -1);
        });
        const page = paginate(auctions, new URLSearchParams([...url.searchParams].filter(([key]) => ['page', 'limit'].includes(key))), 10);
        if (page.error) return errorResponse(response, 400, 'VALIDATION_ERROR', page.error);
        return send(response, 200, {
          message: 'Daftar lelang berhasil diambil.',
          data: page.data.map((auction) => serializeAuction(database, auction)),
          meta: page.meta,
        });
      }

      if (pathname === '/auctions' && request.method === 'POST') {
        const body = await readBody(request);
        const fields = validateAuctionBody(body);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Data lelang tidak valid.', fields);
        const now = new Date().toISOString();
        const id = Math.max(0, ...database.auctions.map((auction) => Number(auction.id) || 0)) + 1;
        const auction = {
          id,
          sellerId: Number(currentUser.id),
          title: body.title.trim(),
          description: body.description.trim(),
          condition: body.condition,
          category: 'electronics',
          productFacts: normalizeFacts(body.productFacts),
          imageUrl: body.imageUrl.trim(),
          startingPrice: body.startingPrice,
          currentPrice: body.startingPrice,
          minIncrement: body.minIncrement,
          durationSeconds: body.durationSeconds,
          startsAt: null,
          endsAt: null,
          status: 'draft',
          highestBidderId: null,
          winnerId: null,
          version: 0,
          bidCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        database.auctions.push(auction);
        await saveDatabase(databasePath, database);
        return send(response, 201, { message: 'Draft lelang dibuat.', data: { auction: serializeAuction(database, auction) } });
      }

      const auctionMatch = /^\/auctions\/([^/]+)$/.exec(pathname);
      if (auctionMatch && request.method === 'GET') {
        const id = parseId(auctionMatch[1]);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        const auction = database.auctions.find((entry) => Number(entry.id) === id);
        if (!auction || (auction.status === 'draft' && !isOwner(auction, currentUser))) {
          return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        }
        const bids = database.bids
          .filter((bid) => Number(bid.auctionId) === id)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
        const aiInteractions = database.aiInteractions
          .filter((item) => Number(item.auctionId) === id && item.visibility === 'public')
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
        const bidPage = paginate(bids, url.searchParams, 20);
        if (bidPage.error) return errorResponse(response, 400, 'VALIDATION_ERROR', bidPage.error);
        const aiPage = paginate(aiInteractions, url.searchParams, 20);
        if (aiPage.error) return errorResponse(response, 400, 'VALIDATION_ERROR', aiPage.error);
        return send(response, 200, {
          message: 'Detail lelang berhasil diambil.',
          data: {
            serverNow: new Date().toISOString(),
            auction: serializeAuction(database, auction),
            bids: bidPage.data.map((bid) => serializeBid(database, bid)),
            aiInteractions: aiPage.data,
            bidsMeta: bidPage.meta,
            aiMeta: aiPage.meta,
          },
        });
      }

      const bidMatch = /^\/auctions\/([^/]+)\/bids$/.exec(pathname);
      if (bidMatch && request.method === 'GET') {
        const id = parseId(bidMatch[1]);
        const auction = id && database.auctions.find((entry) => Number(entry.id) === id);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        if (!auction || (auction.status === 'draft' && !isOwner(auction, currentUser))) return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        const bids = database.bids.filter((bid) => Number(bid.auctionId) === id)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
        const page = paginate(bids, url.searchParams, 20);
        if (page.error) return errorResponse(response, 400, 'VALIDATION_ERROR', page.error);
        return send(response, 200, { message: 'Riwayat penawaran berhasil diambil.', data: page.data.map((bid) => serializeBid(database, bid)), meta: page.meta });
      }

      const aiMatch = /^\/auctions\/([^/]+)\/ai\/interactions$/.exec(pathname);
      if (aiMatch && request.method === 'GET') {
        const id = parseId(aiMatch[1]);
        const auction = id && database.auctions.find((entry) => Number(entry.id) === id);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        if (!auction || (auction.status === 'draft' && !isOwner(auction, currentUser))) return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        const interactions = database.aiInteractions.filter((item) => Number(item.auctionId) === id && item.visibility === 'public')
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
        const page = paginate(interactions, url.searchParams, 20);
        if (page.error) return errorResponse(response, 400, 'VALIDATION_ERROR', page.error);
        return send(response, 200, { message: 'Riwayat AI berhasil diambil.', data: page.data, meta: page.meta });
      }

      if (/^\/auctions\/[^/]+\/(?:bids|ai\/questions|start)$/.test(pathname) && request.method === 'POST') {
        return errorResponse(response, 501, 'NOT_IMPLEMENTED', 'Aksi ini belum tersedia pada mock FE-01.');
      }
      if (/^\/auctions\/[^/]+$/.test(pathname) && ['PATCH', 'DELETE'].includes(request.method)) {
        return errorResponse(response, 501, 'NOT_IMPLEMENTED', 'Pengelolaan lanjutan draft belum tersedia pada mock FE-01.');
      }

      return errorResponse(response, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
    } catch (error) {
      const status = error.statusCode || 500;
      return errorResponse(response, status, status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        status === 500 ? 'Mock API mengalami kesalahan. Coba lagi.' : error.message,
        {}, {});
    }
  });
}

export function startMockServer({ port = defaultPort, host = '127.0.0.1', databasePath = defaultDatabasePath } = {}) {
  const server = createMockServer({ databasePath });
  server.listen(port, host, () => {
    console.log(`Smart Hammer MOCK API (development only) berjalan di http://${host}:${port}`);
    console.log('Data tersimpan lokal di mock/db.json; tidak ada backend produksi, realtime, atau AI aktif.');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMockServer();
}
