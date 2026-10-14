import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { Palette, ThemeMode, palettes } from "../theme";

type ThemeContextValue = Palette & {
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// In-memory only — this project's Supabase client also skips persisted
// storage (native AsyncStorage doesn't link in Expo Go), so we keep the
// theme choice consistent with that: it resets to "light" on a fresh app
// launch, but survives navigation and reloads-in-place fine.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...palettes[mode],
      setMode,
      toggleTheme: () => setMode((m) => (m === "light" ? "dark" : "light")),
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
