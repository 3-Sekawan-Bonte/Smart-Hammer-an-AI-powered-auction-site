import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    if (import.meta.env?.DEV) console.error('Smart Hammer render error:', error);
  }
  render() {
    if (this.state.failed) return <main className="page container"><section className="error-card page-state" role="alert"><p className="eyebrow">Terjadi kendala</p><h1 className="display">Halaman ini gagal ditampilkan.</h1><p>Data Anda tetap aman. Muat ulang tampilan untuk mencoba lagi.</p><button className="btn btn-primary" type="button" onClick={() => this.setState({ failed: false })}>Coba lagi</button></section></main>;
    return this.props.children;
  }
}
