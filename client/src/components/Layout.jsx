import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { GavelIcon, LogoutIcon, MoonIcon, SunIcon } from './Icons';
import ConnectionBanner from './ConnectionBanner';

function Brand() {
  return <NavLink className="brand" to="/"><span className="brand-mark"><GavelIcon /></span><span>Smart<span className="brand-accent">Hammer</span></span></NavLink>;
}

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="topbar">
        <div className="container nav">
          <Brand />
          <nav className="nav-links" aria-label="Navigasi utama">
            <NavLink end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/">Jelajahi</NavLink>
            <NavLink className="nav-link" to="/my-auctions">Lelang saya</NavLink>
            <NavLink className="nav-link" to="/auctions/new">Jual barang</NavLink>
          </nav>
          <div className="nav-actions">
            <button
              className="btn btn-ghost theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              aria-pressed={theme === 'dark'}
              title={theme === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              <span className="theme-toggle-label">{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
            </button>
            {isAuthenticated ? (
              <>
                <span className="user-chip"><span>{user?.username?.slice(0, 2).toUpperCase()}</span>{user?.username}</span>
                <button className="btn btn-ghost nav-logout" type="button" onClick={handleLogout}><LogoutIcon /> Keluar</button>
              </>
            ) : (
              <NavLink className="btn btn-ghost nav-login" to="/login">Masuk</NavLink>
            )}
            <NavLink className="btn btn-primary" to="/auctions/new">+ Buat lelang</NavLink>
          </div>
        </div>
      </header>
      <ConnectionBanner /><main id="main-content"><Outlet /></main>
      <footer className="footer"><div className="container footer-row"><div><Brand /><p className="small footer-copy">Lelang demo dengan mock backend lokal.</p></div><div className="footer-meta"><span>React + Redux Toolkit</span><span>Development only · no real-money transactions</span></div></div></footer>
    </>
  );
}
