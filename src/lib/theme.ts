export type Theme = "light" | "dark" | "system"

const KEY_THEME = "pt:theme"

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY_THEME)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {}
  return "system"
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY_THEME, theme)
  } catch {}
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(theme) === "dark"
  )
}

/**
 * Inlined into the document head and run before hydration so the correct
 * theme class is present for first paint — avoids a light/dark flash.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("${KEY_THEME}") || "system";
    var isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`
