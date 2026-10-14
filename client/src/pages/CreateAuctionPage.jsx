import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowIcon } from '../components/Icons';
import { createAuction, selectCreateStatus, selectCreateError, resetCreateStatus } from '../features/auctions/auctionSlice';
import { useDispatch, useSelector } from 'react-redux';

const initialForm = {
  title: '',
  description: '',
  condition: 'used_good',
  duration: '1800',
  startingPrice: '',
  minIncrement: '',
  productFacts: {
    specifications: '',
    defects: '',
    accessories: '',
    warranty: '',
  },
  imageUrl: '',
};

export default function CreateAuctionPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, isAuthenticated } = useAuth();
  const createStatus = useSelector(selectCreateStatus);
  const createError = useSelector(selectCreateError);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');

  const previewPrice = useMemo(
    () => Number(form.startingPrice || 0).toLocaleString('id-ID'),
    [form.startingPrice],
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormError('');
  };

  const updateProductFacts = (field, value) => {
    setForm((current) => ({
      ...current,
      productFacts: { ...current.productFacts, [field]: value },
    }));
    setFormError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated || !user) {
      setFormError('Silakan login terlebih dahulu.');
      return;
    }
    const startingPrice = Number(form.startingPrice);
    const minIncrement = Number(form.minIncrement);
    const durationSeconds = Number(form.duration);

    if (form.title.trim().length < 3 || form.title.trim().length > 120) {
      setFormError('Nama barang harus 3–120 karakter.');
      return;
    }
    if (form.description.trim().length < 10 || form.description.trim().length > 3000) {
      setFormError('Deskripsi harus 10–3000 karakter.');
      return;
    }
    if (!Number.isSafeInteger(startingPrice) || !Number.isSafeInteger(minIncrement) || startingPrice < 1 || minIncrement < 1 || startingPrice > 2_000_000_000 || minIncrement > 2_000_000_000) {
      setFormError('Harga awal dan minimum kenaikan harus integer rupiah antara 1 hingga 2.000.000.000.');
      return;
    }
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86400) {
      setFormError('Durasi lelang harus integer antara 60 hingga 86400 detik (24 jam).');
      return;
    }
    let imageUrl;
    try {
      imageUrl = new URL(form.imageUrl.trim());
      if (imageUrl.protocol !== 'https:' || form.imageUrl.trim().length > 2048) throw new Error();
    } catch {
      setFormError('Masukkan URL gambar HTTPS yang valid (maksimal 2048 karakter).');
      return;
    }
    const accessories = form.productFacts.accessories.split(',').map((item) => item.trim()).filter(Boolean);
    if (accessories.length > 10 || accessories.some((item) => item.length > 100)) {
      setFormError('Masukkan maksimal 10 aksesori, masing-masing maksimal 100 karakter.');
      return;
    }

    try {
      const createdAuction = await dispatch(createAuction({
        title: form.title.trim(),
        description: form.description.trim(),
        condition: form.condition,
        productFacts: {
          specifications: form.productFacts.specifications || null,
          defects: form.productFacts.defects || null,
          accessories,
          warranty: form.productFacts.warranty || null,
        },
        imageUrl: imageUrl.href,
        startingPrice,
        minIncrement,
        durationSeconds,
      })).unwrap();
      dispatch(resetCreateStatus());
      navigate(`/auctions/${createdAuction.id}`, { replace: true });
    } catch (requestError) {
      setFormError(requestError.message || requestError);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">Seller studio</p>
        <div className="section-head">
          <div><h1 className="page-title display">Buat lelang<br />yang meyakinkan.</h1></div>
          <p>FE-01 menyimpan draft pada mock lokal. AI dan bidding belum aktif.</p>
        </div>

        <div className="sell-layout">
          <form className="form-card" onSubmit={submit} noValidate>
            {(formError || (createStatus === 'error' && createError)) && (
              <p className="form-error" role="alert">{formError || createError}</p>
            )}
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="title">Nama barang</label>
                <input className="input" id="title" name="title" value={form.title} onChange={updateField} minLength={3} maxLength={120} required placeholder="Contoh: Headphone Studio Aurora" />
              </div>
              <div className="field full">
                <label htmlFor="description">Deskripsi dan kondisi</label>
                <textarea className="input" id="description" name="description" value={form.description} onChange={updateField} minLength={10} maxLength={3000} required placeholder="Jelaskan usia, kondisi, kekurangan, dan kelengkapannya..." />
                <p className="helper">10–3000 karakter · tuliskan kekurangan barang dengan jujur.</p>
              </div>
              <div className="field">
                <label htmlFor="condition">Kondisi</label>
                <select className="input" id="condition" name="condition" value={form.condition} onChange={updateField}>
                  <option value="new">Baru</option>
                  <option value="used_good">Bekas - Baik</option>
                  <option value="used_fair">Bekas - Cukup</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="duration">Durasi lelang (detik)</label>
                <input className="input" id="duration" name="duration" type="number" min="60" max="86400" step="1" value={form.duration} onChange={updateField} required placeholder="1800" />
                <p className="helper">Min 60 detik, max 86400 detik (24 jam)</p>
              </div>
              <div className="field">
                <label htmlFor="price">Harga awal (IDR)</label>
                <input className="input" id="price" name="startingPrice" type="number" min="1" max="2000000000" step="1" value={form.startingPrice} onChange={updateField} required placeholder="1000000" />
              </div>
              <div className="field">
                <label htmlFor="increment">Minimum kenaikan</label>
                <input className="input" id="increment" name="minIncrement" type="number" min="1" max="2000000000" step="1" value={form.minIncrement} onChange={updateField} required placeholder="50000" />
              </div>
              <div className="field full">
                <label htmlFor="imageUrl">URL Gambar (HTTPS)</label>
                <input className="input" id="imageUrl" name="imageUrl" type="url" value={form.imageUrl} onChange={updateField} maxLength={2048} required placeholder="https://example.com/image.jpg" />
              </div>
              <div className="field full">
                <p className="eyebrow">Fakta Produk (untuk AI Q&A)</p>
              </div>
              <div className="field full">
                <label htmlFor="specifications">Spesifikasi</label>
                <textarea className="input" id="specifications" name="specifications" maxLength={2000} value={form.productFacts.specifications} onChange={(e) => updateProductFacts('specifications', e.target.value)} placeholder="Contoh: Driver 40mm, impedansi 32 ohm, respons frekuensi 20Hz-20kHz" />
              </div>
              <div className="field full">
                <label htmlFor="defects">Kekurangan/Cacat</label>
                <textarea className="input" id="defects" name="defects" maxLength={1000} value={form.productFacts.defects} onChange={(e) => updateProductFacts('defects', e.target.value)} placeholder="Contoh: Gores halus pada case kiri, padding headband sedikit aus" />
              </div>
              <div className="field full">
                <label htmlFor="accessories">Aksesoris (pisahkan dengan koma)</label>
                <input className="input" id="accessories" name="accessories" value={form.productFacts.accessories} onChange={(e) => updateProductFacts('accessories', e.target.value)} placeholder="Contoh: Case carrying, Kabel 1.2m, Adapter 6.3mm" />
              </div>
              <div className="field full">
                <label htmlFor="warranty">Garansi</label>
                <input className="input" id="warranty" name="warranty" maxLength={500} value={form.productFacts.warranty} onChange={(e) => updateProductFacts('warranty', e.target.value)} placeholder="Contoh: Garansi resmi tersisa 6 bulan" />
              </div>
              <div className="listing-preview full" aria-live="polite">
                <div>
                  <span className="small muted">Preview publikasi</span>
                  <strong>{form.title || 'Nama barangmu'}</strong>
                </div>
                <div><span className="small muted">Harga awal</span><strong>Rp{previewPrice}</strong></div>
                <span className="preview-category">electronics</span>
              </div>
            </div>
            <div className="hero-actions">
              <button className="btn btn-primary" disabled={createStatus === 'loading'}>
                {createStatus === 'loading' ? 'Menyimpan…' : <>Simpan draft <ArrowIcon /></>}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>Batal</button>
            </div>
          </form>

          <aside className="side-card">
            <p className="eyebrow amber-text">Checklist listing</p>
            <h2 className="display">Barang bagus dimulai dari cerita yang jujur.</h2>
            <ul>
              <li><i className="check">✓</i><span>Jelaskan cacat secara spesifik.</span></li>
              <li><i className="check">✓</i><span>Sebutkan kelengkapan dan status garansi.</span></li>
              <li><i className="check">✓</i><span>Gunakan harga awal yang masuk akal.</span></li>
              <li><i className="check">✓</i><span>Kategori otomatis: electronics.</span></li>
              <li><i className="check">✓</i><span>Draft disimpan ke mock lokal (development only).</span></li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
