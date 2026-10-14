import { createContext, useContext, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from './AuthContext';
import {
  initSocket,
  joinAuctionRoom,
  leaveAuctionRoom,
  disconnectSocket,
} from '../lib/socket';
import {
  selectConnectionStatus,
  socketDisconnected,
  socketUnavailable,
} from '../features/socket/socketSlice';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const dispatch = useDispatch();
  const { token, isAuthenticated } = useAuth();
  const connectionStatus = useSelector(selectConnectionStatus);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      disconnectSocket();
      dispatch(socketDisconnected());
      return;
    }

    if (!import.meta.env?.VITE_SOCKET_URL) {
      disconnectSocket();
      dispatch(socketUnavailable());
      return;
    }

    initSocket(token);
  }, [dispatch, token, isAuthenticated]);

  const value = useMemo(() => ({
    connectionStatus,
    joinAuctionRoom,
    leaveAuctionRoom,
  }), [connectionStatus]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket harus dipakai di dalam SocketProvider');
  return context;
}
