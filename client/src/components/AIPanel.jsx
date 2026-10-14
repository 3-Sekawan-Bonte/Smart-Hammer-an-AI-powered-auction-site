import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { askAI, loadAIInteractions, selectActiveAIInteractions, selectActiveAIMeta, selectAuctionStatus, selectActiveId } from '../features/auctions/auctionSlice.js';
import { selectUser } from '../features/auth/authSlice.js';
import { selectConnectionStatus } from '../features/socket/socketSlice.js';
import { validateAIQuestion } from '../features/auctions/aiInteraction.js';

const MIN_QUESTION = 3;
const MAX_QUESTION = 500;

export default function AIPanel({ auctionId, status, auctionVersion = null }) {
  const dispatch = useDispatch();
  const activeId = useSelector(selectActiveId);
  const auctionStatus = useSelector(selectAuctionStatus);
  const interactions = useSelector(selectActiveAIInteractions);
  const meta = useSelector(selectActiveAIMeta);
  const user = useSelector(selectUser);
  const connectionStatus = useSelector(selectConnectionStatus);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const id = String(auctionId);
  const currentStatus = status || auctionStatus;
  const pending = useMemo(() => interactions.some((item) => item.status === 'pending'), [interactions]);
  const canAsk = Boolean(user && activeId === id && ['live', 'ended'].includes(currentStatus));

  useEffect(() => {
    if (activeId === id && !meta && !Number(interactions.length)) {
      dispatch(loadAIInteractions({ auctionId: id, page: 1 })).unwrap().catch(() => setHistoryError(true));
    }
  }, [dispatch, id, activeId, meta, interactions.length]);

  useEffect(() => {
    if (!pending || connectionStatus === 'connected' || !user || activeId !== id) return undefined;
    const timer = window.setInterval(() => {
      dispatch(loadAIInteractions({ auctionId: id, page: 1 })).unwrap().then(() => setHistoryError(false)).catch(() => setHistoryError(true));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [dispatch, id, activeId, pending, connectionStatus, user]);

  useEffect(() => {
    if (!pending || connectionStatus !== 'connected' || !user || activeId !== id) return;
    dispatch(loadAIInteractions({ auctionId: id, page: 1 })).unwrap().catch(() => setHistoryError(true));
  }, [dispatch, id, activeId, pending, connectionStatus, user]);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) { setCooldownUntil(0); window.clearInterval(timer); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!canAsk || sending || !validateAIQuestion(cleanQuestion).valid || Date.now() < cooldownUntil) return;
    setSending(true); setNotice('');
    try {
      await dispatch(askAI({ auctionId: id, question: cleanQuestion })).unwrap();
      setQuestion('');
      setNotice('Pertanyaan diterima. Jawaban akan muncul di riwayat ini.');
    } catch (failure) {
      const retry = Number(failure?.retryAfterSeconds || 0);
      if (retry > 0) setCooldownUntil(Date.now() + retry * 1000);
      setNotice(failure?.code === 'RATE_LIMITED'
        ? `Tunggu ${retry || 10} detik sebelum bertanya lagi.`
        : failure?.message || 'Pertanyaan belum terkirim. Coba lagi.');
    } finally { setSending(false); }
  }

  const ordered = [...interactions].filter((item) => item.visibility === 'public').reverse();
  return <section className="ai-panel card-panel" aria-labelledby="ai-panel-title">
    <header className="ai-panel-header"><div className="ai-avatar" aria-hidden="true">✦</div><div><p className="eyebrow">Smart Hammer AI</p><h2 id="ai-panel-title">AI Auctioneer</h2><p className="ai-panel-intro">Tanyakan detail produk atau lihat komentar lelang dari data yang tersedia.</p></div></header>
    <div className="ai-disclosure">Jawaban AI merujuk pada informasi penjual dan snapshot lelang. Informasi produk belum diverifikasi secara independen.</div>
    <div className="ai-history" aria-live="polite">
      {!ordered.length && <div className="ai-empty"><span aria-hidden="true">✧</span><strong>Belum ada percakapan</strong><p>Ajukan pertanyaan tentang spesifikasi, kondisi, garansi, atau kelengkapan produk.</p></div>}
      {ordered.map((item) => <article className={`ai-interaction ai-interaction-${item.status}`} key={item.id}>
        {item.kind === 'commentary' ? <p className="ai-commentary-label">✦ Komentar AI Auctioneer {item.generatedBy === 'mock' ? '· simulasi' : ''}</p> : <div className="ai-question"><span>{item.user?.username || item.askedBy?.username || 'Pengguna'}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><p>{item.question}</p></div>}
        {item.status === 'pending' && <div className="ai-pending"><span className="ai-spinner" aria-hidden="true" />AI sedang menyiapkan jawaban…</div>}
        {item.status === 'completed' && <div className="ai-answer"><span className="ai-answer-label">Jawaban AI {item.generatedBy === 'mock' ? '· simulasi' : ''}</span><p>{item.answer}</p>{item.missingInformation?.length > 0 && <div className="ai-missing"><strong>Belum tersedia dari penjual:</strong><ul>{item.missingInformation.map((missing) => <li key={missing}>{missingLabel(missing)}</li>)}</ul></div>}</div>}
        {item.status === 'failed' && <div className="ai-failed" role="status">{item.errorCode === 'AI_INTERRUPTED' ? 'Proses AI terhenti saat server dimulai ulang.' : 'Layanan AI belum dapat menjawab. Silakan ajukan pertanyaan baru nanti.'}</div>}
        <footer className="ai-source">Snapshot lelang v{item.sourceVersion ?? '—'} · {formatDate(item.snapshotAt)}{Number.isSafeInteger(auctionVersion) && Number(item.sourceVersion) < auctionVersion ? ' · jawaban merujuk snapshot sebelumnya' : ''}{item.updatedAt && item.status !== 'pending' ? ` · diperbarui ${formatDate(item.updatedAt)}` : ''}</footer>
      </article>)}
      {historyError && <p className="ai-history-error" role="status">Riwayat belum tersinkron. Kami akan mencoba lagi saat koneksi tersedia.</p>}
      {meta?.currentPage < meta?.totalPages && <button className="btn btn-ghost ai-load-more" type="button" onClick={() => dispatch(loadAIInteractions({ auctionId: id, page: meta.currentPage + 1 })).unwrap().catch(() => setHistoryError(true))}>Muat percakapan sebelumnya</button>}
    </div>
    {!canAsk ? <p className="ai-auth-hint">{!user ? 'Masuk untuk mengajukan pertanyaan.' : 'Tanya jawab tersedia setelah lelang dimulai.'}</p> : <form className="ai-question-form" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="ai-question">Pertanyaan untuk AI</label>
      <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, MAX_QUESTION))} maxLength={MAX_QUESTION} minLength={MIN_QUESTION} rows="3" placeholder="Contoh: Apakah charger termasuk dalam paket?" aria-describedby="ai-question-count ai-question-notice" />
      <div className="ai-form-footer"><span id="ai-question-count">{question.length}/{MAX_QUESTION}</span><button className="btn btn-primary" type="submit" disabled={sending || question.trim().length < MIN_QUESTION || Date.now() < cooldownUntil}>{sending ? 'Mengirim…' : Date.now() < cooldownUntil ? `Tunggu ${Math.ceil((cooldownUntil - Date.now()) / 1000)} dtk` : 'Tanya AI'}</button></div>
      <p id="ai-question-notice" className="ai-form-notice" role="status">{notice}</p>
    </form>}
  </section>;
}

function formatDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' WIB';
}
function missingLabel(value) {
  return ({ specifications: 'Spesifikasi', defects: 'Kekurangan atau kondisi', accessories: 'Aksesori', warranty: 'Garansi', authenticity: 'Keaslian produk', batteryHealth: 'Kesehatan baterai', marketPrice: 'Harga pasar' })[value] || value;
}
