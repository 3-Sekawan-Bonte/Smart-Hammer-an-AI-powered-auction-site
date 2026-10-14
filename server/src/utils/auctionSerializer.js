function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username };
}

function auctionToJSON(auction, options = {}) {
  const value = typeof auction.toJSON === 'function' ? auction.toJSON() : auction;
  const bidCount = Number.isSafeInteger(options.bidCount) ? options.bidCount
    : Number.isSafeInteger(value.bidCount) ? value.bidCount : null;
  const nextMinimumBid = value.status !== 'live' ? null
    : (value.highestBidderId === null ? value.startingPrice : value.currentPrice + value.minIncrement) <= 2_000_000_000
      ? (value.highestBidderId === null ? value.startingPrice : value.currentPrice + value.minIncrement)
      : null;
  return {
    id: value.id,
    sellerId: value.sellerId,
    title: value.title,
    description: value.description,
    condition: value.condition,
    category: value.category,
    productFacts: value.productFacts,
    imageUrl: value.imageUrl,
    startingPrice: value.startingPrice,
    currentPrice: value.currentPrice,
    bidCount,
    nextMinimumBid,
    minIncrement: value.minIncrement,
    durationSeconds: value.durationSeconds,
    startsAt: value.startsAt ? new Date(value.startsAt).toISOString() : null,
    endsAt: value.endsAt ? new Date(value.endsAt).toISOString() : null,
    status: value.status,
    finalPrice: value.status === 'ended' && value.highestBidderId !== null ? value.currentPrice : null,
    highestBidderId: value.highestBidderId,
    winnerId: value.winnerId,
    version: value.version,
    createdAt: value.createdAt ? new Date(value.createdAt).toISOString() : null,
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : null,
    seller: publicUser(value.seller),
    highestBidder: publicUser(value.highestBidder),
    winner: publicUser(value.winner),
  };
}

module.exports = { auctionToJSON };
