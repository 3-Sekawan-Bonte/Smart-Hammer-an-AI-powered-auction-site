import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AuctionCard from '../components/AuctionCard';
import Countdown from '../components/Countdown';
import { ArrowIcon } from '../components/Icons';
import { loadAuctions, selectCatalogAuctions, selectCatalogLoading, selectCatalogError, selectCreateStatus, clearCatalogError } from '../features/auctions/auctionSlice';

export default function AuctionListPage() {
  const dispatch = useDispatch();
  const auctions = useSelector(selectCatalogAuctions);
  const catalogLoading = useSelector(selectCatalogLoading);
  const catalogError = useSelector(selectCatalogError);
  const createStatus = useSelector(selectCreateStatus);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('ending');

  // Get featured auction for hero preview (first live auction)
  const featuredAuction = useMemo(() => auctions.find(a => a.status === 'live') || auctions[0], [auctions]);

  useEffect(() => {
    dispatch(loadAuctions());
  }, [dispatch]);

  useEffect(() => {
    if (createStatus === 'success') {
      dispatch(clearCatalogError());
    }
  }, [createStatus, dispatch]);

  const results = useMemo(() => {
    const filtered = auctions.filter((item) => {
      const matchesQuery = `${item.title} ${item.seller}`.toLowerCase().includes(query.toLowerCase());
      return matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === 'ending') return Date.parse(a.endsAt || 0) - Date.parse(b.endsAt || 0);
      if (sortBy === 'lowest') return a.price - b.price;
      return b.bids - a.bids;
    });
  }, [query, sortBy, auctions]);

  return (
    <>
      <section className="hero modern-hero">
        <div className="container hero-grid">
          <div className="hero-content">
            <div className="live-pill"><span className="live-dot" />FE-01 · data mock lokal</div>
            <h1 className="display">Smart bid.<br /><span>Tepat sasaran.</span></h1>
            <p className="hero-copy">Jelajahi fixture lelang elektronik dan halaman detailnya. Bid, realtime, serta AI baru tersedia setelah backend diintegrasikan.</p>
            <div className="hero-actions"><a className="btn btn-primary" href="#auctions">Jelajahi lelang <ArrowIcon /></a><Link className="btn btn-ghost" to="/auctions/new">Jual barangmu</Link></div>
            <div className="hero-stats"><div><strong>{auctions.length}</strong><span>lelang tampil</span></div><div><strong>{auctions.reduce((total, item) => total + item.bids, 0)}</strong><span>penawaran tercatat</span></div><div><strong>FE-01</strong><span>preview baca-saja</span></div></div>
          </div>
          {featuredAuction && (
            <div className="hero-preview">
              <div className="preview-glow" />
              <div className="preview-card">
                <div className="preview-top">
                  <div>
                    <span className="preview-lot">LOT {String(featuredAuction.id).padStart(3, '0')} · ELECTRONICS</span>
                    <strong>{featuredAuction.title}</strong>
                  </div>
                  <span className={`badge static-badge ${featuredAuction.status === 'live' ? 'badge-live' : 'badge-ended'}`}>{featuredAuction.status === 'live' ? 'Live' : featuredAuction.status === 'draft' ? 'Draft' : 'Berakhir'}</span>
                </div>
                <div className="preview-product">
                  <div className="product-shot hero-product-shot" style={{ backgroundPosition: featuredAuction.visualPosition || '0% 0%' }} role="img" aria-label={featuredAuction.title} />
                  <span className="preview-condition">Fixture demo · {featuredAuction.condition}</span>
                </div>
                <div className="preview-info">
                  <div className="price-line">
                    <div><span className="small muted">Harga fixture</span><div className="price">{featuredAuction.price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}</div></div>
                    <div className="countdown-wrap"><span className="small muted">Berakhir dalam</span><span className="countdown"><Countdown endsAt={featuredAuction.endsAt} /></span></div>
                  </div>
                  <div className="preview-footer">
                    <Link to={`/auctions/${featuredAuction.id}`} className="preview-cta">Masuk room <ArrowIcon /></Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="market-strip"><div className="container market-strip-inner"><span><i /> LOCAL DEVELOPMENT MOCK</span><p>Snapshot demo untuk pengembangan frontend</p><p>{auctions.length} fixture lelang tersedia</p></div></section>
      <section className="section auction-section" id="auctions">
        <div className="container">
          <div className="section-head">
            <div><p className="eyebrow">Lelang elektronik</p><h2 className="display">Temukan barang pilihan</h2></div>
            <p>Snapshot lokal hanya untuk membangun dan memeriksa antarmuka. Harga tidak berubah tanpa backend.</p>
          </div>
          <div className="toolbar">
            <label className="search-wrap"><span>⌕</span><input className="search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari lot, seller..." aria-label="Cari lelang" /></label>
            <select className="filter" aria-label="Urutkan lelang" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="active">Bid terbanyak</option>
              <option value="ending">Segera berakhir</option>
              <option value="lowest">Harga terendah</option>
            </select>
          </div>
          {catalogError && (
            <div className="error-card catalog-error" role="alert">
              <span>{catalogError}</span>
              <button className="btn btn-ghost" type="button" onClick={() => dispatch(loadAuctions())}>Coba lagi</button>
            </div>
          )}
          <div className="results-meta"><span>{results.length} lot ditemukan</span><span>Mock lokal · harga IDR</span></div>
          {catalogLoading ? (
            <div className="auction-grid" aria-label="Memuat lelang">
              {[1, 2, 3].map((item) => (
                <div className="auction-skeleton" key={item}><div /><span /><span /><span /></div>
              ))}
            </div>
          ) : results.length ? (
            <div className="auction-grid">{results.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div>
          ) : (
            <div className="empty-state"><h3>Belum ada lelang yang cocok.</h3><p>Coba kata kunci lain atau buat lelang baru.</p><Link to="/auctions/new" className="btn btn-primary">Buat lelang</Link></div>
          )}
        </div>
      </section>
      <section className="section feature-band"><div className="container"><div className="feature-intro"><p className="eyebrow">Belanja dengan informasi</p><h2 className="display">Lihat detailnya.<br /><span>Pilih dengan yakin.</span></h2></div><div className="feature-grid"><article className="feature"><span className="feature-index">01</span><div><h3>Informasi produk yang jelas.</h3><p>Periksa kondisi, spesifikasi, kekurangan, aksesori, dan penjual dalam satu halaman.</p></div></article><article className="feature"><span className="feature-index">02</span><div><h3>Status lelang transparan.</h3><p>Harga dan waktu mengikuti snapshot API; FE-01 tidak membuat aktivitas palsu.</p></div></article><article className="feature"><span className="feature-index">03</span><div><h3>Fondasi siap dikembangkan.</h3><p>Bidding, realtime, dan AI akan aktif saat layanan backend tersedia.</p></div></article></div></div></section>
    </>
  );
}
