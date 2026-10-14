import { useState } from 'react';
import { money } from './AuctionCard';
import { ArrowIcon } from './Icons';
import { AUCTION_DURATION_OPTIONS, auctionDurationLabel, auctionDurationSelection, isSupportedAuctionDuration, parseAuctionDuration } from '../features/auctions/auctionDuration';

const emptyValues = {
  title: '',
  description: '',
  condition: 'used_good',
  category: 'smartphone',
  imageUrl: '',
  startingPrice: '',
  minIncrement: '',
  durationSeconds: String(AUCTION_DURATION_OPTIONS[0].seconds),
  specifications: '',
  defects: '',
  accessories: '',
  warranty: '',
};

function valuesFromAuction(auction) {
  const facts = auction?.productFacts || {};
  return {
    title: auction?.title || '',
    description: auction?.description || '',
    condition: auction?.condition || 'used_good',
    category: auction?.category || 'smartphone',
    imageUrl: auction?.imageUrl || '',
    startingPrice: String(auction?.startingPrice ?? ''),
    minIncrement: String(auction?.minIncrement ?? ''),
    durationSeconds: auctionDurationSelection(auction?.durationSeconds),
    specifications: facts.specifications || '',
    defects: facts.defects || '',
    accessories: Array.isArray(facts.accessories) ? facts.accessories.join('\n') : '',
    warranty: facts.warranty || '',
  };
}

function validate(values) {
  const errors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const imageUrl = values.imageUrl.trim();
  const startingPrice = Number(values.startingPrice);
  const minIncrement = Number(values.minIncrement);
  const durationSeconds = parseAuctionDuration(values.durationSeconds);
  const accessories = values.accessories.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

  if (title.length < 3 || title.length > 120) errors.title = 'Judul wajib 3–120 karakter.';
  if (description.length < 10 || description.length > 3000) errors.description = 'Deskripsi wajib 10–3000 karakter.';
  if (!['new', 'used_good', 'used_fair'].includes(values.condition)) errors.condition = 'Pilih kondisi produk yang tersedia.';
  if (!['smartphone', 'laptop', 'pc', 'camera', 'tablet', 'monitor', 'audio', 'gaming_console', 'accessories'].includes(values.category)) errors.category = 'Pilih kategori yang tersedia.';
  if (imageUrl.length > 2048) errors.imageUrl = 'URL gambar maksimal 2048 karakter.';
  else {
    try {
      if (new URL(imageUrl).protocol !== 'https:') errors.imageUrl = 'Gunakan URL gambar HTTPS.';
    } catch {
      errors.imageUrl = 'Masukkan URL HTTPS yang valid.';
    }
  }
  for (const [field, amount] of [['startingPrice', startingPrice], ['minIncrement', minIncrement]]) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2_000_000_000) {
      errors[field] = 'Masukkan bilangan rupiah bulat antara 1 dan 2.000.000.000.';
    }
  }
  if (durationSeconds === null) {
    errors.durationSeconds = 'Pilih durasi 1, 3, atau 7 hari.';
  }
  if (values.specifications.length > 2000) errors.specifications = 'Maksimal 2000 karakter.';
  if (values.defects.length > 1000) errors.defects = 'Maksimal 1000 karakter.';
  if (values.warranty.length > 500) errors.warranty = 'Maksimal 500 karakter.';
  if (accessories.length > 10) errors.accessories = 'Masukkan maksimal 10 aksesori.';
  else if (accessories.some((item) => item.length > 100)) errors.accessories = 'Setiap aksesori maksimal 100 karakter.';

  return {
    errors,
    payload: {
      title,
      description,
      condition: values.condition,
      category: values.category,
      imageUrl,
      startingPrice,
      minIncrement,
      durationSeconds,
      productFacts: {
        specifications: values.specifications.trim() || null,
        defects: values.defects.trim() || null,
        accessories,
        warranty: values.warranty.trim() || null,
      },
    },
  };
}

const fieldMap = {
  'productFacts.specifications': 'specifications',
  'productFacts.defects': 'defects',
  'productFacts.accessories': 'accessories',
  'productFacts.warranty': 'warranty',
};

export function serverFieldErrors(error) {
  const fields = error?.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([field, message]) => [fieldMap[field] || field, message]));
}

