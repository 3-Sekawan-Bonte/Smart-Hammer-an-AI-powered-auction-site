import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  connectionStatus: 'disconnected',
  error: null,
  roomStatus: 'idle',
  roomAuctionId: null,
  roomError: null,
};

const socketSlice = createSlice({
  name: 'socket',
  initialState,
  reducers: {
    socketConnecting(state) {
      state.connectionStatus = 'connecting';
      state.error = null;
    },
    socketConnected(state) {
      state.connectionStatus = 'connected';
      state.error = null;
    },
    socketDisconnected(state) {
      state.connectionStatus = 'disconnected';
      state.error = null;
      if (state.roomAuctionId) state.roomStatus = 'reconnecting';
    },
    socketUnavailable(state) {
      state.connectionStatus = 'unavailable';
      state.error = null;
    },
    socketError(state, action) {
      state.connectionStatus = 'error';
      state.error = typeof action.payload === 'string' ? action.payload : action.payload?.message || 'Koneksi realtime gagal.';
    },
    socketReset() {
      return { ...initialState };
    },
    roomJoining(state, action) {
      state.roomAuctionId = String(action.payload.auctionId);
      state.roomStatus = 'joining';
      state.roomError = null;
    },
    roomJoined(state, action) {
      if (state.roomAuctionId !== String(action.payload.auctionId)) return;
      state.roomStatus = 'joined';
      state.roomError = null;
    },
    roomLeft(state, action) {
      if (action.payload?.auctionId != null && state.roomAuctionId !== String(action.payload.auctionId)) return;
      state.roomStatus = 'idle';
      state.roomAuctionId = null;
      state.roomError = null;
    },
    roomReconnecting(state, action) {
      state.roomAuctionId = String(action.payload.auctionId);
      state.roomStatus = 'reconnecting';
      state.roomError = null;
    },
    roomSocketError(state, action) {
      if (action.payload?.auctionId != null && state.roomAuctionId !== String(action.payload.auctionId)) return;
      state.roomAuctionId = action.payload?.auctionId == null ? state.roomAuctionId : String(action.payload.auctionId);
      state.roomStatus = 'error';
      state.roomError = action.payload?.error || 'Gagal bergabung ke room lelang.';
    },
  },
  extraReducers: (builder) => builder.addCase('auth/logout', () => ({ ...initialState })),
});

export const {
  socketConnecting,
  socketConnected,
  socketDisconnected,
  socketUnavailable,
  socketError,
  socketReset,
  roomJoining,
  roomJoined,
  roomLeft,
  roomReconnecting,
  roomSocketError,
} = socketSlice.actions;

export const selectConnectionStatus = (state) => state.socket.connectionStatus;
export const selectSocketError = (state) => state.socket.error;
export const selectRoomStatus = (state) => state.socket.roomStatus;
export const selectRoomAuctionId = (state) => state.socket.roomAuctionId;
export const selectRoomError = (state) => state.socket.roomError;

export default socketSlice.reducer;
