import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  clearError,
  login as loginThunk,
  logout as logoutAction,
  register as registerThunk,
  restoreSession,
  selectAccessToken,
  selectAuthError,
  selectAuthLoading,
  selectAuthRestoring,
  selectIsAuthenticated,
  selectUser,
} from '../features/auth/authSlice';

const AuthContext = createContext(null);

// Compatibility adapter for existing components; Redux remains the sole auth state source.
export function AuthProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const token = useSelector(selectAccessToken);
  const authLoading = useSelector(selectAuthLoading);
  const authRestoring = useSelector(selectAuthRestoring);
  const authError = useSelector(selectAuthError);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    const syncLogout = (event) => {
      if (event.key === 'smart_hammer_access_token' && !event.newValue) {
        dispatch(logoutAction());
      }
    };
    window.addEventListener('storage', syncLogout);
    const syncUnauthorized = () => dispatch(logoutAction());
    window.addEventListener('smart-hammer:unauthorized', syncUnauthorized);
    return () => {
      window.removeEventListener('storage', syncLogout);
      window.removeEventListener('smart-hammer:unauthorized', syncUnauthorized);
    };
  }, [dispatch]);

  const login = useCallback((credentials) => dispatch(loginThunk(credentials)).unwrap(), [dispatch]);
  const register = useCallback((details) => dispatch(registerThunk(details)).unwrap(), [dispatch]);
  const logout = useCallback(() => dispatch(logoutAction()), [dispatch]);
  const clearAuthError = useCallback(() => dispatch(clearError()), [dispatch]);
  const value = useMemo(() => ({
    user,
    token,
    authLoading,
    authRestoring,
    authError,
    isAuthenticated,
    login,
    register,
    logout,
    clearAuthError,
  }), [user, token, authLoading, authRestoring, authError, isAuthenticated, login, register, logout, clearAuthError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}