export default function AuctionForm({
  initialAuction = null,
  saving = false,
  disabled = false,
  serverError = null,
  conflictMessage = '',
  submitLabel = 'Simpan draft',
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(() => initialAuction ? valuesFromAuction(initialAuction) : { ...emptyValues });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const formLocked = saving || disabled;
  const errors = { ...serverFieldErrors(serverError), ...fieldErrors };

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setSubmitError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    const result = validate(values);
    setFieldErrors(result.errors);
    if (Object.keys(result.errors).length) {
      setSubmitError('Periksa kembali kolom yang ditandai.');
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    try {
      await onSubmit(result.payload);
    } catch (error) {
      const mapped = serverFieldErrors(error);
      if (Object.keys(mapped).length) setFieldErrors(mapped);
      else setSubmitError(error?.message || String(error) || 'Permintaan gagal. Coba lagi.');
    }
  }

  const fieldProps = (name) => ({
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
    disabled: formLocked,
    onChange: (event) => setField(name, event.target.value),
    value: values[name],
  });
  const errorText = (name) => errors[name] && <span className="field-error" id={`${name}-error`}>{errors[name]}</span>;

  return (
    <form className="form-card auction-form" onSubmit={handleSubmit} noValidate>
      {conflictMessage && <div className="form-notice" role="status">{conflictMessage}</div>}
      {(submitError || serverError?.message) && <p className="form-error" role="alert">{submitError || serverError.message}</p>}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="auction-title">Nama barang</label>
          <input className="input" id="auction-title" {...fieldProps('title')} minLength={3} maxLength={120} required placeholder="Contoh: Headphone Studio Aurora" />
          {errorText('title')}
        </div>
        <div className="field full">
          <label htmlFor="auction-description">Deskripsi produk</label>
          <textarea className="input" id="auction-description" {...fieldProps('description')} minLength={10} maxLength={3000} required placeholder="Jelaskan kondisi, usia pemakaian, dan informasi penting produk." />
          {errorText('description')}
        </div>
        <div className="field">
          <label htmlFor="auction-condition">Kondisi</label>
          <select className="input" id="auction-condition" {...fieldProps('condition')}>
            <option value="new">Baru</option>
            <option value="used_good">Bekas · Baik</option>
            <option value="used_fair">Bekas · Cukup</option>
          </select>
          {errorText('condition')}
        </div>
        <div className="field">
          <label htmlFor="auction-category">Kategori</label>
          <select className="input" id="auction-category" {...fieldProps('category')}>
            <option value="smartphone">Smartphone</option><option value="laptop">Laptop</option><option value="pc">PC</option>
            <option value="camera">Kamera</option><option value="tablet">Tablet</option><option value="monitor">Monitor</option>
            <option value="audio">Audio</option><option value="gaming_console">Konsol game</option><option value="accessories">Aksesori</option>
          </select>
          {errorText('category')}
        </div>
        <div className="field">
          <label htmlFor="auction-duration">Durasi lelang</label>
          <select
            className="input"
            id="auction-duration"
            {...fieldProps('durationSeconds')}
            value={isSupportedAuctionDuration(Number(values.durationSeconds)) ? values.durationSeconds : ''}
            required
          >
            {AUCTION_DURATION_OPTIONS.map(({ label, seconds }) => <option key={seconds} value={seconds}>{label}</option>)}
          </select>
          <p className="helper">
            {Number.isSafeInteger(Number(values.durationSeconds)) && !isSupportedAuctionDuration(Number(values.durationSeconds))
              ? `Durasi draft saat ini: ${auctionDurationLabel(Number(values.durationSeconds))}. Pilih salah satu durasi di atas untuk menyimpan perubahan.`
              : 'Waktu mulai dan akhir ditetapkan server saat lelang dimulai.'}
          </p>
          {errorText('durationSeconds')}
        </div>
        <div className="field">
          <label htmlFor="auction-starting-price">Harga awal (IDR)</label>
          <input className="input" id="auction-starting-price" type="number" inputMode="numeric" min="1" max="2000000000" step="1" {...fieldProps('startingPrice')} required placeholder="1000000" />
          {errorText('startingPrice')}
        </div>
        <div className="field">
          <label htmlFor="auction-min-increment">Minimum kenaikan (IDR)</label>
          <input className="input" id="auction-min-increment" type="number" inputMode="numeric" min="1" max="2000000000" step="1" {...fieldProps('minIncrement')} required placeholder="50000" />
          {errorText('minIncrement')}
        </div>
        <div className="field full">
          <label htmlFor="auction-image-url">URL gambar produk (HTTPS)</label>
          <input className="input" id="auction-image-url" type="url" maxLength={2048} {...fieldProps('imageUrl')} required placeholder="https://example.com/product.jpg" />
          {errorText('imageUrl')}
        </div>
        <div className="field full facts-heading">
          <p className="eyebrow">Informasi produk</p>
          <p className="helper">Pilih kategori yang paling sesuai dengan barang.</p>
        </div>
        <div className="field full">
          <label htmlFor="auction-specifications">Spesifikasi</label>
          <textarea className="input" id="auction-specifications" maxLength={2000} {...fieldProps('specifications')} placeholder="Spesifikasi utama produk" />
          {errorText('specifications')}
        </div>
        <div className="field full">
          <label htmlFor="auction-defects">Kekurangan atau cacat</label>
          <textarea className="input" id="auction-defects" maxLength={1000} {...fieldProps('defects')} placeholder="Catat kondisi dan kekurangan secara jujur" />
          {errorText('defects')}
        </div>
        <div className="field full">
          <label htmlFor="auction-accessories">Aksesori</label>
          <textarea className="input accessories-input" id="auction-accessories" maxLength={1100} {...fieldProps('accessories')} placeholder={'Satu aksesori per baris\nContoh: Kabel USB-C'} />
          <p className="helper">Maksimal 10 aksesori, 100 karakter per baris.</p>
          {errorText('accessories')}
        </div>
        <div className="field full">
          <label htmlFor="auction-warranty">Garansi</label>
          <input className="input" id="auction-warranty" maxLength={500} {...fieldProps('warranty')} placeholder="Informasi garansi, bila tersedia" />
          {errorText('warranty')}
        </div>
        <div className="listing-preview full" aria-live="polite">
          <div><span className="small muted">Preview listing</span><strong>{values.title || 'Nama produk'}</strong></div>
          <div><span className="small muted">Harga awal</span><strong>{values.startingPrice ? money(Number(values.startingPrice)) : '—'}</strong></div>
          <span className="preview-category">{values.category.replaceAll('_', ' ')}</span>
        </div>
      </div>
      <div className="form-actions hero-actions">
        <button className="btn btn-primary" type="submit" disabled={formLocked}>
          {saving ? 'Menyimpan…' : <>{submitLabel} <ArrowIcon /></>}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={saving}>Batal</button>
      </div>
      {disabled && <p className="helper">Lelang ini bukan draft dan tidak bisa diubah.</p>}
    </form>
  );
}
