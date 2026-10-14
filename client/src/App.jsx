import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import AuctionDetailPage from './pages/AuctionDetailPage';
import AuctionListPage from './pages/AuctionListPage';
import AuthPage from './pages/AuthPage';
import CreateAuctionPage from './pages/CreateAuctionPage';
import NotFoundPage from './pages/NotFoundPage';
import MyAuctionsPage from './pages/MyAuctionsPage';

export default function App() {
  return (
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
  );
}
