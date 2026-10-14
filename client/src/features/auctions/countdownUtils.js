export function getRemainingSeconds(endsAt, correctedServerNow) {
  const deadline = typeof endsAt === 'number' ? endsAt : Date.parse(endsAt);
  if (!Number.isFinite(deadline) || !Number.isFinite(correctedServerNow)) return null;
  return Math.max(0, Math.ceil((deadline - correctedServerNow) / 1000));
}

export function formatCountdown(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) return '--:--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  if (days > 0) return `${days} hari ${String(hours).padStart(2, '0')}j ${minutes}m`;
  return `${String(hours).padStart(2, '0')}:${minutes}:${remainder}`;
}
