import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api, { getApiData, getApiError, TOKEN_KEY, USER_ID_KEY } from '../../lib/api.js';

export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
      const response = await api.get('/users/me');
      const user = getApiData(response)?.user;
      if (!user) throw new Error('Respons profil tidak valid.');
      return { token, user };
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
      return rejectWithValue(getApiError(error, 'Sesi berakhir. Silakan login kembali.'));
    }
  },
  {
    condition: (_, { getState }) => !['restoring', 'loading', 'succeeded', 'anonymous'].includes(getState().auth.status),
  },
);

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/login', { email: email.trim().toLowerCase(), password });
      const result = getApiData(response);
      if (!result?.access_token || !result.user) throw new Error('Respons login tidak valid.');
      localStorage.setItem(TOKEN_KEY, result.access_token);
      localStorage.setItem(USER_ID_KEY, String(result.user.id));
      return { token: result.access_token, user: result.user };
    } catch (error) {
      return rejectWithValue(getApiError(error, 'Login gagal. Periksa email dan password.'));
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
      if (!user) throw new Error('Respons registrasi tidak valid.');
      // Registration deliberately returns the new user without creating a session.
      return user;
    } catch (error) {
      return rejectWithValue(getApiError(error, 'Registrasi gagal. Periksa data dan coba lagi.'));
    }
  },
);

const initialState = {
  user: null,
  accessToken: null,
  status: 'checking',
  error: null,
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
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
        state.error = null;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.status = action.payload ? 'succeeded' : 'anonymous';
        state.accessToken = action.payload?.token ?? null;
        state.user = action.payload?.user ?? null;
        state.error = null;
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.status = 'anonymous';
        state.accessToken = null;
        state.user = null;
        state.error = action.payload ?? null;
      })
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
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
