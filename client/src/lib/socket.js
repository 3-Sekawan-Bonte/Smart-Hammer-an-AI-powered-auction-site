import { io } from 'socket.io-client';
import { loadAuctionSnapshot, processAuctionEvent } from '../features/auctions/auctionSlice.js';
import {
  roomJoined, roomJoining, roomLeft, roomReconnecting, roomSocketError,
  socketConnected, socketConnecting, socketDisconnected, socketError, socketUnavailable,
} from '../features/socket/socketSlice.js';

const ACK_TIMEOUT_MS = 5000;
const JOIN_RETRIES = 2;
const auctionEvents = ['auction:snapshot', 'auction:started', 'bid:updated', 'auction:ended', 'ai:pending', 'ai:message', 'ai:error', 'auction:presence'];
let socket = null;
let storeDispatch = null;
let activeToken = null;
let activeSocketUrl = null;
let desiredRoom = null;
let joinedRoom = null;
let roomGeneration = 0;
let roomQueue = Promise.resolve();
let fallbackTimer = null;
let snapshotSeenForJoin = false;
let unauthorized = false;
let handlers = null;

export function setSocketDispatch(dispatch) { storeDispatch = dispatch; }

export function initSocket(token, socketUrl = import.meta.env?.VITE_SOCKET_URL) {
  socketUrl = socketUrl?.trim() || import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:3001';
  if (!socketUrl || !token) {
    disconnectSocket();
    storeDispatch?.(socketUnavailable());
    return null;
  }
  if (socket && activeToken === token && socketUrl === activeSocketUrl) return socket;
  if (socket) disconnectSocket();
  activeToken = token;
  activeSocketUrl = socketUrl;
  unauthorized = false;
  storeDispatch?.(socketConnecting());
  socket = io(socketUrl, {
    path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'],
    reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500,
    reconnectionDelayMax: 5000, timeout: ACK_TIMEOUT_MS,
  });
  bindSocketHandlers(socket);
  return socket;
}

function bindSocketHandlers(target) {
  handlers = {
    connect: () => {
      if (socket !== target) return;
      storeDispatch?.(socketConnected());
      if (desiredRoom) enqueueRoomSync(desiredRoom);
    },
    disconnect: () => {
      if (socket !== target) return;
      joinedRoom = null;
      clearFallbackTimer();
      storeDispatch?.(socketDisconnected());
      if (desiredRoom) storeDispatch?.(roomReconnecting({ auctionId: desiredRoom }));
    },
    connectError: (error) => {
      if (socket !== target) return;
      const code = error?.data?.code;
      storeDispatch?.(socketError(code === 'UNAUTHORIZED' ? 'Sesi tidak sah. Silakan login kembali.' : 'Koneksi realtime terganggu.'));
      if (code === 'UNAUTHORIZED') {
        unauthorized = true;
        target.io.reconnection(false);
        target.disconnect();
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('smart-hammer:unauthorized'));
      }
    },
    reconnectAttempt: () => storeDispatch?.(socketConnecting()),
  };
  target.on('connect', handlers.connect);
  target.on('disconnect', handlers.disconnect);
  target.on('connect_error', handlers.connectError);
  target.io.on('reconnect_attempt', handlers.reconnectAttempt);
  handlers.events = new Map();
  for (const eventName of auctionEvents) {
    const handler = (payload) => {
      if (socket !== target || !desiredRoom || String(payload?.auctionId ?? payload?.auction?.id ?? payload?.interaction?.auctionId ?? '') !== desiredRoom) return;
      if (eventName === 'auction:snapshot') { snapshotSeenForJoin = true; clearFallbackTimer(); }
      if (eventName === 'auction:presence') storeDispatch?.({ type: 'auction/presenceReceived', payload: payload.participants ?? payload });
      else storeDispatch?.(processAuctionEvent(eventName, payload));
    };
    handlers.events.set(eventName, handler);
    target.on(eventName, handler);
  }
}

export function joinAuctionRoom(auctionId) {
  if (!/^[1-9]\d*$/.test(String(auctionId ?? ''))) {
    storeDispatch?.(roomSocketError({ auctionId: String(auctionId ?? ''), error: 'ID lelang tidak valid.' }));
    return Promise.resolve({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'ID lelang tidak valid.' } });
  }
  const id = String(auctionId);
  if (desiredRoom === id && joinedRoom === id && socket?.connected) return Promise.resolve({ ok: true, data: { auctionId: Number(id) } });
  desiredRoom = id;
  roomGeneration += 1;
  clearFallbackTimer();
  storeDispatch?.(roomJoining({ auctionId: id }));
  return enqueueRoomSync(id);
}

