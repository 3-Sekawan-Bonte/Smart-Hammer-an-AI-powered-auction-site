import { Link } from 'react-router-dom';
import { ArrowIcon } from './Icons';
import Countdown from './Countdown';

export const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

export default function AuctionCard({ auction }) {
  return (
    <article className="auction-card">
      <div className="card-visual">
        <div className="product-shot" style={{ backgroundPosition: auction.visualPosition }} aria-hidden="true" />
        <img className="card-product-img" loading="lazy" decoding="async" src={auction.imageUrl || '/assets/product-image-fallback.svg'} alt={auction.title} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = '/assets/product-image-fallback.svg'; } else event.currentTarget.hidden = true; }} />
        <span className={`badge ${auction.status === 'live' ? 'badge-live' : auction.status === 'ended' ? 'badge-ended' : 'badge-draft'}`}>{auction.status === 'ended' ? 'Berakhir' : auction.status === 'draft' ? 'Draft' : 'Live'}</span>
        <span className="lot-number">LOT {String(auction.id).padStart(3, '0')}</span>
      </div>
      <div className="card-body">
        <div className="card-kicker"><span>{conditionLabel(auction.condition)}</span><span>{auction.status === 'draft' ? 'Belum dimulai' : `${auction.bids} penawaran`}</span></div>
        <h3 className="card-title">{auction.title}</h3>
        <div className="card-meta"><div><span className="small muted">{auction.bids ? 'Harga saat ini' : 'Harga awal'}</span><strong>{money(auction.price)}</strong></div><div className="card-time"><span className="small muted">{auction.status === 'ended' ? 'Status' : auction.status === 'draft' ? 'Tahap' : 'Berakhir dalam'}</span><strong>{auction.status === 'ended' ? 'Berakhir' : auction.status === 'draft' ? 'Draft' : <><i /><Countdown endsAt={auction.endsAt} /></>}</strong></div></div>
        <div className="card-footer"><span className="seller-name">Penjual @{auction.sellerName || (typeof auction.seller === 'object' ? auction.seller?.username : auction.seller) || 'seller'}</span><Link className="card-link" to={`/auctions/${auction.id}`}>Lihat lot <ArrowIcon /></Link></div>
      </div>
    </article>
  );
}

function conditionLabel(condition) {
  return ({ new: 'Baru', used_good: 'Bekas · Baik', used_fair: 'Bekas · Cukup' })[condition] || 'Kondisi belum dicantumkan';
}
