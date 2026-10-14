import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return <div className="page container empty-state"><p className="eyebrow">404</p><h1 className="display">Halaman tidak ditemukan.</h1><Link className="btn btn-primary" to="/">Kembali ke daftar lelang</Link></div>;
}
