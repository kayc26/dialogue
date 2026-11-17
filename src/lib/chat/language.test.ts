// Which messages count as not English (ADR-0017, QST-LANG-FLOOR: A). A message that
// isn't English skips every English-only safety pattern, so the floor shows help for
// it. These are the kinds of messages a tester might actually send.
import { describe, expect, it } from 'vitest'
import { detectLanguage } from './language'

describe('the languages Kay named are recognized', () => {
  it('Spanish, including short urgent messages', () => {
    expect(detectLanguage('no puedo respirar')).toBe('es')
    expect(detectLanguage('¿Qué puedo comer?')).toBe('es')
    expect(detectLanguage('mi azúcar está en 400')).toBe('es')
    expect(detectLanguage('estoy mareado')).toBe('es')
  })

  it('Chinese in both scripts, and Korean', () => {
    expect(detectLanguage('我的血糖是400')).toBe('zh') // Simplified
    expect(detectLanguage('我的血糖很高，怎麼辦？')).toBe('zh') // Traditional
    expect(detectLanguage('혈당이 너무 높아요')).toBe('ko')
  })

  it('other languages are flagged too, so the floor still applies', () => {
    expect(detectLanguage('血糖値が高いです')).toBe('other') // Japanese
    expect(detectLanguage('у меня высокий сахар')).toBe('other') // Russian
    expect(detectLanguage("j'ai très soif")).toBe('other') // French
    expect(detectLanguage('đường huyết của tôi cao')).toBe('other') // Vietnamese
  })
})

describe('English messages stay English', () => {
  it('including food names and loan words from other languages', () => {
    expect(detectLanguage('Can I eat jalapeños?')).toBe('en')
    expect(detectLanguage('Is a café latte OK with my blood sugar?')).toBe('en')
    expect(detectLanguage('what about tortillas and salsa')).toBe('en')
  })

  it('including bare numbers and very short messages', () => {
    expect(detectLanguage('400')).toBe('en')
    expect(detectLanguage('hi')).toBe('en')
    expect(detectLanguage('my sugar is 380')).toBe('en')
  })
})
