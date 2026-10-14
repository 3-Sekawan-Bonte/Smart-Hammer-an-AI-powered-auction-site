import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  isTheme,
  nextTheme,
  persistTheme,
  resolveInitialTheme,
} from './themePreferences';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [initialPreference] = useState(resolveInitialTheme);
  const [theme, setThemeState] = useState(initialPreference.theme);
  const [hasSavedPreference, setHasSavedPreference] = useState(initialPreference.hasSavedPreference);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (hasSavedPreference) return undefined;

    let mediaQuery;
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    if (!mediaQuery) return undefined;

    const syncSystemTheme = (event) => setThemeState(event.matches ? 'dark' : 'light');
    mediaQuery.addEventListener?.('change', syncSystemTheme);
    return () => mediaQuery.removeEventListener?.('change', syncSystemTheme);
  }, [hasSavedPreference]);

  const setTheme = useCallback((next) => {
    if (!isTheme(next)) throw new TypeError('Tema harus berupa "light" atau "dark"');
    setThemeState(next);
    setHasSavedPreference(true);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(nextTheme(theme)), [setTheme, theme]);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme harus dipakai di dalam ThemeProvider');
  return context;
}
