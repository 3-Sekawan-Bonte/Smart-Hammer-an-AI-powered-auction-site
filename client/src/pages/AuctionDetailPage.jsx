import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../contexts/SocketContext';
import { loadAuctionSnapshot, selectActiveAuction, selectActiveBids, selectActiveAIInteractions, selectActiveLoading, selectActiveError, selectActiveId, selectServerNow } from '../features/auctions/auctionSlice';
import Countdown from '../components/Countdown';
import { money } from '../components/AuctionCard';
import { SparkIcon } from '../components/Icons';

export default function AuctionDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const auction = useSelector(selectActiveAuction);
  const bids = useSelector(selectActiveBids);
  const publicAIInteractions = useSelector(selectActiveAIInteractions);
  const loading = useSelector(selectActiveLoading);
  const error = useSelector(selectActiveError);
  const activeId = useSelector(selectActiveId);
  const serverNow = useSelector(selectServerNow);
  const { connectionStatus } = useSocket();

  useEffect(() => {
    if (!id) return undefined;
    const request = dispatch(loadAuctionSnapshot(id));
    return () => request.abort();
  }, [id, dispatch]);

  if (loading || activeId !== id) return <div className="page container"><div className="loading-card">Memuat detail lelang…</div></div>;
  if (error || !auction) return (
    <div className="page container">
      <section className="error-card page-state" role="alert">
        <p className="eyebrow">Detail lelang</p>
        <h1 className="display">Lelang tidak tersedia.</h1>
        <p>{error || 'Lelang ini tidak ditemukan atau tidak dapat kamu akses.'}</p>
        <Link className="btn btn-primary" to="/">Kembali ke daftar lelang</Link>
      </section>
    </div>
  );
  const nextMinimumBid = auction.nextMinimumBid;

  return (
    <div className="room-page">
      <div className="container">
        <div className="room-topline">
          <div>
            <p className="room-breadcrumb">Marketplace / electronics / Lot {String(auction.id).padStart(3, '0')}</p>
            <h1 className="room-title">{auction.title}</h1>
          </div>
          <div className="room-status">
            <span className={`badge static-badge ${auction.status === 'live' ? 'badge-live' : 'badge-ended'}`}>{auction.status === 'live' ? 'Live' : auction.status === 'draft' ? 'Draft' : 'Berakhir'}</span>
            <span className="small muted">Preview data demo</span>
            <div className={`connection ${connectionStatus}`}><i />{connectionStatus === 'connected' ? 'Terhubung' : connectionStatus === 'unavailable' ? 'Realtime belum tersedia' : 'Terputus'}</div>
          </div>
        </div>
        <div className="room-grid">
          <section className="room-panel product-panel">
            <div className="room-panel-head">
              <h2>Lot {String(auction.id).padStart(3, '0')}</h2>
              <span className="verified-label">Informasi seller</span>
            </div>
            <div className="product-stage">
              <div className="product-shot detail-product-shot" style={{ backgroundPosition: auction.visualPosition }} role="img" aria-label={auction.title} />
              <span className="stage-tag">{conditionLabel(auction.condition)}</span>
            </div>
            <div className="product-detail">
              <div className="product-seller"><span>Penjual</span><strong>@{auction.seller}</strong></div>
              <p className="muted small product-copy">{auction.description}</p>
              <div className="spec-list">
                {auction.productFacts && Object.entries(auction.productFacts).map(([label, value]) => (
                  <div className="spec" key={label}>
                    <span className="muted">{factLabel(label)}</span>
                    <strong>{Array.isArray(value) ? value.join(', ') || 'Belum dicantumkan' : value || 'Belum dicantumkan'}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="room-panel bidding-panel">
            <div className="bid-zone">
              <div className="bid-zone-head">
                <p className="eyebrow">{auction.bidCount ? 'Harga tertinggi' : 'Harga awal'}</p>
                <div className="timer-large"><i />{auction.endsAt ? <Countdown endsAt={auction.endsAt} serverNow={serverNow} /> : <span>—</span>}</div>
              </div>
              <div className="current-price">{money(auction.currentPrice)}</div>
              <p className="next-bid">{nextMinimumBid === null ? 'Penawaran tidak tersedia untuk status ini.' : <>Minimum penawaran <strong>{money(nextMinimumBid)}</strong></>}</p>
              <div className="bid-unavailable" role="status">Penawaran belum tersedia pada FE-01</div>
              <p className="secure-note">Halaman ini menampilkan snapshot lokal. Penawaran aktif memerlukan backend lelang.</p>
            </div>
            <div className="bid-list">
              <div className="bid-list-head"><h3>Riwayat Bid</h3><span className="small muted">{bids.length} penawaran</span></div>
              {bids.length === 0 ? (
                <p className="empty-bids muted">Belum ada penawaran pada fixture. Riwayat akan muncul setelah backend lelang tersedia.</p>
              ) : (
                bids.map((bid, idx) => (
                  <div className={`bid-row ${idx === 0 ? 'flash' : ''}`} key={bid.id}>
                    <div className="bid-person">
                      <strong>{bid.bidder?.username || 'Peserta'}</strong>
                      <span>{remainingTime(bid.createdAt)}</span>
                    </div>
                    <div className="bid-amount">{money(bid.amount)}</div>
                  </div>
                ))
              )}
            </div>
          </section>
          <aside className="room-panel ai-panel">
            <div className="room-panel-head">
              <div className="ai-head">
                <div>
                  <div className="ai-orb"><SparkIcon /></div>
                  <span className="ai-online">AI Auctioneer</span>
                </div>
              </div>
            </div>
            <div className="ai-feed">
              {publicAIInteractions.length === 0 ? (
                <p className="ai-empty muted">AI belum terhubung pada FE-01. Panel ini tidak membuat jawaban simulasi.</p>
              ) : (
                publicAIInteractions.map((msg) => (
                  <div className={`ai-message ${msg.askedBy ? 'user' : ''}`} key={msg.id}>
                    <div className="ai-label">{msg.askedBy ? 'Pertanyaan' : msg.status === 'pending' ? 'AI menjawab…' : msg.status === 'failed' ? 'AI gagal' : 'AI Auctioneer'}</div>
                    <div>{msg.answer || msg.question || ''}</div>
                  </div>
                ))
              )}
            </div>
            <div className="ai-form">
              <input className="ai-input" type="text" value="" placeholder="AI belum tersedia di FE-01" disabled aria-label="AI belum tersedia" />
              <button className="btn btn-primary" type="button" disabled aria-label="AI belum tersedia"><SparkIcon /></button>
            </div>
            <p className="ai-disclaimer">Data produk berasal dari fixture lokal. Q&amp;A memerlukan backend AI.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function conditionLabel(condition) {
  return ({ new: 'Baru', used_good: 'Bekas · Baik', used_fair: 'Bekas · Cukup' })[condition] || 'Kondisi belum dicantumkan';
}

function factLabel(label) {
  return ({ specifications: 'Spesifikasi', defects: 'Kekurangan', accessories: 'Aksesori', warranty: 'Garansi' })[label] || label;
}

// Helper function for countdown
function remainingTime(endsAt) {
  if (!endsAt) return '00:00';
  const totalSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}j ${String(minutes).padStart(2, '0')}m`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
