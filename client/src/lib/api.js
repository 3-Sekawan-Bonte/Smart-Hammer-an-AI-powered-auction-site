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

export function getApiErrorDetails(error, fallback = 'Permintaan gagal. Coba lagi.') {
  const apiError = error?.response?.data?.error;
  const fields = apiError?.fields && typeof apiError.fields === 'object' && !Array.isArray(apiError.fields)
    ? apiError.fields
    : {};
  return {
    message: ({
      VALIDATION_ERROR: 'Periksa kembali data yang dimasukkan.',
      EMAIL_EXISTS: 'Email sudah terdaftar.',
      INVALID_CREDENTIALS: 'Email atau password salah.',
      UNAUTHORIZED: 'Sesi berakhir. Silakan login kembali.',
    })[apiError?.code] || (error?.response ? fallback : getApiError(error, fallback)),
    code: typeof apiError?.code === 'string' ? apiError.code : null,
    fields,
  };
}

export function isPublicAuthRequest(config = {}) {
  return /^\/?users\/(?:login|register)(?:\?|$)/i.test(config.url || '');
}

api.interceptors.request.use((config) => {
  if (isPublicAuthRequest(config)) {
    delete config.headers.Authorization;
    config.headers.delete?.('Authorization');
    config.__smartHammerAuthToken = null;
    return config;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  config.__smartHammerAuthToken = token || null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else {
    delete config.headers.Authorization;
    config.headers.delete?.('Authorization');
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestToken = error.config?.__smartHammerAuthToken;
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (error.response?.status === 401 && !isPublicAuthRequest(error.config) && requestToken && requestToken === currentToken) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
      window.dispatchEvent(new Event('smart-hammer:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
