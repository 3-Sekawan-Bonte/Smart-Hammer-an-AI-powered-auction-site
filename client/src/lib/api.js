import axios from 'axios';

export const TOKEN_KEY = 'smart_hammer_access_token';
export const USER_ID_KEY = 'smart_hammer_user_id';

const api = axios.create({
  baseURL: (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  timeout: 10000,
});

export function getApiData(response) {
  const body = response?.data;
  return body && Object.hasOwn(body, 'data') ? body.data : body;
}

export function getApiError(error, fallback = 'Permintaan gagal. Coba lagi.') {
  if (!error?.response) {
    return error?.code === 'ECONNABORTED'
      ? 'Server tidak merespons sebelum batas waktu.'
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

export function classifyApiError(error) {
  const status = error?.response?.status ?? null;
  const code = error?.response?.data?.error?.code || error?.code || null;
  return { status, code, retryable: !error?.config?.signal?.aborted && !['ERR_CANCELED', 'CanceledError'].includes(error?.code) && (!error?.response || status >= 500), unauthorized: status === 401, retryAfter: Number(error?.response?.headers?.['retry-after'] || error?.response?.data?.error?.details?.retryAfterSeconds || 0) };
}

function emitApiStatus(status) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('smart-hammer:api-status', { detail: status }));
}

api.interceptors.response.use(
  (response) => { emitApiStatus('reachable'); return response; },
  async (error) => {
    const config = error.config || {};
    const classification = classifyApiError(error);
    if (String(config.method || 'get').toLowerCase() === 'get' && classification.retryable && (config.__getRetryCount || 0) < 2) {
      config.__getRetryCount = (config.__getRetryCount || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** (config.__getRetryCount - 1))));
      return api.request(config);
    }
    if (!error.response) emitApiStatus('unreachable');
    const requestToken = error.config?.__smartHammerAuthToken;
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (classification.unauthorized && !isPublicAuthRequest(error.config) && requestToken && requestToken === currentToken) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
      window.dispatchEvent(new Event('smart-hammer:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
