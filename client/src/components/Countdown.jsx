import { useCallback, useEffect, useRef, useState } from 'react';
import { createServerClock } from '../features/auctions/serverClock.js';
import { formatCountdown, getRemainingSeconds } from '../features/auctions/countdownUtils.js';

const MAX_EXPIRY_CHECKS = 3;
const EXPIRY_RETRY_MS = 1500;

export default function Countdown({
  endsAt,
  status = 'live',
  serverNow,
  serverTimeOffsetMs = 0,
  onExpired,
  onConfirmingChange,
}) {
  const deadline = typeof endsAt === 'number' ? endsAt : Date.parse(endsAt);
  const timestampValid = Number.isFinite(deadline);
  const callbackRef = useRef(onExpired);
  const confirmingCallbackRef = useRef(onConfirmingChange);
  const latestRef = useRef({ endsAt, status });
  const [seconds, setSeconds] = useState(null);
  const [confirming, setConfirming] = useState(false);
  callbackRef.current = onExpired;
  confirmingCallbackRef.current = onConfirmingChange;
  latestRef.current = { endsAt, status };

  const updateConfirming = useCallback((value) => {
    setConfirming(value);
    confirmingCallbackRef.current?.(value);
  }, []);

  useEffect(() => {
    if (status !== 'live' || !timestampValid) {
      setSeconds(null);
      updateConfirming(false);
      return undefined;
    }

    updateConfirming(false);
    const monotonic = () => globalThis.performance?.now?.() ?? Date.now();
    const monotonicAnchor = monotonic();
    const serverClock = createServerClock({ serverNow, serverTimeOffsetMs, monotonicNow: monotonicAnchor });
    let disposed = false;
    let expiryCheckStarted = false;
    let retryTimer;

    const calculate = () => getRemainingSeconds(deadline, serverClock.now(monotonic()));
    const tick = () => {
      const next = calculate();
      setSeconds(next);
      if (next !== 0 || expiryCheckStarted) return;
      expiryCheckStarted = true;
      updateConfirming(true);
      void (async () => {
        for (let attempt = 0; attempt < MAX_EXPIRY_CHECKS; attempt += 1) {
          if (disposed || latestRef.current.status !== 'live' || latestRef.current.endsAt !== endsAt) return;
          try { await callbackRef.current?.(); } catch { /* Keep the neutral confirmation state. */ }
          if (disposed || latestRef.current.status !== 'live' || latestRef.current.endsAt !== endsAt) return;
          if (attempt + 1 < MAX_EXPIRY_CHECKS) {
            await new Promise((resolve) => { retryTimer = window.setTimeout(resolve, EXPIRY_RETRY_MS); });
          }
        }
      })();
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [deadline, endsAt, serverNow, serverTimeOffsetMs, status, timestampValid, updateConfirming]);

  if (status !== 'live') return null;
  if (!timestampValid) return <span className="countdown-invalid" role="status">Waktu lelang belum tersedia</span>;
  if (seconds === 0 || confirming) return <span className="countdown-confirming" role="status">Waktu habis · Mengonfirmasi hasil lelang…</span>;
  return <span className="auction-countdown" role="timer" aria-label={seconds == null ? 'Menghitung waktu tersisa' : `${seconds} detik tersisa`}>{formatCountdown(seconds ?? 0)}</span>;
}
