import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api, { getApiData } from '../lib/api.js';
import { forgetAuction, readKnownAuctionIds } from '../lib/knownAuctions.js';
import { selectUser } from '../features/auth/authSlice';
import AuctionCard from '../components/AuctionCard';

export default function MyAuctionsPage() {
  const user = useSelector(selectUser);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      const ids = readKnownAuctionIds(user?.id);
      try {
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const response = await api.get(`/auctions/${id}`, { signal: controller.signal });
            const auction = getApiData(response)?.auction;
            if (!auction || Number(auction.seller?.id) !== Number(user?.id)) { forgetAuction(user?.id, id); return null; }
            return auction;
          } catch (requestError) {
            if (requestError.name === 'CanceledError') return null;
            if ([403, 404].includes(requestError.response?.status)) { forgetAuction(user?.id, id); return null; }
            throw requestError;
          }
        }));
        if (current) setAuctions(results.filter(Boolean));
      } catch { if (current) setError('Daftar lelang milikmu gagal dimuat. Coba muat ulang.'); }
      finally { if (current) setLoading(false); }
    }
    load();
    return () => { current = false; controller.abort(); };
  }, [user?.id]);

  return <section className="section"><div className="container">
    <p className="eyebrow">Seller studio</p><div className="section-head"><div><h1 className="display">Lelang saya</h1></div><p>Daftar ini menyimpan lelang yang dibuat dari browser ini. Draft tetap dilindungi oleh API.</p></div>
    {error && <div className="error-card" role="alert">{error}</div>}
    {loading ? <div className="loading-card">Memuat lelang milikmu…</div> : auctions.length ? <div className="auction-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={{ ...auction, price: auction.currentPrice ?? auction.startingPrice, bids: auction.bidCount ?? 0, visualPosition: '50% 50%' }} />)}</div> : <div className="empty-state"><h2>Belum ada lelang tersimpan.</h2><p>Lelang yang kamu buat dari browser ini akan muncul di sini.</p><Link className="btn btn-primary" to="/auctions/new">Buat draft lelang</Link></div>}
  </div></section>;
}
