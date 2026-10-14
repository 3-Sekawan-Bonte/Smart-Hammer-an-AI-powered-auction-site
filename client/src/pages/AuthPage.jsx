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
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    clearAuthError();
    setFormError(null);
    setFieldErrors({});
    const errors = {};
    const normalizedEmail = form.email.trim();
    if (normalizedEmail.length > 254 || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      errors.email = 'Masukkan alamat email yang valid (maksimal 254 karakter).';
    }
    if (isRegister && (form.username.trim().length < 2 || form.username.trim().length > 40)) {
      errors.username = 'Username harus terdiri dari 2–40 karakter.';
    }
    const passwordBytes = new TextEncoder().encode(form.password).length;
    if (passwordBytes < 8 || passwordBytes > 72) {
      errors.password = 'Password harus terdiri dari 8–72 byte.';
    }
    if (isRegister && form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Konfirmasi password tidak cocok.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
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
      if (err && typeof err === 'object') {
        const serverFields = err.fields || {};
        setFieldErrors(serverFields);
        setFormError(Object.keys(serverFields).length ? null : err.message || 'Permintaan gagal. Coba lagi.');
      } else {
        setFormError(typeof err === 'string' ? err : 'Permintaan gagal. Coba lagi.');
      }
    }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-art">
        <div className="auth-art-content">
          <p className="eyebrow amber-text">Smart Hammer membership</p>
          <h1 className="display">Masuk ke<br />arena lelang.</h1>
      <p>Masuk untuk menjelajahi lelang demo dan mengikuti sinkronisasi room lokal. Event bid dan AI hanya simulasi development.</p>
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
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                />
                {fieldErrors.username && <small className="field-error" id="username-error">{fieldErrors.username}</small>}
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
                maxLength={254}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email && <small className="field-error" id="email-error">{fieldErrors.email}</small>}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  className="input"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  maxLength={72}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
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
              {fieldErrors.password && <small className="field-error" id="password-error">{fieldErrors.password}</small>}
            </div>
            {isRegister && (
              <div className="field">
                <label htmlFor="confirmPassword">Konfirmasi Password</label>
                <div className="password-input-wrapper">
                  <input
                    className="input"
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={form.confirmPassword}
                    onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                    autoComplete="new-password"
                    maxLength={72}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
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
                {fieldErrors.confirmPassword && <small className="field-error" id="confirm-password-error">{fieldErrors.confirmPassword}</small>}
              </div>
            )}
            {(formError || (authError && !Object.keys(authError.fields || {}).length)) && (
              <p className="form-error" role="alert">{formError || (typeof authError === 'string' ? authError : authError?.message)}</p>
            )}
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
