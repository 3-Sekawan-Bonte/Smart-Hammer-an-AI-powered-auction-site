import { formatRupiah } from '../features/auctions/bidUtils.js';
import { getAuctionResultState } from '../features/auctions/auctionResult.js';
import AuctionPayment from './AuctionPayment.jsx';
import { isAuctionPaymentWinner } from '../features/auctions/paymentFlow.js';

export { getAuctionResultState } from '../features/auctions/auctionResult.js';

export default function WinnerBanner({ auction, user }) {
  const result = getAuctionResultState(auction);
  if (result.kind === 'hidden') return null;
  if (result.kind === 'loading') {
    return <section className="winner-banner winner-banner-loading" role="status" aria-live="polite">
      <span className="winner-icon" aria-hidden="true">◷</span>
      <div><p className="eyebrow">Lelang berakhir</p><h2>Memastikan hasil resmi…</h2><p>Hasil akan ditampilkan setelah snapshot server terverifikasi.</p></div>
    </section>;
  }
  if (result.kind === 'no-bids') {
    return <section className="winner-banner winner-banner-empty" role="status" aria-live="polite">
      <span className="winner-icon" aria-hidden="true">—</span>
      <div><p className="eyebrow">Lelang berakhir</p><h2>Lelang berakhir tanpa penawaran.</h2><p>Tidak ada pemenang dan tidak ada harga penjualan akhir.</p></div>
    </section>;
  }
  const isWinner = isAuctionPaymentWinner(user, auction);
  return <section className="winner-banner winner-banner-success" role="status" aria-live="polite">
    <span className="winner-icon" aria-hidden="true">✓</span>
    <div className="winner-copy"><p className="eyebrow">Auction ended</p><h2>{isWinner ? 'Kamu memenangkan lelang ini!' : 'Lelang dimenangkan'}</h2><p className="winner-name">{result.winner.username}</p></div>
    <div className="winner-price"><span>Harga akhir</span><strong>{formatRupiah(result.finalPrice)}</strong></div>
    {isWinner && <AuctionPayment auctionId={auction.id} />}
  </section>;
}
