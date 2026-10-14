import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AuctionCard from '../components/AuctionCard';
import Countdown from '../components/Countdown';
import { ArrowIcon } from '../components/Icons';
import { loadAuctions, selectCatalogAuctions, selectCatalogLoading, selectCatalogError, selectCreateStatus, selectCatalogMeta, clearCatalogError } from '../features/auctions/auctionSlice';

export default function AuctionListPage() {
  const dispatch = useDispatch();
  const auctions = useSelector(selectCatalogAuctions);
  const catalogLoading = useSelector(selectCatalogLoading);
  const catalogError = useSelector(selectCatalogError);
  const createStatus = useSelector(selectCreateStatus);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const meta = useSelector(selectCatalogMeta);

  // Get featured auction for hero preview (first live auction)
  const featuredAuction = useMemo(() => auctions.find(a => a.status === 'live') || auctions[0], [auctions]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, category, status]);

  useEffect(() => {
    dispatch(loadAuctions({ page, search, category, status }));
  }, [dispatch, page, search, category, status]);

  useEffect(() => {
    if (createStatus === 'success') {
      dispatch(clearCatalogError());
    }
  }, [createStatus, dispatch]);

  const results = auctions;

  return (
    <>
      <section className="hero modern-hero">
        <div className="container hero-grid">
          <div className="hero-content">
            <div className="live-pill"><span className="live-dot" />Marketplace elektronik</div>
            <h1 className="display">Lelang pilihan.<br /><span>Temukan elektronik.</span></h1>
            <p className="hero-copy">Temukan produk elektronik pilihan dengan informasi kondisi, harga, dan jadwal lelang yang bersumber dari API.</p>
            <div className="hero-actions"><a className="btn btn-primary" href="#auctions">Jelajahi lelang <ArrowIcon /></a><Link className="btn btn-ghost" to="/auctions/new">Jual barangmu</Link></div>
            <div className="hero-stats"><div><strong>{meta.totalData ?? auctions.length}</strong><span>lelang tersedia</span></div><div><strong>Elektronik</strong><span>kategori marketplace</span></div><div><strong>WIB</strong><span>waktu Indonesia Barat</span></div></div>
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
                  <img className="hero-product-image" src={featuredAuction.imageUrl || '/assets/product-image-fallback.svg'} alt={featuredAuction.title} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = '/assets/product-image-fallback.svg'; } else event.currentTarget.hidden = true; }} />
                  <span className="preview-condition">{conditionLabel(featuredAuction.condition)}</span>
                </div>
                <div className="preview-info">
                  <div className="price-line">
                    <div><span className="small muted">Harga saat ini</span><div className="price">{featuredAuction.price.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}</div></div>
                    <div className="countdown-wrap"><span className="small muted">Berakhir dalam</span><span className="countdown"><Countdown endsAt={featuredAuction.endsAt} /></span></div>
                  </div>
                  <div className="preview-footer">
                    <Link to={`/auctions/${featuredAuction.id}`} className="preview-cta">Lihat detail <ArrowIcon /></Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="market-strip"><div className="container market-strip-inner"><span><i /> ELECTRONICS AUCTIONS</span><p>Data mengikuti respons API</p><p>{meta.totalData ?? auctions.length} lelang tersedia</p></div></section>
      <section className="section auction-section" id="auctions">
        <div className="container">
          <div className="section-head">
            <div><p className="eyebrow">Lelang elektronik</p><h2 className="display">Temukan barang pilihan</h2></div>
            <p>Informasi lot dan harga ditampilkan sesuai data yang dikirim API.</p>
          </div>
          {catalogError && (
            <div className="error-card catalog-error" role="alert">
              <span>{catalogError}</span>
              <button className="btn btn-ghost" type="button" onClick={() => dispatch(loadAuctions())}>Coba lagi</button>
            </div>
          )}
          <div className="results-meta"><span>{meta.totalData ?? results.length} lot ditemukan</span><span>Halaman {meta.currentPage || page} dari {Math.max(1, meta.totalPages || 1)} · harga IDR</span></div>
          <div className="auction-filters" role="search" aria-label="Cari dan filter lelang">
            <label className="sr-only" htmlFor="auction-search">Cari judul lelang</label>
            <input id="auction-search" className="input" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari nama produk" />
            <label className="sr-only" htmlFor="auction-category-filter">Kategori</label>
            <select id="auction-category-filter" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Semua kategori</option><option value="smartphone">Smartphone</option><option value="laptop">Laptop</option><option value="pc">PC</option><option value="camera">Kamera</option><option value="tablet">Tablet</option><option value="monitor">Monitor</option><option value="audio">Audio</option><option value="gaming_console">Konsol game</option><option value="accessories">Aksesori</option>
            </select>
            <label className="sr-only" htmlFor="auction-status-filter">Status</label>
            <select id="auction-status-filter" className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Semua status aktif</option><option value="live">Live</option><option value="ended">Berakhir</option>
            </select>
          </div>
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
          {!catalogLoading && (meta.totalPages || 0) > 1 && <nav className="pagination" aria-label="Halaman lelang"><button className="btn btn-ghost" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Sebelumnya</button><span>Halaman {meta.currentPage || page} / {meta.totalPages}</span><button className="btn btn-ghost" type="button" onClick={() => setPage((value) => Math.min(meta.totalPages, value + 1))} disabled={page >= meta.totalPages}>Berikutnya</button></nav>}
        </div>
      </section>
      <section className="section feature-band"><div className="container"><div className="feature-intro"><p className="eyebrow">Belanja dengan informasi</p><h2 className="display">Lihat detailnya.<br /><span>Pilih dengan yakin.</span></h2></div><div className="feature-grid"><article className="feature"><span className="feature-index">01</span><div><h3>Informasi produk yang jelas.</h3><p>Periksa kondisi, spesifikasi, kekurangan, aksesori, dan penjual dalam satu halaman.</p></div></article><article className="feature"><span className="feature-index">02</span><div><h3>Status lelang transparan.</h3><p>Draft pribadi hanya dapat dilihat pemiliknya.</p></div></article><article className="feature"><span className="feature-index">03</span><div><h3>Alur seller yang mudah.</h3><p>Buat, perbarui, dan mulai lelang dari halaman yang sama.</p></div></article></div></div></section>
    </>
  );
}

function conditionLabel(condition) {
  return ({ new: 'Baru', used_good: 'Bekas · Baik', used_fair: 'Bekas · Cukup' })[condition] || 'Kondisi belum dicantumkan';
}
