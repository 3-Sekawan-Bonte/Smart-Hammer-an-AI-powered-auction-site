import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function GuestRoute({ children }) {
  const { authRestoring, isAuthenticated } = useAuth();
  const location = useLocation();

  if (authRestoring) return <div className="page container"><div className="loading-card">Memeriksa sesi…</div></div>;
  if (isAuthenticated) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }
  return children;
}
