import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser } from '../features/auth/authSlice';
import { loadAuctions } from '../features/auctions/auctionSlice.js';
import AuctionCard from '../components/AuctionCard';

export default function MyAuctionsPage() {
  const user = useSelector(selectUser);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dispatch = useDispatch();
  useEffect(() => {
    let current = true;
    async function loadMine() {
      setLoading(true); setError('');
      try {
        const first = await dispatch(loadAuctions({ page: 1, limit: 50, seller: 'me' })).unwrap();
        const pages = await Promise.all(Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
          dispatch(loadAuctions({ page: index + 2, limit: 50, seller: 'me' })).unwrap()));
        if (current) setAuctions([...first.auctions, ...pages.flatMap((result) => result.auctions)]);
      } catch { if (current) setError('Daftar lelang milikmu gagal dimuat. Coba muat ulang.'); }
      finally { if (current) setLoading(false); }
    }
    loadMine();
    return () => { current = false; };
  }, [dispatch, user?.id]);

  return <section className="section"><div className="container">
    <p className="eyebrow">Seller studio</p><div className="section-head"><div><h1 className="display">Lelang saya</h1></div><p>Daftar ini dimuat dari akunmu dan disaring oleh backend.</p></div>
    {error && <div className="error-card" role="alert">{error}</div>}
    {loading ? <div className="loading-card">Memuat lelang milikmu…</div> : auctions.length ? <div className="auction-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={{ ...auction, price: auction.currentPrice ?? auction.startingPrice, bids: auction.bidCount ?? 0, visualPosition: '50% 50%' }} />)}</div> : <div className="empty-state"><h2>Belum ada lelang.</h2><p>Draft dan lelang yang kamu miliki akan muncul di sini.</p><Link className="btn btn-primary" to="/auctions/new">Buat draft lelang</Link></div>}
  </div></section>;
}
