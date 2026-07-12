"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"

export type ThemePreference = "light" | "dark" | "system" | "high-contrast" | "outdoor"
export type DensityPreference = "compact" | "comfortable" | "spacious"

interface ThemeContextValue {
  /** localStorage’da saklanan tercih */
  preference: ThemePreference
  /** `document.documentElement` üzerinde uygulanan gerçek tema */
  resolvedTheme: "light" | "dark" | "high-contrast" | "outdoor"
  /** Yoğunluk tercihi */
  density: DensityPreference
  setPreference: (p: ThemePreference) => void
  setDensity: (d: DensityPreference) => void
  /** Açık ↔ koyu; açıksa sistem modundan çıkarıp karşı tema seçilir */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "light",
  resolvedTheme: "light",
  density: "comfortable",
  setPreference: () => {},
  setDensity: () => {},
  toggleTheme: () => {},
})

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "light"
  const raw = localStorage.getItem("theme")
  if (raw === "light" || raw === "dark" || raw === "system" || raw === "high-contrast" || raw === "outdoor") return raw
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStoredDensity(): DensityPreference {
  if (typeof window === "undefined") return "comfortable"
  const raw = localStorage.getItem("density")
  if (raw === "compact" || raw === "comfortable" || raw === "spacious") return raw
  return "comfortable"
}

function readSystemDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "light" : readStoredPreference()
  )
  const [density, setDensityState] = useState<DensityPreference>(() =>
    typeof window === "undefined" ? "comfortable" : readStoredDensity()
  )
  const [systemDark, setSystemDark] = useState(readSystemDark)

  const resolvedTheme = useMemo(() => {
    if (preference === "system") return systemDark ? "dark" : "light"
    return preference
  }, [preference, systemDark])

  useLayoutEffect(() => {
    const root = document.documentElement
    // Remove all theme classes
    root.classList.remove("light", "dark", "high-contrast", "outdoor")
    // Add current theme class
    root.classList.add(resolvedTheme)
    
    // Set data attribute for theme-specific CSS selectors if needed
    root.setAttribute("data-theme", resolvedTheme)
    
    // Density
    root.setAttribute("data-density", density)
  }, [resolvedTheme, density])

  useEffect(() => {
    localStorage.setItem("theme", preference)
  }, [preference])

  useEffect(() => {
    localStorage.setItem("density", density)
  }, [density])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
  }, [])

  const setDensity = useCallback((d: DensityPreference) => {
    setDensityState(d)
  }, [])

  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => {
      const current =
        prev === "system" ? (systemDark ? "dark" : "light") : prev
      return current === "dark" ? "light" : "dark"
    })
  }, [systemDark])

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      density,
      setPreference,
      setDensity,
      toggleTheme,
    }),
    [preference, resolvedTheme, density, setPreference, setDensity, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
