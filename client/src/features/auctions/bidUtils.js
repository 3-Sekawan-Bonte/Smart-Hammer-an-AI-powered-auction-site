export const MAX_BID_AMOUNT = 2_000_000_000;

export function parseBidAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return { amount: null, error: 'Masukkan nominal rupiah berupa angka bulat.' };
  const amount = Number(text);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_BID_AMOUNT) {
    return { amount: null, error: 'Nominal harus antara Rp1 dan Rp2.000.000.000.' };
  }
  return { amount, error: null };
}

export function resolveBidSubmissionAmount(inputValue, auction) {
  const minimum = auction?.nextMinimumBid;
  if (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > MAX_BID_AMOUNT) {
    return { amount: null, error: 'Minimum bid terbaru belum tersedia. Muat ulang lelang sebelum mengirim bid.' };
  }
  const candidate = String(inputValue ?? '').trim() === '' ? minimum : inputValue;
  const parsed = parseBidAmount(candidate);
  if (parsed.error) return parsed;
  if (parsed.amount < minimum) {
    return { amount: null, error: `Nominal minimum saat ini ${formatRupiah(minimum)}.` };
  }
  return parsed;
}

export function formatRupiah(value) {
  if (value == null || value === '') return '—';
  if (!Number.isSafeInteger(Number(value))) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));
}

export function formatBidTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' WIB';
}

export function getBidAvailability({ auction, user, authRestoring = false }) {
  if (authRestoring) return { allowed: false, reason: 'Memeriksa sesi akun…' };
  if (!user) return { allowed: false, reason: 'Masuk untuk mengajukan penawaran.' };
  if (!auction || !Number.isSafeInteger(Number(auction.id)) || Number(auction.id) < 1) return { allowed: false, reason: 'Data lelang belum tersedia.' };
  if (auction.status !== 'live') return { allowed: false, reason: auction.status === 'ended' ? 'Lelang sudah berakhir.' : 'Lelang belum dimulai.' };
  if (Number(auction.seller?.id) === Number(user.id)) return { allowed: false, reason: 'Pemilik lelang tidak dapat menawar lelangnya sendiri.' };
  if (!Number.isSafeInteger(auction.nextMinimumBid) || auction.nextMinimumBid < 1) return { allowed: false, reason: 'Batas penawaran lelang sudah tercapai.' };
  return { allowed: true, reason: null };
}
