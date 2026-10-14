import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loadBids, selectActiveBids, selectActiveBidsMeta, selectActiveId, selectAuctionRoom } from '../features/auctions/auctionSlice.js';
import { formatBidTime, formatRupiah } from '../features/auctions/bidUtils.js';

const PAGE_SIZE = 20;

export default function BidHistory({ auctionId, highestBidder }) {
  const dispatch = useDispatch();
  const activeId = useSelector(selectActiveId);
  const bids = useSelector(selectActiveBids);
  const meta = useSelector(selectActiveBidsMeta);
  const room = useSelector(selectAuctionRoom);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [loadingPage, setLoadingPage] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => { setPage(1); setError(null); }, [auctionId]);
  useEffect(() => {
    if (String(activeId) !== String(auctionId) || (page === 1 && meta)) return;
    let mounted = true;
    setLoadingPage(page);
    setError(null);
    dispatch(loadBids({ auctionId, page, limit: PAGE_SIZE })).unwrap()
      .catch((message) => { if (mounted) setError(typeof message === 'string' ? message : 'Riwayat bid gagal dimuat.'); })
      .finally(() => { if (mounted) setLoadingPage(null); });
    return () => { mounted = false; };
  }, [auctionId, activeId, page, reloadToken, dispatch]);

  const totalPages = Math.max(1, Number(meta?.totalPages) || 1);
  const pageBids = bids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const loading = loadingPage === page || (room.bidsRequestId && !pageBids.length);

  return <section className="room-panel bid-history-panel" aria-labelledby="bid-history-title">
    <header className="room-panel-head bid-list-head"><h2 id="bid-history-title">Riwayat penawaran</h2><span>{meta?.totalData ?? bids.length} bid</span></header>
    {error && <p className="bid-history-error" role="alert">{error} <button className="text-button" type="button" onClick={() => setReloadToken((value) => value + 1)}>Coba lagi</button></p>}
    {loading && <p className="empty-bids" role="status">Memuat riwayat bid…</p>}
    {!loading && !pageBids.length && !error && <p className="empty-bids">Belum ada penawaran. Jadilah yang pertama mengajukan bid.</p>}
    {!loading && pageBids.length > 0 && <ol className="bid-list" aria-live="polite">
      {pageBids.map((bid, index) => {
        const latest = page === 1 && index === 0;
        const leader = highestBidder?.id != null && String(highestBidder.id) === String(bid.bidder?.id);
        return <li className={`bid-row${latest ? ' latest' : ''}`} key={bid.id}>
          <span className="bid-rank" aria-hidden="true">{latest ? '★' : String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</span>
          <span className="bid-person"><strong>{bid.bidder?.username || 'Peserta'}</strong><span>{formatBidTime(bid.createdAt)}{leader ? ' · Penawar tertinggi' : ''}</span></span>
          <strong className="bid-amount">{formatRupiah(bid.amount)}</strong>
        </li>;
      })}
    </ol>}
    {totalPages > 1 && <nav className="bid-pagination" aria-label="Halaman riwayat bid">
      <button type="button" className="btn btn-ghost" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || Boolean(loadingPage)}>Sebelumnya</button>
      <span>Halaman {page} dari {totalPages}</span>
      <button type="button" className="btn btn-ghost" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || Boolean(loadingPage)}>Berikutnya</button>
    </nav>}
  </section>;
}
