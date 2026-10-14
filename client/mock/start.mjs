import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';

const defaultDatabasePath = process.env.BIDWAR_MOCK_DB || fileURLToPath(new URL('./db.json', import.meta.url));
const defaultPort = Number(process.env.BIDWAR_MOCK_PORT || 3001);
const configuredMockJwtSecret = process.env.BIDWAR_MOCK_JWT_SECRET;
if (configuredMockJwtSecret && Buffer.byteLength(configuredMockJwtSecret, 'utf8') < 32) {
  throw new Error('BIDWAR_MOCK_JWT_SECRET harus memiliki setidaknya 32 byte.');
}
const defaultMockJwtSecret = configuredMockJwtSecret || randomBytes(32).toString('base64url');
const JWT_EXPIRES_IN = 86400;
const scrypt = promisify(scryptCallback);
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

export async function hashMockPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyMockPassword(password, storedHash) {
  const [algorithm, saltText, digestText, extra] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltText || !digestText || extra) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(digestText, 'base64url');
    if (salt.length < 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function createMockAccessToken(userId, secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({ sub: String(userId), iat: issuedAt, exp: issuedAt + JWT_EXPIRES_IN }));
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

function verifyMockAccessToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  const [headerText, payloadText, signatureText] = parts;
  try {
    const header = JSON.parse(Buffer.from(headerText, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || !/^[1-9]\d*$/.test(payload.sub || '') ||
        !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000) ||
        !Number.isSafeInteger(payload.iat) || payload.iat > Math.floor(now / 1000) + 60) return null;
    const expectedSignature = createHmac('sha256', secret).update(`${headerText}.${payloadText}`).digest();
    const presentedSignature = Buffer.from(signatureText, 'base64url');
    if (presentedSignature.length !== expectedSignature.length || !timingSafeEqual(presentedSignature, expectedSignature)) return null;
    return Number(payload.sub);
  } catch {
    return null;
  }
}

