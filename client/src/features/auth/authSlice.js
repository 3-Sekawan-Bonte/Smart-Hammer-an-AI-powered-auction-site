import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api, { getApiData, getApiErrorDetails, TOKEN_KEY, USER_ID_KEY } from '../../lib/api.js';

function isUser(value) {
  return value && (typeof value.id === 'number' || typeof value.id === 'string') &&
    typeof value.username === 'string' && typeof value.email === 'string';
}

export function canRestoreSession(status) {
  return !['restoring', 'loading', 'succeeded'].includes(status);
}

export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
      const response = await api.get('/users/me');
      const user = getApiData(response)?.user;
      if (!isUser(user)) {
        if (localStorage.getItem(TOKEN_KEY) === token) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_ID_KEY);
        }
        return rejectWithValue('Sesi tidak valid. Silakan login kembali.');
      }
      if (localStorage.getItem(TOKEN_KEY) !== token) {
        return rejectWithValue('Sesi berubah. Silakan lanjutkan dengan akun yang aktif.');
      }
      return { token, user };
    } catch (error) {
      const invalidToken = error?.response?.status === 401;
      if (invalidToken && localStorage.getItem(TOKEN_KEY) === token) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_ID_KEY);
      }
      return rejectWithValue({ ...getApiErrorDetails(error, invalidToken ? 'Sesi berakhir. Silakan login kembali.' : 'Server sementara tidak tersedia.'), invalidToken });
    }
  },
  {
    condition: (_, { getState }) => canRestoreSession(getState().auth.status),
  },
);

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/login', { email: email.trim().toLowerCase(), password });
      const result = getApiData(response);
      if (typeof result?.access_token !== 'string' || !result.access_token || result.tokenType !== 'Bearer' ||
          !Number.isFinite(result.expiresIn) || result.expiresIn <= 0 || !isUser(result.user)) {
        return rejectWithValue('Respons login tidak valid. Silakan coba lagi.');
      }
      localStorage.setItem(TOKEN_KEY, result.access_token);
      localStorage.setItem(USER_ID_KEY, String(result.user.id));
      return { token: result.access_token, user: result.user };
    } catch (error) {
      return rejectWithValue(getApiErrorDetails(error, 'Login gagal. Periksa email dan password.'));
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async ({ username, email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/register', {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      const user = getApiData(response)?.user;
      if (!isUser(user)) return rejectWithValue('Respons registrasi tidak valid. Silakan coba lagi.');
      // Registration deliberately returns the new user without creating a session.
      return user;
    } catch (error) {
      return rejectWithValue(getApiErrorDetails(error, 'Registrasi gagal. Periksa data dan coba lagi.'));
    }
  },
);

const initialState = {
  user: null,
  accessToken: null,
  status: 'checking',
  error: null,
  restoreRequestId: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
      state.user = null;
      state.accessToken = null;
      state.status = 'anonymous';
      state.error = null;
      state.restoreRequestId = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state, action) => {
        state.status = 'restoring';
        state.error = null;
        state.restoreRequestId = action.meta.requestId;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (state.restoreRequestId !== action.meta.requestId) return;
        state.status = action.payload ? 'succeeded' : 'anonymous';
        state.accessToken = action.payload?.token ?? null;
        state.user = action.payload?.user ?? null;
        state.error = null;
        state.restoreRequestId = null;
      })
      .addCase(restoreSession.rejected, (state, action) => {
        if (state.restoreRequestId !== action.meta.requestId) return;
        const invalidToken = action.payload?.invalidToken;
        state.status = invalidToken || !state.accessToken ? 'anonymous' : 'succeeded';
        if (invalidToken || !state.accessToken) {
          state.accessToken = null;
          state.user = null;
        }
        state.error = action.payload ?? null;
        state.restoreRequestId = null;
      })
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.restoreRequestId = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.accessToken = action.payload.token;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = state.accessToken && state.user ? 'succeeded' : 'anonymous';
        state.error = action.payload ?? 'Login gagal.';
      })
      .addCase(register.pending, (state) => {
        state.status = 'registering';
        state.error = null;
      })
      .addCase(register.fulfilled, (state) => {
        state.status = state.accessToken && state.user ? 'succeeded' : 'anonymous';
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = state.accessToken && state.user ? 'succeeded' : 'anonymous';
        state.error = action.payload ?? 'Registrasi gagal.';
      });
  },
});

export const { logout, clearError } = authSlice.actions;

export const selectUser = (state) => state.auth.user;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectAuthStatus = (state) => state.auth.status;
export const selectAuthError = (state) => state.auth.error;
export const selectAuthLoading = (state) => ['checking', 'restoring', 'loading', 'registering'].includes(state.auth.status);
export const selectAuthRestoring = (state) => ['checking', 'restoring'].includes(state.auth.status);
export const selectIsAuthenticated = (state) => Boolean(state.auth.accessToken && state.auth.user);

export default authSlice.reducer;
