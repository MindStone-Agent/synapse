import { useEffect, useState } from 'react'

const STORAGE_KEY = 'synapse.theme'

export type Theme = 'light' | 'dark'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  // Default light per the design direction. Respect system if it's dark.
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function apply(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = readInitial()
    apply(t)
    return t
  })

  useEffect(() => {
    apply(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  return {
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  }
}