function getCurrentUser(database, request, jwtSecret) {
  const match = /^Bearer (\S+)$/.exec(request.headers.authorization || '');
  const userId = match ? verifyMockAccessToken(match[1], jwtSecret) : null;
  if (!userId) return null;
  return database.users.find((user) => Number(user.id) === userId) || null;
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
      : bidCount
        ? (currentPrice + Number(auction.minIncrement) <= MAX_AMOUNT ? currentPrice + Number(auction.minIncrement) : null)
        : Number(auction.startingPrice),
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

function buildAuctionSnapshot(database, auctionId) {
  const bids = database.bids.filter((bid) => Number(bid.auctionId) === Number(auctionId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
  const aiInteractions = database.aiInteractions.filter((item) => Number(item.auctionId) === Number(auctionId) && item.visibility === 'public')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Number(b.id) - Number(a.id));
  const page = (items) => ({ currentPage: 1, limit: 20, totalData: items.length, totalPages: Math.ceil(items.length / 20) });
  return {
    auctionId: Number(auctionId),
    serverNow: new Date().toISOString(),
    auction: serializeAuction(database, database.auctions.find((auction) => Number(auction.id) === Number(auctionId))),
    bids: bids.slice(0, 20).map((bid) => serializeBid(database, bid)),
    aiInteractions: aiInteractions.slice(0, 20),
    bidsMeta: page(bids),
    aiMeta: page(aiInteractions),
  };
}

function socketAuthError() {
  const error = new Error('Unauthorized');
  error.data = { code: 'UNAUTHORIZED' };
  return error;
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function validateAuthBody(body, registerMode = false) {
  const allowed = registerMode ? new Set(['username', 'email', 'password']) : new Set(['email', 'password']);
  const fields = {};
  for (const key of Object.keys(body)) if (!allowed.has(key)) fields[key] = 'Field tidak diizinkan.';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) fields.email = 'Email tidak valid.';
  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (passwordBytes < 8 || passwordBytes > 72) fields.password = 'Password harus 8–72 byte.';
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

function finalizeAuction(database, auction, now) {
  const current = serializeAuction(database, auction);
  auction.status = 'ended';
  auction.winnerId = current.highestBidderId;
  auction.updatedAt = now.toISOString();
  auction.version = Number(auction.version ?? 0) + 1;
  return {
    auctionId: Number(auction.id),
    serverNow: now.toISOString(),
    version: auction.version,
    auction: serializeAuction(database, auction),
  };
}

export function createMockServer({
  databasePath = defaultDatabasePath,
  jwtSecret = defaultMockJwtSecret,
  environment = process.env.NODE_ENV,
  clock = () => Date.now(),
  schedulerIntervalMs = 1000,
} = {}) {
  let io;
  let mutationQueue = Promise.resolve();
  let scheduler = null;
  let shutdown = false;
  const nowDate = () => new Date(clock());
  const serializeAuctionMutation = (operation) => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => undefined);
    return result;
  };
  const closeExpiredAuctions = ({ auctionId = null, force = false } = {}) => serializeAuctionMutation(async () => {
    const database = await readDatabase(databasePath);
    const now = nowDate();
    const candidates = database.auctions.filter((auction) =>
      (auctionId === null || Number(auction.id) === Number(auctionId)) &&
      auction.status === 'live' &&
      (force || (Number.isFinite(Date.parse(auction.endsAt)) && now.getTime() >= Date.parse(auction.endsAt)))
    );
    if (!candidates.length) return [];
    const events = candidates.map((auction) => finalizeAuction(database, auction, now));
    await saveDatabase(databasePath, database);
    for (const event of events) io?.to(`auction:${event.auctionId}`).emit('auction:ended', event);
    return events;
  });
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return send(response, 204);
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      await server.ready;
      let database = await readDatabase(databasePath);

      if (pathname === '/users/register' && request.method === 'POST') {
        const body = await readBody(request);
        const { fields, email, password, username } = validateAuthBody(body, true);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Data registrasi tidak valid.', fields);
        if (database.users.some((user) => user.email.toLowerCase() === email)) {
          return errorResponse(response, 409, 'EMAIL_EXISTS', 'Email sudah terdaftar.', { email: 'Email sudah terdaftar.' });
        }
        const id = Math.max(0, ...database.users.map((user) => Number(user.id) || 0)) + 1;
        const user = {
          id,
          username,
          email,
          passwordHash: await hashMockPassword(password),
          createdAt: new Date().toISOString(),
        };
        database.users.push(user);
        await saveDatabase(databasePath, database);
        return send(response, 201, { message: 'Register berhasil.', data: { user: selfUser(user) } });
      }

      if (pathname === '/users/login' && request.method === 'POST') {
        const body = await readBody(request);
        const { fields, email, password } = validateAuthBody(body);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Email dan password wajib diisi.', fields);
        const user = database.users.find((entry) => entry.email.toLowerCase() === email);
        let validPassword = user?.passwordHash ? await verifyMockPassword(password, user.passwordHash) : false;
        // Upgrade older local mock data on its next successful login.
        if (!validPassword && typeof user?.password === 'string' && user.password === password) {
          user.passwordHash = await hashMockPassword(password);
          delete user.password;
          await saveDatabase(databasePath, database);
          validPassword = true;
        }
        if (!user || !validPassword) return errorResponse(response, 401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
        return send(response, 200, {
          message: 'Login berhasil.',
          data: { access_token: createMockAccessToken(user.id, jwtSecret), tokenType: 'Bearer', expiresIn: JWT_EXPIRES_IN, user: selfUser(user) },
        });
      }

      const currentUser = getCurrentUser(database, request, jwtSecret);
      if (!currentUser) return errorResponse(response, 401, 'UNAUTHORIZED', 'Silakan login untuk melanjutkan.');

      const mockScenarioMatch = /^\/__mock\/auctions\/([^/]+)\/([a-z-]+)$/.exec(pathname);
      if (mockScenarioMatch && request.method === 'POST') {
        if (environment === 'production' || !isLoopbackRequest(request)) {
          return errorResponse(response, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
        }
        const id = parseId(mockScenarioMatch[1]);
        const scenario = mockScenarioMatch[2];
        const auction = id && database.auctions.find((entry) => Number(entry.id) === id);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.');
        if (!auction) return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        if (!io) return errorResponse(response, 503, 'MOCK_UNAVAILABLE', 'Socket.IO mock belum aktif.');
        const room = `auction:${id}`;
        const now = nowDate().toISOString();
        let eventName;
        let payload;
        if (scenario === 'bid' || scenario === 'duplicate-bid') {
          if (auction.status !== 'live') return errorResponse(response, 409, 'AUCTION_NOT_LIVE', 'Simulasi bid hanya untuk lelang live.');
          const bidder = database.users.find((user) => Number(user.id) !== Number(auction.sellerId ?? auction.seller?.id));
          if (!bidder) return errorResponse(response, 409, 'NO_BIDDER', 'Tidak ada akun buyer mock.');
          const currentAuction = serializeAuction(database, auction);
          const amount = currentAuction.nextMinimumBid ?? currentAuction.startingPrice;
          const bid = {
            id: Math.max(0, ...database.bids.map((item) => Number(item.id) || 0)) + 1,
            auctionId: id,
            userId: Number(bidder.id),
            amount,
            createdAt: now,
          };
          database.bids.push(bid);
          auction.currentPrice = amount;
          auction.highestBidderId = Number(bidder.id);
          auction.version = Number(auction.version ?? 0) + 1;
          auction.updatedAt = now;
          await saveDatabase(databasePath, database);
          eventName = 'bid:updated';
          payload = { auctionId: id, version: auction.version, serverNow: now, bid: serializeBid(database, bid), auction: serializeAuction(database, auction) };
          io.to(room).emit(eventName, payload);
          if (scenario === 'duplicate-bid') io.to(room).emit(eventName, payload);
          return send(response, 200, { message: 'Simulasi development-only dikirim.', data: { event: eventName, version: auction.version } });
        }
        if (scenario === 'end') {
          const events = await closeExpiredAuctions({ auctionId: id, force: true });
          if (!events.length) return errorResponse(response, 409, 'AUCTION_ENDED', 'Lelang sudah berakhir.');
          eventName = 'auction:ended';
          payload = events[0];
          return send(response, 200, { message: 'Simulasi development-only dikirim.', data: { event: eventName, version: payload.version } });
        }
        if (scenario === 'gap-event' || scenario === 'stale-event') {
          const version = Number(auction.version ?? 0) + (scenario === 'gap-event' ? 2 : -1);
          if (version < 0) return errorResponse(response, 409, 'VERSION_UNAVAILABLE', 'Versi lama tidak tersedia.');
          eventName = 'bid:updated';
          payload = { auctionId: id, version, serverNow: now, bid: null, auction: { ...serializeAuction(database, auction), version } };
          io.to(room).emit(eventName, payload);
          return send(response, 200, { message: 'Event kontrol development-only dikirim.', data: { event: eventName, version } });
        }
        if (['ai-pending', 'ai-message', 'ai-error'].includes(scenario)) {
          let interaction = scenario === 'ai-pending' ? null : database.aiInteractions
            .filter((item) => Number(item.auctionId) === id && item.visibility === 'public' && item.status === 'pending')
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          if (interaction) interaction = { ...interaction };
          else interaction = {
              id: Math.max(0, ...database.aiInteractions.map((item) => Number(item.id) || 0)) + 1,
              auctionId: id,
              kind: 'question', visibility: 'public',
              askedBy: { id: Number(currentUser.id), username: currentUser.username },
              question: 'Apakah semua aksesori produk tersedia?',
              answer: null, missingInformation: [], status: 'pending',
              sourceVersion: Number(auction.version ?? 0), snapshotAt: now,
              errorCode: null, createdAt: now, updatedAt: now,
            };
          if (scenario === 'ai-message') {
            interaction.status = 'completed';
            interaction.answer = 'Ini jawaban simulasi lokal; bukan hasil provider AI.';
            interaction.missingInformation = ['Status aksesori perlu dikonfirmasi kepada penjual.'];
            interaction.updatedAt = new Date(Date.now() + 1).toISOString();
          } else if (scenario === 'ai-error') {
            interaction.status = 'failed';
            interaction.errorCode = 'AI_UNAVAILABLE';
          }
          const interactionIndex = database.aiInteractions.findIndex((item) => Number(item.id) === Number(interaction.id));
          if (interactionIndex >= 0) database.aiInteractions[interactionIndex] = interaction;
          else database.aiInteractions.push(interaction);
          await saveDatabase(databasePath, database);
          eventName = ({ 'ai-pending': 'ai:pending', 'ai-message': 'ai:message', 'ai-error': 'ai:error' })[scenario];
          payload = { auctionId: id, version: Number(auction.version ?? 0), serverNow: now, interaction };
          io.to(room).emit(eventName, payload);
          return send(response, 200, { message: 'Simulasi development-only dikirim.', data: { event: eventName, interaction } });
        }
        return errorResponse(response, 404, 'NOT_FOUND', 'Skenario mock tidak tersedia.');
      }

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

      const bidMutationMatch = /^\/auctions\/([^/]+)\/bids$/.exec(pathname);
      if (bidMutationMatch && request.method === 'POST') {
        const auctionId = parseId(bidMutationMatch[1]);
        if (!auctionId) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        const body = await readBody(request);
        const fields = {};
        for (const key of Object.keys(body)) if (!['amount', 'clientRequestId'].includes(key)) fields[key] = 'Field tidak diizinkan.';
        if (!Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > MAX_AMOUNT) {
          fields.amount = `Harus integer rupiah 1–${MAX_AMOUNT}.`;
        }
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof body.clientRequestId !== 'string' || !uuidPattern.test(body.clientRequestId)) {
          fields.clientRequestId = 'Harus berupa UUID yang valid.';
        }
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Data bid tidak valid.', fields);

        const outcome = await serializeAuctionMutation(async () => {
          const latest = await readDatabase(databasePath);
          const bidder = latest.users.find((user) => Number(user.id) === Number(currentUser.id));
          if (!bidder) return { status: 401, code: 'UNAUTHORIZED', message: 'Silakan login untuk melanjutkan.' };
          latest.bids ||= [];
          latest.bidRequests ||= [];
          const prior = latest.bidRequests.find((entry) => Number(entry.userId) === Number(bidder.id) && entry.clientRequestId === body.clientRequestId);
          if (prior) {
            if (Number(prior.auctionId) !== auctionId || Number(prior.amount) !== body.amount) {
              return { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'clientRequestId sudah digunakan untuk payload bid lain.' };
            }
            const originalAuction = latest.auctions.find((entry) => Number(entry.id) === auctionId);
            const originalBid = latest.bids.find((entry) => Number(entry.id) === Number(prior.bidId));
            if (!originalAuction || !originalBid) return { status: 404, code: 'NOT_FOUND', message: 'Lelang tidak ditemukan.' };
            const serverNow = nowDate().toISOString();
            return {
              status: 200,
              message: 'Request bid sebelumnya sudah diterima.',
              data: {
                auctionId, serverNow, version: Number(originalAuction.version), auction: serializeAuction(latest, originalAuction),
                bid: serializeBid(latest, originalBid), clientRequestId: body.clientRequestId, replayed: true,
              },
            };
          }

          const auction = latest.auctions.find((entry) => Number(entry.id) === auctionId);
          if (!auction || (auction.status === 'draft' && !isOwner(auction, bidder))) {
            return { status: 404, code: 'NOT_FOUND', message: 'Lelang tidak ditemukan.' };
          }
          if (isOwner(auction, bidder)) return { status: 403, code: 'SELF_BID_FORBIDDEN', message: 'Pemilik lelang tidak dapat menawar lelangnya sendiri.' };
          if (auction.status === 'ended') return { status: 409, code: 'AUCTION_ENDED', message: 'Lelang sudah berakhir.' };
          if (auction.status !== 'live') return { status: 409, code: 'AUCTION_NOT_LIVE', message: 'Lelang belum berlangsung.' };
          const now = nowDate();
          if (!auction.endsAt || !Number.isFinite(Date.parse(auction.endsAt)) || now.getTime() >= Date.parse(auction.endsAt)) {
            const event = finalizeAuction(latest, auction, now);
            await saveDatabase(databasePath, latest);
            return {
              status: 409,
              code: 'AUCTION_ENDED',
              message: 'Waktu lelang sudah berakhir.',
              broadcast: true,
              eventName: 'auction:ended',
              event,
            };
          }
          const currentAuction = serializeAuction(latest, auction);
          const minimum = currentAuction.nextMinimumBid;
          if (minimum == null) return { status: 409, code: 'BID_LIMIT_REACHED', message: 'Batas nominal lelang sudah tercapai.', details: { auctionId, version: Number(auction.version) } };
          if (body.amount < minimum) {
            return { status: 409, code: 'BID_TOO_LOW', message: 'Penawaran di bawah minimum terbaru.', details: { auctionId, nextMinimumBid: minimum, version: Number(auction.version) } };
          }

          const serverNow = now.toISOString();
          const bid = {
            id: Math.max(0, ...latest.bids.map((entry) => Number(entry.id) || 0)) + 1,
            auctionId,
            userId: Number(bidder.id),
            amount: body.amount,
            clientRequestId: body.clientRequestId,
            createdAt: serverNow,
          };
          latest.bids.push(bid);
          auction.currentPrice = body.amount;
          auction.highestBidderId = Number(bidder.id);
          const extendedDeadline = now.getTime() + 3_600_000;
          if (extendedDeadline > Date.parse(auction.endsAt)) auction.endsAt = new Date(extendedDeadline).toISOString();
          auction.version = Number(auction.version ?? 0) + 1;
          auction.updatedAt = serverNow;
          latest.bidRequests.push({ userId: Number(bidder.id), clientRequestId: body.clientRequestId, auctionId, amount: body.amount, bidId: bid.id });
          await saveDatabase(databasePath, latest);
          const data = {
            auctionId, serverNow, version: auction.version, auction: serializeAuction(latest, auction),
            bid: serializeBid(latest, bid), clientRequestId: body.clientRequestId, replayed: false,
          };
          return {
            status: 201,
            message: 'Penawaran diterima.',
            data,
            broadcast: true,
            event: { auctionId, serverNow, version: auction.version, bid: data.bid, auction: data.auction },
          };
        });

        if (outcome.broadcast) io?.to(`auction:${auctionId}`).emit(outcome.eventName || 'bid:updated', outcome.event);
        if (outcome.code) return errorResponse(response, outcome.status, outcome.code, outcome.message, {}, outcome.details || {});
        return send(response, outcome.status, { message: outcome.message, data: outcome.data });
      }

      const auctionMatch = /^\/auctions\/([^/]+)$/.exec(pathname);
      if (auctionMatch && request.method === 'PATCH') {
        const id = parseId(auctionMatch[1]);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        const auction = database.auctions.find((entry) => Number(entry.id) === id);
        if (!auction) return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        if (!isOwner(auction, currentUser)) return errorResponse(response, 403, 'FORBIDDEN', 'Hanya pemilik lelang yang dapat mengubah draft.');
        if (auction.status !== 'draft') return errorResponse(response, 409, 'AUCTION_NOT_DRAFT', 'Hanya lelang berstatus draft yang dapat diubah.');
        const body = await readBody(request);
        if (!Object.keys(body).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Perubahan draft tidak boleh kosong.', { body: 'Sertakan setidaknya satu field.' });
        const fields = validateAuctionBody(body, true);
        if (Object.keys(fields).length) return errorResponse(response, 400, 'VALIDATION_ERROR', 'Data lelang tidak valid.', fields);
        for (const key of Object.keys(body)) {
          if (key === 'productFacts') auction.productFacts = normalizeFacts(body.productFacts);
          else if (key === 'title' || key === 'description' || key === 'imageUrl') auction[key] = body[key].trim();
          else if (key !== 'category') auction[key] = body[key];
        }
        auction.currentPrice = auction.startingPrice;
        auction.updatedAt = nowDate().toISOString();
        auction.version = Number(auction.version ?? 0) + 1;
        await saveDatabase(databasePath, database);
        return send(response, 200, { message: 'Draft lelang diperbarui.', data: { auction: serializeAuction(database, auction) } });
      }
      const startMatch = /^\/auctions\/([^/]+)\/start$/.exec(pathname);
      if (startMatch && request.method === 'POST') {
        const id = parseId(startMatch[1]);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        const auction = database.auctions.find((entry) => Number(entry.id) === id);
        if (!auction) return errorResponse(response, 404, 'NOT_FOUND', 'Lelang tidak ditemukan.');
        if (!isOwner(auction, currentUser)) return errorResponse(response, 403, 'FORBIDDEN', 'Hanya pemilik lelang yang dapat memulai lelang.');
        if (auction.status !== 'draft') return errorResponse(response, 409, 'AUCTION_NOT_DRAFT', 'Lelang sudah bukan draft dan tidak dapat dimulai ulang.');
        const now = nowDate();
        auction.startsAt = now.toISOString();
        auction.endsAt = new Date(now.getTime() + Number(auction.durationSeconds) * 1000).toISOString();
        auction.status = 'live';
        auction.updatedAt = now.toISOString();
        auction.version = Number(auction.version ?? 0) + 1;
        await saveDatabase(databasePath, database);
        io?.to(`auction:${id}`).emit('auction:started', {
          auctionId: id,
          version: auction.version,
          serverNow: now.toISOString(),
          auction: serializeAuction(database, auction),
        });
        return send(response, 200, { message: 'Lelang dimulai.', data: { auction: serializeAuction(database, auction) } });
      }
      if (auctionMatch && request.method === 'GET') {
        const id = parseId(auctionMatch[1]);
        if (!id) return errorResponse(response, 400, 'VALIDATION_ERROR', 'ID lelang tidak valid.', { id: 'ID harus integer positif.' });
        await closeExpiredAuctions({ auctionId: id });
        database = await readDatabase(databasePath);
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
            serverNow: nowDate().toISOString(),
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

      if (/^\/auctions\/[^/]+\/ai\/questions$/.test(pathname) && request.method === 'POST') {
        return errorResponse(response, 501, 'NOT_IMPLEMENTED', 'Aksi ini belum tersedia pada mock FE-01.');
      }
      if (/^\/auctions\/[^/]+$/.test(pathname) && request.method === 'DELETE') {
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

  io = new SocketIOServer(server, {
    path: '/socket.io',
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });
  server.io = io;
  server.closeExpiredAuctions = closeExpiredAuctions;
  server.ready = Promise.resolve().then(() => closeExpiredAuctions());
  server.on('listening', () => {
    void server.ready.then(() => {
      if (scheduler || shutdown) return;
      scheduler = setInterval(() => { void closeExpiredAuctions().catch((error) => console.error(`Auction closure scan failed: ${error.message}`)); }, schedulerIntervalMs);
      scheduler.unref?.();
    }).catch((error) => console.error(`Auction startup recovery failed: ${error.message}`));
  });
  server.on('close', () => { shutdown = true; if (scheduler) clearInterval(scheduler); scheduler = null; });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const userId = verifyMockAccessToken(token, jwtSecret);
      if (!userId) return next(socketAuthError());
      const database = await readDatabase(databasePath);
      const user = database.users.find((item) => Number(item.id) === userId);
      if (!user) return next(socketAuthError());
      socket.data.userId = userId;
      socket.data.accessToken = token;
      next();
    } catch {
      next(socketAuthError());
    }
  });
  io.on('connection', (socket) => {
    const decoded = JSON.parse(Buffer.from(socket.data.accessToken.split('.')[1], 'base64url').toString('utf8'));
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, decoded.exp * 1000 - Date.now()));
    expiryTimer.unref?.();
    socket.on('disconnect', () => clearTimeout(expiryTimer));
    socket.on('auction:join', async (payload = {}, acknowledge = () => {}) => {
      const auctionId = parseId(String(payload.auctionId ?? ''));
      if (!auctionId) return acknowledge({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Auction ID tidak valid.' } });
      try {
        await server.ready;
        await closeExpiredAuctions({ auctionId });
        const database = await readDatabase(databasePath);
        const auction = database.auctions.find((item) => Number(item.id) === auctionId);
        const user = database.users.find((item) => Number(item.id) === socket.data.userId);
        if (!user) return acknowledge({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
        if (!auction || (auction.status === 'draft' && !isOwner(auction, user))) {
          return acknowledge({ ok: false, error: { code: 'NOT_FOUND', message: 'Auction unavailable.' } });
        }
        await socket.join(`auction:${auctionId}`);
        socket.emit('auction:snapshot', { ...buildAuctionSnapshot(database, auctionId), serverNow: nowDate().toISOString() });
        acknowledge({ ok: true, data: { auctionId } });
      } catch {
        acknowledge({ ok: false, error: { code: 'MOCK_UNAVAILABLE', message: 'Snapshot lelang tidak tersedia.' } });
      }
    });
    socket.on('auction:leave', async (payload = {}, acknowledge = () => {}) => {
      const auctionId = parseId(String(payload.auctionId ?? ''));
      if (!auctionId) return acknowledge({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Auction ID tidak valid.' } });
      await socket.leave(`auction:${auctionId}`);
      acknowledge({ ok: true, data: { auctionId } });
    });
  });
  return server;
}

export function startMockServer({ port = defaultPort, host = '127.0.0.1', databasePath = defaultDatabasePath } = {}) {
  const server = createMockServer({ databasePath });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port mock ${port} sudah digunakan. Hentikan mock server yang memang Anda jalankan atau atur BIDWAR_MOCK_PORT secara eksplisit.`);
    } else {
      console.error(`Mock server gagal dijalankan: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Smart Hammer MOCK API (development only) berjalan di http://${host}:${port}`);
    console.log(`Socket.IO tersedia di http://${host}:${port}/socket.io; data tersimpan lokal di ${databasePath}.`);
    console.log('Bid REST dan closure bekerja pada mock development; endpoint /__mock hanya kontrol QA. AI belum tersedia; tidak ada backend produksi.');
  });
  const shutdown = () => server.io.close(() => { process.exitCode = 0; });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMockServer();
}
