import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../features/auth/authSlice';
import { selectConnectionStatus } from '../features/socket/socketSlice';

export default function ConnectionBanner() {
  const socketStatus = useSelector(selectConnectionStatus);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [apiReachable, setApiReachable] = useState(true);
  useEffect(() => {
    const online = () => setBrowserOnline(true);
    const offline = () => setBrowserOnline(false);
    const apiStatus = (event) => setApiReachable(event.detail !== 'unreachable');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('smart-hammer:api-status', apiStatus);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('smart-hammer:api-status', apiStatus);
    };
  }, []);
  const message = !browserOnline ? 'Koneksi internet terputus. Perubahan akan dimuat setelah tersambung kembali.'
    : !apiReachable ? 'Server sementara tidak merespons. Data akan dicoba kembali.'
      : isAuthenticated && ['disconnected', 'connecting', 'error'].includes(socketStatus) ? 'Koneksi realtime terputus. Mencoba menyambungkan kembali.' : null;
  return message ? <div className="connection-banner" role="status" aria-live="polite">{message}</div> : null;
}
