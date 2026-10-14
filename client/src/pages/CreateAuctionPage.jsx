import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AuctionForm from '../components/AuctionForm';
import { createAuction, loadAuctionSnapshot, selectActiveError, selectActiveId, selectActiveLoading, selectCreateError, selectCreateStatus, selectEditError, selectEditStatus, updateAuction } from '../features/auctions/auctionSlice';
import { selectUser } from '../features/auth/authSlice';
import { rememberAuction } from '../lib/knownAuctions';

export default function CreateAuctionPage({ mode = 'create' }) {
  const isEdit = mode === 'edit';
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const createStatus = useSelector(selectCreateStatus);
  const createError = useSelector(selectCreateError);
  const editStatus = useSelector(selectEditStatus);
  const editError = useSelector(selectEditError);
  const activeError = useSelector(selectActiveError);
  const activeId = useSelector(selectActiveId);
  const activeLoading = useSelector(selectActiveLoading);
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [conflictMessage, setConflictMessage] = useState('');
  const [localError, setLocalError] = useState(null);
  const [localSaving, setLocalSaving] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return undefined;
    let current = true;
    const request = dispatch(loadAuctionSnapshot(id));
    setLoading(true);
    setLoadError(null);
    request.unwrap()
      .then((snapshot) => { if (current) setAuction(snapshot.auction); })
      .catch((error) => { if (current) setLoadError({ message: typeof error === 'string' ? error : error?.message || 'Lelang tidak dapat dimuat.' }); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; request.abort(); };
  }, [dispatch, id, isEdit]);

  const ownsAuction = Boolean(auction && user && Number(auction.seller?.id) === Number(user.id));
  const canEdit = isEdit && ownsAuction && auction?.status === 'draft';

  async function refreshAuction({ message = '' } = {}) {
    try {
      const snapshot = await dispatch(loadAuctionSnapshot(id)).unwrap();
      setAuction(snapshot.auction);
      setConflictMessage(message || (snapshot.auction.status !== 'draft' ? 'Lelang sudah tidak berstatus draft. Perubahan dinonaktifkan.' : 'Data lelang sudah diperbarui dari server.'));
      setLocalError(null);
    } catch (error) {
      setConflictMessage(message || 'Draft sudah tidak dapat diakses. Data terbaru tidak tersedia.');
      setLocalError({ message: typeof error === 'string' ? error : error?.message || 'Lelang tidak dapat dimuat.' });
    }
  }

  async function handleSubmit(payload) {
    setLocalError(null);
    setConflictMessage('');
    setLocalSaving(true);
    try {
      if (isEdit) {
        if (!canEdit) throw { message: 'Hanya pemilik yang dapat mengedit lelang berstatus draft.' };
        const updated = await dispatch(updateAuction({ auctionId: id, payload })).unwrap();
        setAuction(updated);
        navigate(`/auctions/${id}`, { replace: true, state: { notice: 'Draft berhasil diperbarui.' } });
      } else {
        const created = await dispatch(createAuction(payload)).unwrap();
        rememberAuction(user?.id, created.id);
        navigate(`/auctions/${created.id}`, { replace: true, state: { notice: 'Draft berhasil disimpan.' } });
      }
    } catch (error) {
      const formatted = typeof error === 'string' ? { message: error } : error || { message: 'Permintaan gagal. Coba lagi.' };
      setLocalError(formatted);
      if (isEdit && ['AUCTION_NOT_DRAFT', 'FORBIDDEN', 'NOT_FOUND'].includes(formatted.code)) {
        await refreshAuction({ message: formatted.message });
      }
      throw formatted;
    } finally {
      setLocalSaving(false);
    }
  }

  if (isEdit && loading) return <div className="page container"><div className="loading-card">Memuat draft lelang…</div></div>;
  if (isEdit && (loadError || !auction || activeId !== String(id) && activeLoading)) {
    return (
      <div className="page container"><section className="error-card page-state" role="alert">
        <p className="eyebrow">Seller studio</p><h1 className="display">Draft tidak tersedia.</h1>
        <p>{loadError?.message || activeError || 'Lelang tidak ditemukan atau kamu tidak memiliki akses.'}</p>
        <Link className="btn btn-primary" to="/my-auctions">Kembali ke lelang saya</Link>
      </section></div>
    );
  }
  if (isEdit && !ownsAuction) {
    return (
      <div className="page container"><section className="error-card page-state" role="alert">
        <p className="eyebrow">Akses seller</p><h1 className="display">Draft ini bukan milikmu.</h1>
        <p>Hanya pemilik lelang yang dapat mengubah draft.</p><Link className="btn btn-primary" to="/my-auctions">Kembali ke lelang saya</Link>
      </section></div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">Seller studio · {isEdit ? 'Edit draft' : 'Draft baru'}</p>
        <div className="section-head seller-page-head">
          <div><h1 className="page-title display">{isEdit ? <>Sempurnakan<br />detail lelang.</> : <>Buat lelang<br />yang meyakinkan.</>}</h1></div>
          <p>{isEdit ? 'Perubahan hanya tersedia selama lelang berstatus draft.' : 'Lengkapi informasi produk. Lelang akan tersimpan sebagai draft dan belum dimulai.'}</p>
        </div>
        <div className="sell-layout">
          <AuctionForm
            key={isEdit ? `edit-${id}` : 'create'}
            initialAuction={isEdit ? auction : null}
            saving={localSaving || (isEdit ? editStatus === 'loading' : createStatus === 'loading')}
            disabled={isEdit && !canEdit}
            serverError={localError || (isEdit ? editError : createError)}
            conflictMessage={conflictMessage}
            submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan draft'}
            onSubmit={handleSubmit}
            onCancel={() => navigate(isEdit ? `/auctions/${id}` : '/')}
          />
          <aside className="side-card seller-side-card">
            <p className="eyebrow amber-text">Checklist listing</p>
            <h2 className="display">Bantu pembeli memahami kondisi produk.</h2>
            <ul>
              <li><i className="check">✓</i><span>Jelaskan kondisi dan kekurangan dengan jujur.</span></li>
              <li><i className="check">✓</i><span>Lengkapi spesifikasi dan aksesori yang tersedia.</span></li>
              <li><i className="check">✓</i><span>Gunakan harga integer dalam rupiah.</span></li>
              <li><i className="check">✓</i><span>Kategori produk mengikuti pilihan yang tersedia.</span></li>
              <li><i className="check">✓</i><span>Draft tidak tampil di marketplace publik.</span></li>
            </ul>
            {isEdit && auction?.status !== 'draft' && <p className="side-note">Lelang sudah dimulai atau berakhir. Data form dipertahankan, tetapi tidak dapat disimpan.</p>}
          </aside>
        </div>
        {isEdit && <p className="sr-only" aria-live="polite">{conflictMessage}</p>}
      </div>
    </div>
  );
}
