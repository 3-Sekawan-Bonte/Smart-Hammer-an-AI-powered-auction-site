import axios from 'axios';

export const TOKEN_KEY = 'smart_hammer_access_token';
export const USER_ID_KEY = 'smart_hammer_user_id';

const api = axios.create({
  baseURL: (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, ''),
  timeout: 10000,
});

export function getApiData(response) {
  const body = response?.data;
  return body && Object.hasOwn(body, 'data') ? body.data : body;
}

export function getApiError(error, fallback = 'Permintaan gagal. Coba lagi.') {
  if (!error?.response) {
    return error?.code === 'ECONNABORTED'
      ? 'Server mock tidak merespons. Pastikan npm run mock sedang berjalan.'
      : 'Tidak dapat terhubung ke server. Periksa koneksi dan coba lagi.';
  }
  return error.response.data?.message || error.response.data?.error?.message || fallback;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.dispatchEvent(new Event('smart-hammer:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
