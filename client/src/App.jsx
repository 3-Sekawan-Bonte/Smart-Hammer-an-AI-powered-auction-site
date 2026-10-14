import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';

const AuctionDetailPage = lazy(() => import('./pages/AuctionDetailPage'));
const AuctionListPage = lazy(() => import('./pages/AuctionListPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const CreateAuctionPage = lazy(() => import('./pages/CreateAuctionPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const MyAuctionsPage = lazy(() => import('./pages/MyAuctionsPage'));

export default function App() {
  return (
    <Suspense fallback={<div className="page container"><div className="loading-card" role="status">Memuat halaman…</div></div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProtectedRoute><AuctionListPage /></ProtectedRoute>} />
        <Route path="login" element={<GuestRoute><AuthPage mode="login" /></GuestRoute>} />
        <Route path="register" element={<GuestRoute><AuthPage mode="register" /></GuestRoute>} />
        <Route path="auctions/new" element={<ProtectedRoute><CreateAuctionPage /></ProtectedRoute>} />
        <Route path="auctions/:id/edit" element={<ProtectedRoute><CreateAuctionPage mode="edit" /></ProtectedRoute>} />
        <Route path="auctions/:id" element={<ProtectedRoute><AuctionDetailPage /></ProtectedRoute>} />
        <Route path="my-auctions" element={<ProtectedRoute><MyAuctionsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
