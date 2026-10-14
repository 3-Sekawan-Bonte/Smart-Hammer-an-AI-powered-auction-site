import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  nextTheme,
  persistTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from '../src/contexts/themePreferences.js';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

function createStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, THEME_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, THEME_STORAGE_KEY);
      value = next;
    },
  };
}

test('theme defaults to the system preference and falls back to light', () => {
  assert.deepEqual(resolveInitialTheme({
    getStorage: () => createStorage(),
    getMatchMedia: () => () => ({ matches: true }),
  }), { theme: 'dark', hasSavedPreference: false });
  assert.deepEqual(resolveInitialTheme({
    getStorage: () => createStorage(),
    getMatchMedia: () => { throw new Error('unavailable'); },
  }), { theme: 'light', hasSavedPreference: false });
});

test('saved light and dark preferences restore before system preference', () => {
  for (const theme of ['light', 'dark']) {
    assert.deepEqual(resolveInitialTheme({
      getStorage: () => createStorage(theme),
      getMatchMedia: () => () => ({ matches: theme !== 'dark' }),
    }), { theme, hasSavedPreference: true });
  }
});

test('invalid or missing stored preferences use the system preference', () => {
  for (const stored of [null, 'sepia', 'DARK']) {
    assert.deepEqual(resolveInitialTheme({
      getStorage: () => createStorage(stored),
      getMatchMedia: () => () => ({ matches: false }),
    }), { theme: 'light', hasSavedPreference: false });
  }
});

test('toggle selection persists and is restored after a simulated reload', () => {
  const storage = createStorage('light');
  const selected = nextTheme(resolveInitialTheme({ getStorage: () => storage }).theme);
  assert.equal(selected, 'dark');
  assert.equal(persistTheme(selected, () => storage), true);
  assert.deepEqual(resolveInitialTheme({ getStorage: () => storage }), {
    theme: 'dark', hasSavedPreference: true,
  });
  assert.equal(nextTheme(selected), 'light');
});

test('storage read and write failures do not prevent theme initialization', () => {
  assert.deepEqual(resolveInitialTheme({
    getStorage: () => { throw new Error('blocked'); },
    getMatchMedia: () => () => ({ matches: true }),
  }), { theme: 'dark', hasSavedPreference: false });
  assert.equal(persistTheme('dark', () => { throw new Error('blocked'); }), false);
});

test('global provider wraps routes and navbar toggle is accessible', async () => {
  const [main, layout, provider, store] = await Promise.all([
    source('../src/main.jsx'), source('../src/components/Layout.jsx'),
    source('../src/contexts/ThemeContext.jsx'), source('../src/app/store.js'),
  ]);
  assert.match(main, /<ThemeProvider>[\s\S]*<AuthProvider>[\s\S]*<SocketProvider>[\s\S]*<App \/>/);
  assert.match(layout, /aria-label=\{theme === 'dark' \? 'Aktifkan mode terang' : 'Aktifkan mode gelap'\}/);
  assert.match(layout, /aria-pressed=\{theme === 'dark'\}/);
  assert.match(provider, /if \(!context\) throw new Error\('useTheme harus dipakai di dalam ThemeProvider'\)/);
  assert.doesNotMatch(store, /theme/i);
  assert.match(provider, /persistTheme\(next\)/);
});

test('theme tokens style global surfaces while Redux and socket providers remain intact', async () => {
  const [css, main] = await Promise.all([source('../src/index.css'), source('../src/main.jsx')]);
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*--paper:/);
  assert.match(css, /:root\[data-theme="dark"\] \.ai-feed/);
  assert.match(css, /:root\[data-theme="dark"\] \.bid-zone/);
  assert.match(main, /<Provider store=\{store\}>/);
  assert.match(main, /<SocketProvider>/);
});
