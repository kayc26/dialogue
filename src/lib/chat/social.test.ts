// Which messages count as small talk (ADR-0016). The list is closed on purpose: a
// message counts only when ALL of it is small talk, so anything with a question or a
// symptom in it takes the normal, guarded path.
import { describe, expect, it } from 'vitest'
import { socialIntent } from './social'

describe('small talk is recognized only when the whole message is small talk', () => {
  it('recognizes the ways testers open, thank, close, and ask what the assistant is', () => {
    expect(socialIntent('hi')).toBe('greeting')
    expect(socialIntent('Hello there!')).toBe('greeting')
    expect(socialIntent('Good morning, how are you today?')).toBe('greeting')
    expect(socialIntent('thank you so much')).toBe('thanks')
    expect(socialIntent('Ok thanks')).toBe('thanks')
    expect(socialIntent("That's all for now, bye")).toBe('goodbye')
    expect(socialIntent('Who are you?')).toBe('about')
    expect(socialIntent('Are you a real person?')).toBe('about')
  })

  it('answers the more useful part of a mixed message', () => {
    expect(socialIntent('Hi, what can you help me with?')).toBe('about')
    expect(socialIntent('thanks, bye!')).toBe('goodbye')
  })

  it('leaves anything with a question or a symptom in it to the normal path', () => {
    expect(socialIntent('hi, what fruit can I eat?')).toBeNull()
    expect(socialIntent('hello, I feel dizzy')).toBeNull()
    expect(socialIntent('thanks, but what about bananas?')).toBeNull()
    expect(socialIntent('ok')).toBeNull() // filler alone is not small talk
  })

  it('matches whole words only: "high" is not "hi"', () => {
    expect(socialIntent('high')).toBeNull()
    expect(socialIntent('hey high sugar')).toBeNull()
  })
})
