// Light / dark switch (Kay, 2026-11-17). With no choice saved, the page follows the
// system setting (prefers-color-scheme). A saved choice puts `theme-light` or
// `theme-dark` on <html>; app.css keys its dark tokens off those classes. The
// High Contrast theme still wins over both (it comes last in app.css).

export type Theme = 'light' | 'dark'

const KEY = 'dea.theme'

/** The saved choice, or null to follow the system. Anything else stored counts as no choice. */
export function readSaved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function currentTheme(): Theme {
  return readSaved() ?? systemTheme()
}

export function applyTheme(t: Theme | null): void {
  const c = document.documentElement.classList
  c.toggle('theme-light', t === 'light')
  c.toggle('theme-dark', t === 'dark')
}

/** Switch to the other theme, remember it, and return it. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* lasts for this page */
  }
  return next
}
