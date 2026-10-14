export function createServerClock({
  serverNow,
  serverTimeOffsetMs,
  localNow = Date.now(),
  monotonicNow = globalThis.performance?.now?.() ?? localNow,
} = {}) {
  const parsedServerNow = Date.parse(serverNow);
  const offset = Number.isFinite(serverTimeOffsetMs)
    ? serverTimeOffsetMs
    : Number.isFinite(parsedServerNow) ? parsedServerNow - localNow : 0;
  const anchor = localNow + offset;
  return {
    now(at = globalThis.performance?.now?.() ?? Date.now()) {
      return anchor + Math.max(0, at - monotonicNow);
    },
  };
}

export function estimateServerOffset(serverNow, localSentAt, localReceivedAt = localSentAt) {
  const server = Date.parse(serverNow);
  if (!Number.isFinite(server)) return null;
  const sent = Number(localSentAt);
  const received = Number(localReceivedAt);
  if (!Number.isFinite(sent) || !Number.isFinite(received) || received < sent) return null;
  return server - ((sent + received) / 2);
}
