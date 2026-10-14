export const THEME_STORAGE_KEY = 'smart-hammer-theme';
export const THEMES = Object.freeze(['light', 'dark']);

export function isTheme(value) {
  return THEMES.includes(value);
}

export function getSystemTheme(getMatchMedia = () => globalThis.matchMedia) {
  try {
    const matchMedia = getMatchMedia();
    return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readStoredTheme(getStorage = () => globalThis.localStorage) {
  try {
    const storedTheme = getStorage()?.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(options = {}) {
  const storedTheme = readStoredTheme(options.getStorage);
  if (storedTheme) return { theme: storedTheme, hasSavedPreference: true };
  return {
    theme: getSystemTheme(options.getMatchMedia),
    hasSavedPreference: false,
  };
}

export function persistTheme(theme, getStorage = () => globalThis.localStorage) {
  if (!isTheme(theme)) return false;
  try {
    getStorage()?.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function nextTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}
