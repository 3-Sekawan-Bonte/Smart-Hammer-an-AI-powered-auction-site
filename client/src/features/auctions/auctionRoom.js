const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const STATUS_RANK = { pending: 0, completed: 1, failed: 1 };
const AUTHORITATIVE_FIELDS = [
  'status', 'currentPrice', 'nextMinimumBid', 'bidCount', 'highestBidder',
  'highestBidderId', 'startsAt', 'endsAt', 'winner', 'winnerId', 'finalPrice',
];

export function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

export function validateSnapshot(snapshot, requestedId) {
  const auction = snapshot?.auction;
  if (!auction || auction.id == null || !Number.isSafeInteger(auction.version) || auction.version < 0) {
    throw new Error('Format snapshot lelang tidak valid.');
  }
  if (!sameId(auction.id, requestedId)) throw new Error('Snapshot berasal dari lelang yang berbeda.');
  if (snapshot.version != null && (!Number.isSafeInteger(snapshot.version) || snapshot.version !== auction.version)) throw new Error('Versi snapshot tidak cocok dengan versi lelang.');
  if (snapshot.bids != null && !Array.isArray(snapshot.bids)) throw new Error('Format riwayat bid tidak valid.');
  if (snapshot.aiInteractions != null && !Array.isArray(snapshot.aiInteractions)) throw new Error('Format interaksi AI tidak valid.');
  return {
    ...snapshot,
    auction: { ...auction, version: Number(auction.version) },
    bids: snapshot.bids || [],
    aiInteractions: (snapshot.aiInteractions || []).filter((item) => item?.visibility === 'public'),
  };
}

export function normalizeAuction(auction, toCard) {
  if (!auction) return null;
  const value = { ...auction, version: Number(auction.version) };
  return toCard ? toCard(value) : value;
}

export function mergeBids(existing = [], incoming = [], auctionId) {
  const byId = new Map();
  for (const bid of [...existing, ...incoming]) {
    if (!bid || bid.id == null || !sameId(bid.auctionId, auctionId)) continue;
    byId.set(String(bid.id), { ...byId.get(String(bid.id)), ...bid });
  }
  return [...byId.values()].sort((a, b) => {
    const time = Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
    if (Number.isFinite(time) && time !== 0) return time;
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
}

export function mergePublicInteractions(existing = [], incoming = [], auctionId) {
  const byId = new Map(existing
    .filter((item) => item?.id != null && sameId(item.auctionId, auctionId) && item.visibility === 'public')
    .map((item) => [String(item.id), item]));
  for (const item of incoming) {
    if (!item || item.id == null || !sameId(item.auctionId, auctionId) || item.visibility !== 'public') continue;
    const previous = byId.get(String(item.id));
    if (!previous) { byId.set(String(item.id), item); continue; }
    const oldTime = Date.parse(previous.updatedAt || previous.createdAt || '') || 0;
    const newTime = Date.parse(item.updatedAt || item.createdAt || '') || 0;
    const oldRank = STATUS_RANK[previous.status] ?? -1;
    const newRank = STATUS_RANK[item.status] ?? -1;
    if (newRank < oldRank || (newRank === oldRank && newTime < oldTime)
      || (TERMINAL_STATUSES.has(previous.status) && item.status !== previous.status)) continue;
    byId.set(String(item.id), { ...previous, ...item });
  }
  return [...byId.values()].sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));
}

export function auctionFieldsConflict(current, incoming) {
  return AUTHORITATIVE_FIELDS.some((field) => Object.hasOwn(incoming || {}, field)
    && JSON.stringify(current?.[field] ?? null) !== JSON.stringify(incoming[field] ?? null));
}

export function isValidEvent(payload, activeId) {
  const auction = payload?.auction;
  const eventAuctionId = payload?.auctionId ?? payload?.bid?.auctionId ?? payload?.interaction?.auctionId ?? auction?.id;
  if (!auction || !sameId(eventAuctionId, activeId) || !sameId(auction.id, activeId)) return false;
  const auctionVersion = auction.version;
  if (!Number.isSafeInteger(auctionVersion) || auctionVersion < 0) return false;
  if (payload.version != null && (!Number.isSafeInteger(payload.version) || payload.version !== auctionVersion)) return false;
  return true;
}

// Server events share a metadata envelope but place event data under `data`.
// Normalize that contract once before Redux reducers validate or merge it.
export function normalizeSocketEvent(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const normalized = { ...payload, ...data };
  if (data.interaction) normalized.interaction = data.interaction;
  if (data.auction) normalized.auction = data.auction;
  if (data.bid) normalized.bid = data.bid;
  if (Array.isArray(data.bids)) normalized.bids = data.bids;
  if (Array.isArray(data.aiInteractions)) normalized.aiInteractions = data.aiInteractions;
  const pageMeta = (meta) => meta && ({
    currentPage: meta.page ?? meta.currentPage ?? 1,
    limit: meta.limit ?? 10,
    totalData: meta.total ?? meta.totalData ?? 0,
    totalPages: meta.totalPages ?? 0,
  });
  const bidsMeta = pageMeta(data.bidsMeta || data.meta);
  const aiMeta = pageMeta(data.aiMeta);
  if (bidsMeta) normalized.bidsMeta = bidsMeta;
  if (aiMeta) normalized.aiMeta = aiMeta;
  if (normalized.interaction && normalized.interaction.auctionId == null && normalized.auctionId != null) {
    normalized.interaction = { ...normalized.interaction, auctionId: normalized.auctionId };
  }
  return normalized;
}