export function leaveAuctionRoom(auctionId = desiredRoom) {
  const id = auctionId == null ? null : String(auctionId);
  if (id && desiredRoom !== id && joinedRoom !== id) return Promise.resolve({ ok: true, data: { auctionId: Number(id) } });
  if (!id || desiredRoom === id) desiredRoom = null;
  roomGeneration += 1;
  clearFallbackTimer();
  return enqueueRoomSync(null, id);
}

function enqueueRoomSync(targetRoom, explicitLeaveId = null) {
  const generation = roomGeneration;
  roomQueue = roomQueue.catch(() => {}).then(async () => {
    if (generation !== roomGeneration) return { ok: false, obsolete: true };
    const current = joinedRoom;
    if (current && current !== targetRoom) {
      await emitAcknowledged('auction:leave', { auctionId: Number(current) }, false);
      if (joinedRoom === current) joinedRoom = null;
    } else if (explicitLeaveId && !current && socket?.connected) {
      await emitAcknowledged('auction:leave', { auctionId: Number(explicitLeaveId) }, false);
    }
    if (generation !== roomGeneration) return { ok: false, obsolete: true };
    if (!targetRoom) {
      storeDispatch?.(roomLeft({ auctionId: explicitLeaveId || current }));
      return { ok: true };
    }
    if (!socket?.connected || unauthorized) return { ok: false, pending: true };
    snapshotSeenForJoin = false;
    let result;
    for (let attempt = 0; attempt <= JOIN_RETRIES; attempt += 1) {
      result = await emitAcknowledged('auction:join', { auctionId: Number(targetRoom) }, true);
      if (generation !== roomGeneration) {
        if (result?.ok) await emitAcknowledged('auction:leave', { auctionId: Number(targetRoom) }, false);
        return { ok: false, obsolete: true };
      }
      if (result?.ok || result?.error?.code !== 'ACK_TIMEOUT') break;
      if (attempt < JOIN_RETRIES) await delay(200 * (2 ** attempt));
    }
    if (!result?.ok) {
      storeDispatch?.(roomSocketError({ auctionId: targetRoom, error: result?.error?.message || 'Gagal bergabung ke room lelang.' }));
      if (result?.error?.code === 'UNAUTHORIZED' && typeof window !== 'undefined') window.dispatchEvent(new Event('smart-hammer:unauthorized'));
      return result;
    }
    joinedRoom = targetRoom;
    storeDispatch?.(roomJoined({ auctionId: targetRoom }));
    if (!snapshotSeenForJoin) {
      fallbackTimer = setTimeout(() => {
        if (socket?.connected && desiredRoom === targetRoom && joinedRoom === targetRoom && !snapshotSeenForJoin) storeDispatch?.(loadAuctionSnapshot(targetRoom));
      }, ACK_TIMEOUT_MS + 250);
      fallbackTimer.unref?.();
    }
    return result;
  });
  return roomQueue;
}

function emitAcknowledged(event, payload, expectAck) {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: { code: 'DISCONNECTED', message: 'Socket belum tersambung.' } });
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const acknowledge = (timeoutError, response) => {
      if (timeoutError) return finish({ ok: false, error: { code: 'ACK_TIMEOUT', message: 'Server tidak merespons.' } });
      if (!expectAck) return finish({ ok: true });
      finish(response || { ok: false, error: { code: 'INVALID_ACK', message: 'Respons server tidak valid.' } });
    };
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, acknowledge);
    if (!expectAck) setTimeout(() => finish({ ok: true }), 100);
  });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function clearFallbackTimer() { if (fallbackTimer) clearTimeout(fallbackTimer); fallbackTimer = null; }

export function disconnectSocket() {
  if (socket) {
    if (handlers) {
      socket.off('connect', handlers.connect);
      socket.off('disconnect', handlers.disconnect);
      socket.off('connect_error', handlers.connectError);
      socket.io.off('reconnect_attempt', handlers.reconnectAttempt);
      for (const [eventName, handler] of handlers.events || []) socket.off(eventName, handler);
    }
    socket.io.reconnection(false);
    socket.disconnect();
  }
  clearFallbackTimer();
  socket = null;
  handlers = null;
  activeToken = null;
  activeSocketUrl = null;
  desiredRoom = null;
  joinedRoom = null;
  roomGeneration += 1;
  roomQueue = Promise.resolve();
  unauthorized = false;
}


export function getSocket() { return socket; }
export function getSocketRooms() { return { desiredRoom, joinedRoom }; }
export function getSocketListenerCounts() {
  return Object.fromEntries(auctionEvents.map((eventName) => [eventName, socket?.listeners(eventName).length || 0]));
}
