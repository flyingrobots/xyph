import { createContext, useContext, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ResolvedTheme } from './resolve.js';
import { getTheme, resolveTheme } from './resolve.js';

const ThemeContext = createContext<ResolvedTheme | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Override theme name. If omitted, uses XYPH_THEME env / default. */
  themeName?: string;
}

/** Provides the resolved theme to all Ink children via React context. */
export function ThemeProvider({ children, themeName }: ThemeProviderProps): ReactElement {
  const resolved = useMemo(
    () => themeName !== undefined ? resolveTheme(themeName) : getTheme(),
    [themeName],
  );
  return (
    <ThemeContext.Provider value={resolved}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Returns the current theme. Falls back to the singleton if no ThemeProvider
 * is in the tree (safe for incremental migration).
 */
export function useTheme(): ResolvedTheme {
  const ctx = useContext(ThemeContext);
  return ctx ?? getTheme();
}
