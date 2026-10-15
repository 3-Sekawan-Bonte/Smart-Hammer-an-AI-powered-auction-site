import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { beginAuctionPayment, loadAuctionPayment, selectAuctionPayment } from '../features/auctions/auctionSlice.js';
import { selectActiveId } from '../features/auctions/auctionSlice.js';
import { openSnapCheckout } from '../features/auctions/paymentFlow.js';

const SNAP_SCRIPT_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
let snapLoadPromise = null;

function loadSnap(clientKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout is not available.'));
  if (window.snap?.pay) return Promise.resolve(window.snap);
  if (snapLoadPromise) return snapLoadPromise;
  snapLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SNAP_SCRIPT_URL;
    script.async = true;
    script.dataset.clientKey = clientKey;
    script.onload = () => window.snap?.pay ? resolve(window.snap) : reject(new Error('Checkout is not available.'));
    script.onerror = () => reject(new Error('Checkout is not available.'));
    document.head.appendChild(script);
  }).catch((error) => {
    snapLoadPromise = null;
    throw error;
  });
  return snapLoadPromise;
}

const labels = {
  creating: 'Menyiapkan pembayaran…',
  pending: 'Menunggu pembayaran',
  paid: 'Pembayaran terverifikasi',
  failed: 'Pembayaran gagal',
  expired: 'Sesi pembayaran kedaluwarsa',
  canceled: 'Pembayaran dibatalkan',
};

export default function AuctionPayment({ auctionId }) {
  const dispatch = useDispatch();
  const activeId = useSelector(selectActiveId);
  const paymentState = useSelector(selectAuctionPayment);
  const payment = paymentState.record;
  const [snapReady, setSnapReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canUsePayment = activeId === String(auctionId);

  useEffect(() => {
    if (canUsePayment) dispatch(loadAuctionPayment(String(auctionId)));
  }, [canUsePayment, dispatch, auctionId]);

  useEffect(() => {
    if (payment?.status !== 'pending' || !payment.snapToken || !paymentState.clientKey) {
      setSnapReady(false);
      return undefined;
    }
    let active = true;
    loadSnap(paymentState.clientKey)
      .then(() => { if (active) setSnapReady(true); })
      .catch(() => { if (active) { setSnapReady(false); setNotice('Checkout Sandbox tidak dapat dimuat. Coba muat ulang halaman.'); } });
    return () => { active = false; };
  }, [payment?.status, payment?.snapToken, paymentState.clientKey]);

  async function refreshStatus() {
    try {
      await dispatch(loadAuctionPayment(String(auctionId))).unwrap();
      setNotice('Status diperbarui dari server.');
    } catch (error) {
      setNotice(error?.message || 'Status pembayaran belum dapat diperbarui.');
    }
  }

  async function startPayment() {
    setBusy(true);
    setNotice('');
    try {
      await dispatch(beginAuctionPayment(String(auctionId))).unwrap();
      setNotice('Sesi pembayaran siap. Lanjutkan ke checkout untuk memilih BCA Virtual Account atau Mandiri Bill Payment.');
    } catch (error) {
      if (error?.code === 'PAYMENT_STATUS_REFRESH_REQUIRED') {
        await refreshStatus();
      } else {
        setNotice(error?.message || 'Pembayaran belum dapat dimulai.');
      }
    } finally {
      setBusy(false);
    }
  }

  function openCheckout() {
    if (!snapReady || !payment?.snapToken || !window.snap?.pay) return;
    openSnapCheckout({ snap: window.snap, token: payment.snapToken, refreshStatus: () => dispatch(loadAuctionPayment(String(auctionId))), setNotice });
  }

  if (!canUsePayment) return null;
  const stateLabel = payment ? labels[payment.status] || 'Status pembayaran tersedia' : '';
  const canRetry = !payment || ['failed', 'expired', 'canceled'].includes(payment.status);

  return <div className="auction-payment" aria-live="polite">
    <p className="auction-payment-title">Pembayaran pemenang</p>
    {paymentState.status === 'loading' && !payment && <p>Memuat status pembayaran…</p>}
    {payment?.status === 'paid' && <p className="auction-payment-paid">✓ Pembayaran terverifikasi oleh server.</p>}
    {payment && payment.status !== 'paid' && <p className="auction-payment-status">{stateLabel}{payment.midtransStatus ? ` · ${payment.midtransStatus}` : ''}</p>}
    {payment?.status === 'pending' && payment.snapToken && <button className="btn btn-primary" type="button" disabled={!snapReady} onClick={openCheckout}>{snapReady ? 'Buka checkout Sandbox' : 'Memuat checkout…'}</button>}
    {canRetry && <button className="btn btn-primary" type="button" disabled={busy || paymentState.status === 'loading'} onClick={startPayment}>{busy ? 'Menyiapkan…' : payment ? 'Coba pembayaran lagi' : 'Bayar dengan Midtrans Sandbox'}</button>}
    {payment && payment.status !== 'paid' && <button className="btn btn-ghost" type="button" disabled={busy} onClick={refreshStatus}>Perbarui status</button>}
    <p className="auction-payment-methods">Metode yang tersedia: BCA Virtual Account dan Mandiri Bill Payment.</p>
    {notice && <p className="auction-payment-notice" role="status">{notice}</p>}
    {paymentState.error && <p className="auction-payment-error" role="alert">{paymentState.error.message || 'Status pembayaran belum dapat dimuat.'}</p>}
  </div>;
}
