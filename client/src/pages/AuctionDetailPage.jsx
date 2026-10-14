import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadAuctionSnapshot, selectActiveAuction, selectActiveLoading, selectActiveError, selectActiveId, selectServerNow, selectStartStatus, startAuction } from '../features/auctions/auctionSlice';
import { selectUser } from '../features/auth/authSlice';
import { selectConnectionStatus, selectRoomError, selectRoomStatus } from '../features/socket/socketSlice';
import { money } from '../components/AuctionCard';
import BidForm from '../components/BidForm';
import BidHistory from '../components/BidHistory';

export default function AuctionDetailPage() {
  const { id } = useParams(); const dispatch = useDispatch(); const location = useLocation();
  const auction = useSelector(selectActiveAuction); const loading = useSelector(selectActiveLoading); const error = useSelector(selectActiveError); const activeId = useSelector(selectActiveId); const serverNow = useSelector(selectServerNow); const startStatus = useSelector(selectStartStatus); const user = useSelector(selectUser);
  const [confirming, setConfirming] = useState(false); const [message, setMessage] = useState(location.state?.notice || '');
  const cancelDialogRef = useRef(null);
  const connectionStatus = useSelector(selectConnectionStatus);
  const roomStatus = useSelector(selectRoomStatus);
  const roomError = useSelector(selectRoomError);
  useEffect(() => { if (!id) return undefined; const request = dispatch(loadAuctionSnapshot(id)); return () => request.abort(); }, [id, dispatch]);
  useEffect(() => { setConfirming(false); setMessage(location.state?.notice || ''); }, [id, location.state]);
  useEffect(() => {
    if (!confirming) return undefined;
    cancelDialogRef.current?.focus();
    function handleDialogKey(event) {
      if (event.key === 'Escape' && startStatus !== 'loading') setConfirming(false);
      if (event.key === 'Tab') {
        const buttons = document.querySelectorAll('.confirm-dialog button:not(:disabled)');
        if (buttons.length < 2) return;
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
      }
    }
    document.addEventListener('keydown', handleDialogKey);
    return () => document.removeEventListener('keydown', handleDialogKey);
  }, [confirming, startStatus]);
  if (loading || activeId !== id) return <div className="page container"><div className="loading-card">Memuat detail lelang…</div></div>;
  if (error || !auction) return <div className="page container"><section className="error-card page-state" role="alert"><p className="eyebrow">Detail lelang</p><h1 className="display">Lelang tidak tersedia.</h1><p>{typeof error === 'string' ? error : error?.message || 'Lelang ini tidak ditemukan atau kamu tidak memiliki akses.'}</p><Link className="btn btn-primary" to="/">Kembali ke daftar lelang</Link></section></div>;
  const isOwner = Number(auction.seller?.id) === Number(user?.id); const isDraft = auction.status === 'draft'; const status = auction.status === 'live' && auction.endsAt && Date.parse(auction.endsAt) <= Date.parse(serverNow || new Date().toISOString()) ? 'ended' : auction.status;
  async function handleStart() {
    setMessage('');
    try { const updated = await dispatch(startAuction(id)).unwrap(); setConfirming(false); setMessage('Lelang berhasil dimulai.'); dispatch(loadAuctionSnapshot(String(updated.id))); }
    catch (failure) { const problem = typeof failure === 'string' ? { message: failure } : failure || {}; if (problem.code === 'AUCTION_NOT_DRAFT') { setConfirming(false); setMessage(`${problem.message || 'Lelang sudah bukan draft.'} Data terbaru dimuat.`); dispatch(loadAuctionSnapshot(id)); } else setMessage(problem.message || 'Lelang gagal dimulai. Coba lagi.'); }
  }
  const facts = auction.productFacts || {};
  return <div className="page"><div className="container fe03-detail">
    <div className="detail-topline"><Link to={isOwner ? '/my-auctions' : '/'} className="back-link">← {isOwner ? 'Lelang saya' : 'Marketplace'}</Link><div className="detail-status-group"><span className={`connection ${connectionStatus}`} role="status" aria-live="polite"><i />{connectionLabel(connectionStatus, roomStatus)}</span><span className={`badge static-badge ${status === 'live' ? 'badge-live' : status === 'ended' ? 'badge-ended' : 'badge-draft'}`}>{status === 'live' ? 'Live' : status === 'ended' ? 'Berakhir' : 'Draft'}</span></div></div>
    {roomError && <p className="detail-note socket-room-error" role="alert">Koneksi room gagal: {roomError}</p>}
    {message && <p className="notice-card" role="status">{message}</p>}
    <div className="fe03-detail-grid"><section className="detail-main-card">
      <div className="detail-image"><img src={auction.imageUrl || '/assets/product-image-fallback.svg'} alt={auction.title} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = '/assets/product-image-fallback.svg'; } else event.currentTarget.hidden = true; }} /></div>
      <div className="detail-content"><p className="eyebrow">Electronics · Lot {String(auction.id).padStart(3, '0')}</p><h1 className="display">{auction.title}</h1><p className="seller-line">Penjual <strong>@{auction.seller?.username || 'seller'}</strong> · {conditionLabel(auction.condition)}</p><p className="detail-description">{auction.description || 'Deskripsi belum dicantumkan.'}</p>
        <div className="fe03-facts"><Fact label="Spesifikasi" value={facts.specifications} /><Fact label="Kekurangan" value={facts.defects} /><Fact label="Aksesori" value={Array.isArray(facts.accessories) ? facts.accessories.join(', ') : ''} /><Fact label="Garansi" value={facts.warranty} /></div>
      </div>
    </section><aside className="detail-side-card"><p className="eyebrow">Ringkasan lelang</p><div className="detail-price-block"><span>Harga {auction.bidCount ? 'saat ini' : 'awal'}</span><strong>{money(auction.currentPrice ?? auction.startingPrice)}</strong></div><dl className="detail-data"><div><dt>Harga awal</dt><dd>{money(auction.startingPrice)}</dd></div><div><dt>Minimum kenaikan</dt><dd>{money(auction.minIncrement)}</dd></div><div><dt>Status</dt><dd>{status === 'live' ? 'Sedang berlangsung' : status === 'ended' ? 'Berakhir' : 'Draft'}</dd></div><div><dt>Mulai</dt><dd>{formatWib(auction.startsAt) || 'Belum dimulai'}</dd></div><div><dt>Berakhir</dt><dd>{formatWib(auction.endsAt) || 'Ditentukan saat dimulai'}</dd></div><div><dt>Durasi</dt><dd>{formatDuration(auction.durationSeconds)}</dd></div></dl>
      {isOwner && isDraft && <div className="seller-actions"><Link className="btn btn-ghost" to={`/auctions/${auction.id}/edit`}>Edit draft</Link><button className="btn btn-primary" type="button" onClick={() => { setMessage(''); setConfirming(true); }}>Mulai lelang</button></div>}
      {status === 'live' && <p className="detail-note">Harga dan deadline mengikuti data server. Bid dikirim melalui REST dan disinkronkan ke peserta room melalui Socket.IO.</p>}{status === 'ended' && <p className="detail-note">Hasil lelang mengikuti snapshot yang dikirim server.</p>}
    </aside></div>
    <div className="bid-panels-grid"><BidForm auction={auction} user={user} /><BidHistory auctionId={auction.id} highestBidder={auction.highestBidder} /></div>
    {confirming && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && startStatus !== 'loading') setConfirming(false); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="start-title"><p className="eyebrow">Konfirmasi</p><h2 id="start-title" className="display">Mulai lelang sekarang?</h2><p>Waktu mulai dan berakhir akan ditetapkan server. Setelah dimulai, detail draft tidak dapat diedit.</p>{message && <p className="form-error" role="alert">{message}</p>}<div className="dialog-actions"><button ref={cancelDialogRef} className="btn btn-ghost" type="button" onClick={() => setConfirming(false)} disabled={startStatus === 'loading'}>Kembali</button><button className="btn btn-primary" type="button" onClick={handleStart} disabled={startStatus === 'loading'}>{startStatus === 'loading' ? 'Memulai…' : 'Ya, mulai lelang'}</button></div></section></div>}
  </div></div>;
}

function Fact({ label, value }) { return <div className="fact-item"><span>{label}</span><strong>{value || 'Belum dicantumkan'}</strong></div>; }
function conditionLabel(condition) { return ({ new: 'Baru', used_good: 'Bekas · Baik', used_fair: 'Bekas · Cukup' })[condition] || 'Kondisi belum dicantumkan'; }
function formatWib(value) { if (!value) return null; const date = new Date(value); if (!Number.isFinite(date.getTime())) return 'Waktu tidak valid'; return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' WIB'; }
function formatDuration(value) { const seconds = Number(value); if (!Number.isFinite(seconds) || seconds < 0) return '—'; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours} jam ${minutes} menit` : `${minutes} menit`; }
function connectionLabel(connection, room) {
  if (connection === 'unavailable') return 'Realtime nonaktif';
  if (connection === 'error') return 'Koneksi bermasalah';
  if (connection === 'connecting' || room === 'reconnecting') return 'Menghubungkan';
  if (connection !== 'connected') return 'Terputus';
  if (room === 'joined') return 'Realtime tersambung';
  if (room === 'joining') return 'Bergabung ke room';
  if (room === 'error') return 'Room bermasalah';
  return 'Terhubung';
}
