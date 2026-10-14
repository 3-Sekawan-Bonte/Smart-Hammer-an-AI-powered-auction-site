import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import auctionReducer from '../features/auctions/auctionSlice';
import socketReducer from '../features/socket/socketSlice';
import { setSocketDispatch } from '../lib/socket';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    auction: auctionReducer,
    socket: socketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: [],
      },
    }),
});

// Set the socket dispatch after store is created
setSocketDispatch(store.dispatch);

export default store;