// The regimen read-back is the one place the app shows insulin doses. It must stay a
// record, never an instruction (ADR-0005: the bot never gives dose advice; the
// regimen is read back by template and never reaches the model).

import { describe, expect, it } from 'vitest'
import { minutesAgo, regimenLines, REGIMEN_DISCLAIMER, summarizeGlucose, type Regimen } from './readback'
import helen from '../../../patients/fixtures/demo-helen.json'
import george from '../../../patients/fixtures/demo-george.json'
import dorothy from '../../../patients/fixtures/demo-dorothy.json'

const IMPERATIVE = /\b(take|inject|give|use|increase|decrease|skip|should|need to|must)\b/i

describe('regimen read-back', () => {
  it.each([
    ['Helen (one long-acting insulin)', helen.regimen],
    ['George (pump only)', george.regimen],
    ['Dorothy (two insulins)', dorothy.regimen],
  ])('%s reads as a record, never an instruction', (_name, regimen) => {
    const lines = regimenLines(regimen as Regimen)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toMatch(IMPERATIVE)
  })

  it('shows the pump settings for a pump user instead of claiming no insulin', () => {
    const lines = regimenLines(george.regimen as Regimen)
    expect(lines.join(' ')).toMatch(/pump background rate: about 0\.7 units per hour/)
    expect(lines.join(' ')).not.toMatch(/No insulin/)
  })

  it('names the dose times in everyday clock words', () => {
    expect(regimenLines(helen.regimen as Regimen)[0]).toMatch(/around 8 p\.m\. and 9 p\.m\./)
  })

  it('carries the disclaimer that the care team comes first', () => {
    expect(REGIMEN_DISCLAIMER).toMatch(/not advice/)
    expect(REGIMEN_DISCLAIMER).toMatch(/care team's latest instructions always come first/)
    expect(REGIMEN_DISCLAIMER).not.toMatch(IMPERATIVE)
  })
})

describe('glucose read-back', () => {
  it('reports the latest reading and the past day’s range from real fixture data', () => {
    const s = summarizeGlucose(dorothy.readings as never)!
    expect(s.latest.minutes_before_load).toBe(Math.min(...dorothy.readings.map((r) => r.minutes_before_load)))
    expect(s.lowest24h).toBeLessThanOrEqual(s.latest.value_mgdl)
    expect(s.highest24h).toBeGreaterThanOrEqual(s.latest.value_mgdl)
    expect(s.count24h).toBeGreaterThan(50) // CGM every 15 minutes
  })

  it('returns nothing rather than inventing a reading when none exist', () => {
    expect(summarizeGlucose([])).toBeNull()
  })

  it('says how long ago in plain words', () => {
    expect(minutesAgo(0)).toBe('just now')
    expect(minutesAgo(1)).toBe('1 minute ago')
    expect(minutesAgo(90)).toBe('about 2 hours ago')
    expect(minutesAgo(3 * 24 * 60)).toBe('about 3 days ago')
  })
})
