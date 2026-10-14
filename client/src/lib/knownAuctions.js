const PREFIX = 'smart-hammer-known-auctions:';

function storageKey(userId) {
  return `${PREFIX}${userId}`;
}

export function readKnownAuctionIds(userId) {
  if (userId === null || userId === undefined) return [];
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(value)
      ? [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export function rememberAuction(userId, auctionId) {
  const id = Number(auctionId);
  if (userId === null || userId === undefined || !Number.isSafeInteger(id) || id < 1) return;
  const ids = readKnownAuctionIds(userId);
  if (!ids.includes(id)) localStorage.setItem(storageKey(userId), JSON.stringify([id, ...ids].slice(0, 100)));
}

export function forgetAuction(userId, auctionId) {
  if (userId === null || userId === undefined) return;
  const id = Number(auctionId);
  localStorage.setItem(storageKey(userId), JSON.stringify(readKnownAuctionIds(userId).filter((value) => value !== id)));
}
