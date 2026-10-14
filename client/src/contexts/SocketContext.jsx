import { createContext, useContext, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { disconnectSocket, initSocket, joinAuctionRoom, leaveAuctionRoom } from '../lib/socket';
import { roomLeft, selectConnectionStatus, selectRoomAuctionId, selectRoomError, selectRoomStatus, socketDisconnected } from '../features/socket/socketSlice';
import { clearActiveAuction } from '../features/auctions/auctionSlice';

const SocketContext = createContext(null);
function roomIdFromPath(pathname) {
  const match = /^\/auctions\/([1-9]\d*)\/?$/.exec(pathname);
  return match?.[1] || null;
}

export function SocketProvider({ children }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const { token, isAuthenticated, authRestoring } = useAuth();
  const connectionStatus = useSelector(selectConnectionStatus);
  const roomStatus = useSelector(selectRoomStatus);
  const roomAuctionId = useSelector(selectRoomAuctionId);
  const roomError = useSelector(selectRoomError);

  useEffect(() => {
    if (authRestoring) return undefined;
    if (!isAuthenticated || !token) {
      disconnectSocket();
      dispatch(socketDisconnected());
      return undefined;
    }
    initSocket(token);
    return undefined;
  }, [dispatch, token, isAuthenticated, authRestoring]);

  const routeAuctionId = roomIdFromPath(location.pathname);
  useEffect(() => {
    if (!isAuthenticated || !token || authRestoring) return undefined;
    if (routeAuctionId) {
      joinAuctionRoom(routeAuctionId);
      return () => {
        leaveAuctionRoom(routeAuctionId);
        dispatch(roomLeft({ auctionId: routeAuctionId }));
        dispatch(clearActiveAuction());
      };
    }
    if (roomAuctionId) {
      leaveAuctionRoom(roomAuctionId);
      dispatch(roomLeft({ auctionId: roomAuctionId }));
      dispatch(clearActiveAuction());
    }
    return undefined;
  }, [dispatch, routeAuctionId, token, isAuthenticated, authRestoring]);

  const value = useMemo(() => ({ connectionStatus, roomStatus, roomAuctionId, roomError, joinAuctionRoom, leaveAuctionRoom }), [connectionStatus, roomStatus, roomAuctionId, roomError]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket harus dipakai di dalam SocketProvider');
  return context;
}
