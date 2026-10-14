import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowIcon, EyeIcon, EyeOffIcon } from '../components/Icons';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { login, register, authLoading, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [formError, setFormError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    clearAuthError();
    setFormError(null);
    
    if (isRegister && form.password !== form.confirmPassword) {
      setFormError('Konfirmasi password tidak cocok.');
      return;
    }
    if (isRegister && (form.username.trim().length < 2 || form.username.trim().length > 40)) {
      setFormError('Username harus terdiri dari 2–40 karakter.');
      return;
    }
    if (isRegister && (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72)) {
      setFormError('Password harus terdiri dari 8–72 byte.');
      return;
    }
    
    try {
      if (isRegister) {
        await register(form);
        // Per PRD: Registration does not auto-login, redirect to login
        navigate('/login', { state: { registered: true } });
      } else {
        await login(form);
        navigate(location.state?.from || '/', { replace: true });
      }
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-art">
        <div className="auth-art-content">
          <p className="eyebrow amber-text">Smart Hammer membership</p>
          <h1 className="display">Masuk ke<br />arena lelang.</h1>
          <p>Masuk untuk menjelajahi data lelang demo dan menyimpan draft lokal. FE-01 belum mengaktifkan bidding, AI, atau realtime.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Selamat datang</p>
          <h2 className="display">{isRegister ? 'Buat akun baru' : 'Masuk ke Smart Hammer'}</h2>
          <div className="tabs">
            <Link className={`tab tab-link ${!isRegister ? 'active' : ''}`} to="/login">Masuk</Link>
            <Link className={`tab tab-link ${isRegister ? 'active' : ''}`} to="/register">Daftar</Link>
          </div>
          {!isRegister && location.state?.registered && (
            <p className="success-banner" role="status">Akun berhasil dibuat. Silakan masuk untuk melanjutkan.</p>
          )}
          <form className="form-stack" onSubmit={submit}>
            {isRegister && (
              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  className="input"
                  id="username"
                  minLength={2}
                  maxLength={40}
                  required
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  autoComplete="username"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                className="input"
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  className="input"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  minLength="8"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            {isRegister && (
              <div className="field">
                <label htmlFor="confirmPassword">Konfirmasi Password</label>
                <div className="password-input-wrapper">
                  <input
                    className="input"
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    minLength="8"
                    required
                    value={form.confirmPassword}
                    onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            )}
            {(formError || authError) && <p className="form-error" role="alert">{formError || authError}</p>}
            <button className="btn btn-primary" disabled={authLoading} type="submit">
              {authLoading ? 'Memproses...' : isRegister ? 'Buat akun' : 'Masuk'}
              {!authLoading && <ArrowIcon />}
            </button>
            <p className="helper">Mock lokal hanya untuk pengembangan dan bukan autentikasi aman untuk produksi.</p>
          </form>
        </div>
      </section>
    </div>
  );
}
