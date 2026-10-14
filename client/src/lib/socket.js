import { io } from 'socket.io-client';

let socket = null;
let storeDispatch = null;
let activeToken = null;

export function setSocketDispatch(dispatch) {
  storeDispatch = dispatch;
}

export function initSocket(token) {
  const socketUrl = import.meta.env?.VITE_SOCKET_URL;
  if (!socketUrl || !token) return null;
  if (socket && activeToken === token) return socket;
  if (socket) disconnectSocket();

  activeToken = token;
  storeDispatch?.({ type: 'socket/socketConnecting' });
  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    if (storeDispatch) {
      storeDispatch({ type: 'socket/socketConnected' });
    }
  });

  socket.on('disconnect', (reason) => {
    if (storeDispatch) {
      storeDispatch({ type: 'socket/socketDisconnected' });
    }
  });

  socket.on('connect_error', (err) => {
    if (storeDispatch) {
      storeDispatch({ type: 'socket/socketError', payload: err.message });
    }
  });

  socket.on('auction:snapshot', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/auctionSnapshotReceived', payload });
    }
  });

  socket.on('auction:started', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/auctionStarted', payload });
    }
  });

  socket.on('bid:updated', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/bidReceived', payload });
    }
  });

  socket.on('auction:ended', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/auctionEnded', payload });
    }
  });

  socket.on('ai:pending', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/aiPending', payload });
    }
  });

  socket.on('ai:message', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/aiReceived', payload });
    }
  });

  socket.on('ai:error', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/aiFailed', payload });
    }
  });

  socket.on('auction:presence', (payload) => {
    if (storeDispatch) {
      storeDispatch({ type: 'auction/presenceReceived', payload });
    }
  });

  return socket;
}

export function joinAuctionRoom(auctionId) {
  if (socket?.connected) {
    socket.emit('auction:join', { auctionId });
  }
}

export function leaveAuctionRoom(auctionId) {
  if (socket?.connected) {
    socket.emit('auction:leave', { auctionId });
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  activeToken = null;
}

export function getSocket() {
  return socket;
}
