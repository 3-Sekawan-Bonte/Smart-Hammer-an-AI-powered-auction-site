import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GavelIcon, LogoutIcon } from './Icons';

function Brand() {
  return <NavLink className="brand" to="/"><span className="brand-mark"><GavelIcon /></span><span>Smart<span className="brand-accent">Hammer</span></span></NavLink>;
}

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <div className="container nav">
          <Brand />
          <nav className="nav-links" aria-label="Navigasi utama">
            <NavLink end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/">Jelajahi</NavLink>
            <NavLink className="nav-link" to="/auctions/12">Live sekarang</NavLink>
            <NavLink className="nav-link" to="/auctions/new">Jual barang</NavLink>
          </nav>
          <div className="nav-actions">
            {isAuthenticated ? (
              <>
                <span className="user-chip"><span>{user?.username?.slice(0, 2).toUpperCase()}</span>{user?.username}</span>
                <button className="btn btn-ghost nav-logout" type="button" onClick={logout}><LogoutIcon /> Keluar</button>
              </>
            ) : (
              <NavLink className="btn btn-ghost nav-login" to="/login">Masuk</NavLink>
            )}
            <NavLink className="btn btn-primary" to="/auctions/new">+ Buat lelang</NavLink>
          </div>
        </div>
      </header>
      <main id="main-content"><Outlet /></main>
      <footer className="footer"><div className="container footer-row"><div><Brand /><p className="small footer-copy">Mock lokal untuk fondasi frontend Smart Hammer.</p></div><div className="footer-meta"><span>React + Redux Toolkit</span><span>Development only · no real bidding/AI</span></div></div></footer>
    </>
  );
}
