export function getAuctionResultState(auction) {
  if (auction?.status !== 'ended') return { kind: 'hidden' };
  if (!Number.isSafeInteger(auction.version) || !Number.isSafeInteger(auction.bidCount) || auction.bidCount < 0) {
    return { kind: 'loading' };
  }
  if (auction.bidCount === 0) {
    return auction.winner == null && auction.highestBidder == null && auction.finalPrice == null
      ? { kind: 'no-bids' }
      : { kind: 'loading' };
  }
  const winner = auction.winner;
  const finalPrice = auction.finalPrice;
  if (!winner || winner.id == null || !auction.highestBidder || String(auction.highestBidder.id) !== String(winner.id) ||
      typeof winner.username !== 'string' || !winner.username.trim() ||
      !Number.isSafeInteger(finalPrice) || finalPrice < 1 || finalPrice !== auction.currentPrice ||
      auction.nextMinimumBid !== null) {
    return { kind: 'loading' };
  }
  return { kind: 'winner', winner, finalPrice };
}
