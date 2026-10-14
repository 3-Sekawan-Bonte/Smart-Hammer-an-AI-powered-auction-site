import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  clearActiveAuction,
  loadAuctionSnapshot,
  processAuctionEvent,
  selectActiveAIInteractions,
  selectActiveAuction,
  selectActiveBids,
  selectActiveError,
  selectActiveId,
  selectActiveLoading,
  selectActiveResyncRequired,
  selectActiveVersion,
  selectAuctionBidCount,
  selectAuctionDeadline,
  selectAuctionStatus,
  selectCurrentPrice,
  selectHighestBidder,
  selectNextMinimumBid,
  selectServerNow,
  selectServerTimeOffsetMs,
  selectAuctionWinner,
} from './auctionSlice.js';

export function useAuctionState() { return useSelector(selectActiveAuction); }
export function useAuctionBids() { return useSelector(selectActiveBids); }
export function useAuctionAI() { return useSelector(selectActiveAIInteractions); }
export function useAuctionPrice() { return useSelector(selectCurrentPrice); }
export function useAuctionStatus() { return useSelector(selectAuctionStatus); }

export function useAuctionRoom() {
  const dispatch = useDispatch();
  const auction = useSelector(selectActiveAuction);
  const bids = useSelector(selectActiveBids);
  const aiInteractions = useSelector(selectActiveAIInteractions);
  const auctionId = useSelector(selectActiveId);
  const loading = useSelector(selectActiveLoading);
  const error = useSelector(selectActiveError);
  const version = useSelector(selectActiveVersion);
  const resyncRequired = useSelector(selectActiveResyncRequired);
  const currentPrice = useSelector(selectCurrentPrice);
  const nextMinimumBid = useSelector(selectNextMinimumBid);
  const status = useSelector(selectAuctionStatus);
  const bidCount = useSelector(selectAuctionBidCount);
  const highestBidder = useSelector(selectHighestBidder);
  const endsAt = useSelector(selectAuctionDeadline);
  const winner = useSelector(selectAuctionWinner);
  const serverNow = useSelector(selectServerNow);
  const serverTimeOffsetMs = useSelector(selectServerTimeOffsetMs);

  return useMemo(() => ({
    auction, auctionId, bids, aiInteractions, loading, error, version, resyncRequired,
    currentPrice, nextMinimumBid, status, bidCount, highestBidder, endsAt, winner,
    serverNow, serverTimeOffsetMs,
    loadSnapshot: (id = auctionId) => id == null ? null : dispatch(loadAuctionSnapshot(String(id))),
    processEvent: (name, payload) => dispatch(processAuctionEvent(name, payload)),
    resetRoom: () => dispatch(clearActiveAuction()),
  }), [dispatch, auction, auctionId, bids, aiInteractions, loading, error, version, resyncRequired,
    currentPrice, nextMinimumBid, status, bidCount, highestBidder, endsAt, winner, serverNow, serverTimeOffsetMs]);
}

