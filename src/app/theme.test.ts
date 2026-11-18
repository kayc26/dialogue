// The Light/Dark switch's saved choice (theme.ts). What matters to a tester: a choice
// they made sticks over the system setting, and a bad or blocked localStorage never
// breaks the page; it just follows the system again.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentTheme, readSaved } from './theme'

function setup(stored: string | null | 'throws', systemDark: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: systemDark }))
  vi.stubGlobal('localStorage', {
    getItem: () => {
      if (stored === 'throws') throw new Error('SecurityError: storage blocked')
      return stored
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme choice', () => {
  it('follows the system when nothing is saved', () => {
    setup(null, true)
    expect(currentTheme()).toBe('dark')
  })

  it('a saved Light choice wins over a dark system setting', () => {
    setup('light', true)
    expect(currentTheme()).toBe('light')
  })

  it('a corrupt saved value counts as no choice', () => {
    setup('blue', false)
    expect(readSaved()).toBeNull()
    expect(currentTheme()).toBe('light')
  })

  it('blocked storage (private window, strict settings) falls back to the system', () => {
    setup('throws', true)
    expect(currentTheme()).toBe('dark')
  })
})
