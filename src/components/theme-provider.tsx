import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : getStoredTheme()
  )

  function setTheme(next: Theme) {
    setThemeState(next)
    setStoredTheme(next)
    applyTheme(next)
  }

  // Keep the page in sync with OS-level changes while "system" is active.
  useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
