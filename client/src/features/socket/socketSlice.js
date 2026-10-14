import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  connectionStatus: 'disconnected',
  error: null,
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
    },
    socketUnavailable(state) {
      state.connectionStatus = 'unavailable';
      state.error = null;
    },
    socketError(state, action) {
      state.connectionStatus = 'error';
      state.error = action.payload;
    },
  },
});

export const {
  socketConnecting,
  socketConnected,
  socketDisconnected,
  socketUnavailable,
  socketError,
} = socketSlice.actions;

export const selectConnectionStatus = (state) => state.socket.connectionStatus;
export const selectSocketError = (state) => state.socket.error;

export default socketSlice.reducer;
