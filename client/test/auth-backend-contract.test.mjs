import assert from 'node:assert/strict';
import test from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import api, { TOKEN_KEY, USER_ID_KEY } from '../src/lib/api.js';
import authReducer, { login, selectIsAuthenticated } from '../src/features/auth/authSlice.js';

test('login accepts the backend accessToken contract and stores the session', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const priorAdapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => ({
    data: { message: 'Login successful.', data: { accessToken: 'signed-token', user: { id: 42, username: 'buyer', email: 'buyer@example.test' } } },
    status: 200, statusText: 'OK', headers: {}, config,
  });
  try {
    const store = configureStore({ reducer: { auth: authReducer } });
    await store.dispatch(login({ email: ' BUYER@EXAMPLE.TEST ', password: 'valid-password' })).unwrap();
    assert.equal(values.get(TOKEN_KEY), 'signed-token');
    assert.equal(values.get(USER_ID_KEY), '42');
    assert.equal(selectIsAuthenticated(store.getState()), true);
    assert.equal(store.getState().auth.user.email, 'buyer@example.test');
  } finally {
    api.defaults.adapter = priorAdapter;
    delete globalThis.localStorage;
  }
});
