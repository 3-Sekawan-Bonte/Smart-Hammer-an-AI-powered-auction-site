const memoryPending = new Map();

function intentKey(auctionId, userId) {
  return `smart_hammer_pending_bid:${userId}:${auctionId}`;
}

function browserSessionStorage() {
  try { return globalThis.sessionStorage || null; }
  catch { return null; }
}

export function createBidIntent(amount, createId = () => globalThis.crypto.randomUUID()) {
  return { clientRequestId: createId(), amount };
}

export function getPendingBidIntent(auctionId, userId, storage = browserSessionStorage()) {
  const key = intentKey(auctionId, userId);
  try {
    const value = storage ? JSON.parse(storage.getItem(key) || 'null') : memoryPending.get(key);
    const intent = value || memoryPending.get(key);
    return intent && typeof intent.clientRequestId === 'string' && Number.isSafeInteger(intent.amount) ? intent : null;
  } catch {
    return memoryPending.get(key) || null;
  }
}

export function savePendingBidIntent(auctionId, userId, intent, storage = browserSessionStorage()) {
  const key = intentKey(auctionId, userId);
  memoryPending.set(key, intent);
  try { storage?.setItem(key, JSON.stringify(intent)); }
  catch { /* the in-memory copy remains available for this tab */ }
}

export function clearPendingBidIntent(auctionId, userId, storage = browserSessionStorage()) {
  const key = intentKey(auctionId, userId);
  memoryPending.delete(key);
  try { storage?.removeItem(key); }
  catch { /* storage may be disabled */ }
}
