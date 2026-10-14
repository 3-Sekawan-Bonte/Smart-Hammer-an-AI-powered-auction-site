import { Link } from 'react-router-dom';
import { ArrowIcon } from './Icons';
import Countdown from './Countdown';

export const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

export default function AuctionCard({ auction }) {
  return (
    <article className="auction-card">
      <div className="card-visual">
        <div className="product-shot" style={{ backgroundPosition: auction.visualPosition }} role="img" aria-label={auction.title} />
        <span className={`badge badge-live ${auction.status === 'ended' ? 'badge-ended' : ''}`}>{auction.status === 'ended' ? 'Berakhir' : 'Live'}</span>
        <span className="lot-number">LOT {String(auction.id).padStart(3, '0')}</span>
      </div>
      <div className="card-body">
        <div className="card-kicker"><span>{conditionLabel(auction.condition)}</span><span>{auction.bids} penawaran</span></div>
        <h3 className="card-title">{auction.title}</h3>
        <div className="card-meta"><div><span className="small muted">{auction.bids ? 'Harga saat ini' : 'Harga awal'}</span><strong>{money(auction.price)}</strong></div><div className="card-time"><span className="small muted">{auction.status === 'ended' ? 'Status' : 'Berakhir dalam'}</span><strong>{auction.status === 'ended' ? 'Berakhir' : <><i /><Countdown endsAt={auction.endsAt} /></>}</strong></div></div>
        <div className="card-footer"><span className="seller-name">Penjual @{auction.seller}</span><Link className="card-link" to={`/auctions/${auction.id}`}>Lihat lot <ArrowIcon /></Link></div>
      </div>
    </article>
  );
}

function conditionLabel(condition) {
  return ({ new: 'Baru', used_good: 'Bekas · Baik', used_fair: 'Bekas · Cukup' })[condition] || 'Kondisi belum dicantumkan';
}
