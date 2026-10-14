import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { loadAuctionSnapshot, selectActiveId, selectSubmitStatus, submitBid } from '../features/auctions/auctionSlice.js';
import { selectAuthRestoring } from '../features/auth/authSlice.js';
import { formatRupiah, getBidAvailability, parseBidAmount } from '../features/auctions/bidUtils.js';
import { clearPendingBidIntent, createBidIntent, getPendingBidIntent, savePendingBidIntent } from '../features/auctions/bidIntent.js';

export default function BidForm({ auction, user }) {
  const dispatch = useDispatch();
  const store = useStore();
  const activeId = useSelector(selectActiveId);
  const submitStatus = useSelector(selectSubmitStatus);
  const authRestoring = useSelector(selectAuthRestoring);
  const availability = useMemo(() => getBidAvailability({ auction, user, authRestoring }), [auction, user, authRestoring]);
  const [amountText, setAmountText] = useState('');
  const [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState(null);
  const [validationError, setValidationError] = useState('');
  useEffect(() => {
    if (!auction || !user) { setIntent(null); return; }
    const pending = getPendingBidIntent(auction.id, user.id);
    setIntent(pending);
    if (pending) setAmountText(String(pending.amount));
  }, [auction?.id, user?.id]);

  async function sendIntent(nextIntent) {
    const retryingSameIntent = intent?.clientRequestId === nextIntent.clientRequestId && intent?.amount === nextIntent.amount;
    if (inFlight.current || (!availability.allowed && !retryingSameIntent) || String(activeId) !== String(auction.id)) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    setValidationError('');
    try {
      const result = await dispatch(submitBid({ auctionId: auction.id, amount: nextIntent.amount, clientRequestId: nextIntent.clientRequestId })).unwrap();
      clearPendingBidIntent(auction.id, user.id);
      setIntent(null);
      setAmountText('');
      setFeedback({ type: 'success', message: result.replayed ? 'Bid sebelumnya sudah tercatat. Harga terbaru telah disinkronkan.' : 'Penawaran diterima dan tersinkron ke room lelang.' });
      if (result.replayed || store.getState().auction.active.resyncRequired) dispatch(loadAuctionSnapshot(String(auction.id)));
    } catch (problem) {
      const error = typeof problem === 'string' ? { message: problem } : problem || {};
      if (error.uncertain) {
        setIntent(nextIntent);
        savePendingBidIntent(auction.id, user.id, nextIntent);
        setFeedback({ type: 'warning', message: 'Respons server belum diterima. Hasil bid belum dapat dipastikan; muat ulang state lalu coba ulang nominal yang sama dengan ID request yang sama.' });
        dispatch(loadAuctionSnapshot(String(auction.id)));
      } else {
        clearPendingBidIntent(auction.id, user.id);
        setIntent(null);
        const messages = {
          BID_TOO_LOW: `Bid ditolak. Minimum terbaru ${formatRupiah(error.details?.nextMinimumBid ?? auction.nextMinimumBid)}. Periksa harga terbaru lalu ajukan bid baru.`,
          AUCTION_NOT_LIVE: 'Lelang tidak sedang berlangsung. State terbaru sedang digunakan.',
          AUCTION_ENDED: 'Lelang sudah berakhir. Bid baru tidak dapat dikirim.',
          BID_LIMIT_REACHED: 'Batas nominal bid lelang sudah tercapai.',
          SELF_BID_FORBIDDEN: 'Pemilik lelang tidak dapat menawar lelangnya sendiri.',
          NOT_FOUND: 'Lelang tidak tersedia atau sudah tidak dapat diakses.',
          IDEMPOTENCY_CONFLICT: 'Request ID ini terikat ke bid lain. Mulai bid baru setelah state tersinkron.',
          VALIDATION_ERROR: error.fields?.amount || error.fields?.clientRequestId || error.message,
        };
        setFeedback({ type: 'error', message: messages[error.code] || error.message || 'Bid gagal dikirim.' });
        if (error.status === 409 || ['BID_TOO_LOW', 'AUCTION_NOT_LIVE', 'AUCTION_ENDED', 'BID_LIMIT_REACHED'].includes(error.code)) {
          dispatch(loadAuctionSnapshot(String(auction.id)));
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFeedback(null);
    if (intent) return void sendIntent(intent);
    const parsed = parseBidAmount(amountText);
    if (parsed.error) { setValidationError(parsed.error); return; }
    if (parsed.amount < auction.nextMinimumBid) {
      setValidationError(`Nominal minimum saat ini ${formatRupiah(auction.nextMinimumBid)}.`);
      return;
    }
    const nextIntent = createBidIntent(parsed.amount);
    setIntent(nextIntent);
    savePendingBidIntent(auction.id, user.id, nextIntent);
    void sendIntent(nextIntent);
  }

  function handleAmountChange(event) {
    setAmountText(event.target.value);
    setValidationError('');
    setFeedback(null);
  }

  const canRetry = Boolean(intent && user && !authRestoring && String(activeId) === String(auction?.id));
  const showForm = availability.allowed || canRetry;
  const fieldDisabled = busy || Boolean(intent) || !availability.allowed;
  const minimum = auction?.nextMinimumBid;
  const buttonDisabled = busy || submitStatus === 'loading' || (!availability.allowed && !canRetry) || String(activeId) !== String(auction?.id);

  return <section className="bid-zone" aria-labelledby="bid-form-title">
    <div className="bid-zone-head"><div><p className="eyebrow">Live bidding</p><h2 id="bid-form-title">Ajukan penawaran</h2></div><span className="bid-status-pill">{auction?.status === 'live' ? 'Lelang live' : auction?.status === 'ended' ? 'Berakhir' : 'Belum dimulai'}</span></div>
    <p className="bid-current-label">Harga saat ini</p>
    <p className="current-price">{formatRupiah(auction?.currentPrice ?? auction?.startingPrice)}</p>
    <p className="next-bid">Minimum bid berikutnya <strong>{formatRupiah(minimum)}</strong></p>
    <p className="next-bid">Kenaikan minimum <strong>{formatRupiah(auction?.minIncrement)}</strong></p>
    {showForm ? <form className="bid-form" onSubmit={handleSubmit} noValidate>
      <label className="currency-input"><span aria-hidden="true">Rp</span><span className="sr-only">Nominal penawaran dalam rupiah</span><input className="bid-input" name="amount" type="text" inputMode="numeric" autoComplete="off" maxLength={10} pattern="[0-9]*" value={amountText} onChange={handleAmountChange} placeholder={minimum ? String(minimum) : 'Masukkan nominal'} aria-invalid={Boolean(validationError)} aria-describedby="bid-guidance bid-validation" disabled={fieldDisabled} /></label>
      <button className="btn btn-primary" type="submit" disabled={buttonDisabled}>{busy ? 'Mengirim…' : intent ? 'Coba ulang bid' : 'Kirim bid'}</button>
    </form> : <div className="bid-unavailable">{!user && !authRestoring ? <><Link to="/login">Masuk</Link> untuk mengajukan penawaran.</> : availability.reason}</div>}
    {showForm && <p id="bid-guidance" className="secure-note">{intent ? 'Percobaan sebelumnya belum terkonfirmasi. Ulangi request dengan nominal dan ID yang sama untuk memastikan hasilnya.' : `Nominal harus berupa rupiah bulat dan minimal ${formatRupiah(minimum)}. Server memvalidasi setiap penawaran.`}</p>}
    {validationError && <p id="bid-validation" className="bid-feedback form-error" role="alert">{validationError}</p>}
    {feedback && <p className={`bid-feedback bid-feedback-${feedback.type}`} role={feedback.type === 'success' ? 'status' : 'alert'}>{feedback.message}</p>}
  </section>;
}
