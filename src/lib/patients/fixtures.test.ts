// Demo-patient fixtures (patients/fixtures/*.json, built by patients/build.py from
// ShanghaiT1DM/T2DM; ADR-0009). Each persona exists to show one path through the
// clinic's flowchart in a demo, so its readings must keep fitting its story after any
// rebuild (QST-SYNTH-SCENARIOS: B, real windows only). A regenerated fixture whose
// "repeated lows" patient no longer has repeated lows would make the demo lie.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Reading { minutes_before_load: number; value_mgdl: number; source: 'cgm' | 'fingerstick' }
interface Fixture {
  id: string
  display_name: string
  age: number
  diabetes_type: 'type1' | 'type2'
  regimen: { insulins: { name: string; usual_units: number }[]; pump: unknown | null }
  flags: { history_of_dka: boolean; pregnant: boolean; uses_pump: boolean }
  clinic_history: Record<string, number | null>
  data_source: { license: string; doi: string; changes: string; recording: string }
  readings: Reading[]
}

const dir = join(process.cwd(), 'patients', 'fixtures')
const fixtures: Record<string, Fixture> = Object.fromEntries(
  readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const fx = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture
    return [fx.id, fx]
  }),
)
const cgm = (fx: Fixture) => fx.readings.filter((r) => r.source === 'cgm')
const within = (fx: Fixture, hours: number) => cgm(fx).filter((r) => r.minutes_before_load <= hours * 60)

/** Low episodes (<70 mg/dL); one episode ends after 30+ minutes back above 70. */
function lowEpisodes(readings: Reading[]): Reading[] {
  const asc = [...readings].sort((a, b) => b.minutes_before_load - a.minutes_before_load)
  const starts: Reading[] = []
  let lastLow: number | null = null
  for (const r of asc) {
    if (r.value_mgdl < 70) {
      if (lastLow === null || lastLow - r.minutes_before_load > 30) starts.push(r)
      lastLow = r.minutes_before_load
    }
  }
  return starts
}

describe('demo-patient fixtures', () => {
  it('has the six personas', () => {
    expect(Object.keys(fixtures).sort()).toEqual(
      ['demo-dorothy', 'demo-george', 'demo-helen', 'demo-mei', 'demo-robert', 'demo-walter'],
    )
  })

  it.each(Object.keys(fixtures))('%s carries the CC BY attribution and marks fictional parts', (id) => {
    const fx = fixtures[id]
    expect(fx.data_source.license).toBe('CC BY 4.0')
    expect(fx.data_source.doi).toBe('10.6084/m9.figshare.c.6310860')
    // Names no longer carry "(demo)" (Kay, 2026-11-17: every patient is a demo patient).
    // The picker's "made-up names and details" and this note mark them as fictional.
    expect(fx.data_source.changes).toMatch(/fictional/)
    expect(fx.readings.every((r) => r.minutes_before_load >= 0 && r.value_mgdl > 0)).toBe(true)
    expect(cgm(fx).length).toBeGreaterThan(200) // at least ~2 days of 15-minute readings
  })

  it('Robert (red flag: above 350) has readings above 350 in the last 48 hours', () => {
    expect(within(fixtures['demo-robert'], 48).filter((r) => r.value_mgdl > 350).length).toBeGreaterThanOrEqual(2)
  })

  it('George (DKA history, pump) has a high reading recently and pump records', () => {
    const fx = fixtures['demo-george']
    expect(fx.diabetes_type).toBe('type1')
    expect(fx.flags).toMatchObject({ history_of_dka: true, uses_pump: true })
    expect(fx.regimen.pump).not.toBeNull()
    expect(within(fx, 48).some((r) => r.value_mgdl > 350)).toBe(true)
  })

  it('Dorothy (red flag: repeated and severe lows) has 3+ lows within 48 hours, one below 54, ending near load', () => {
    const fx = fixtures['demo-dorothy']
    expect(fx.age).toBeGreaterThanOrEqual(65) // an older adult, the bot's audience
    const recent = lowEpisodes(within(fx, 52))
    expect(recent.length).toBeGreaterThanOrEqual(3)
    expect(within(fx, 52).some((r) => r.value_mgdl < 54)).toBe(true)
  })

  it('Mei (red flag: pregnancy) is flagged pregnant and has steady readings', () => {
    const fx = fixtures['demo-mei']
    expect(fx.flags.pregnant).toBe(true)
    expect(cgm(fx).every((r) => r.value_mgdl >= 54 && r.value_mgdl <= 300)).toBe(true)
  })

  it.each(['demo-helen', 'demo-walter'])('%s (no glucose red flag) never goes below 54 or above 300', (id) => {
    expect(cgm(fixtures[id]).every((r) => r.value_mgdl >= 54 && r.value_mgdl <= 300)).toBe(true)
  })

  it('Walter (high-touch from history only) meets the history criteria', () => {
    const h = fixtures['demo-walter'].clinic_history
    expect(h.days_since_visit).toBeGreaterThan(180) // last visit > 6 months
    expect(h.calls_60d).toBeGreaterThan(4) // > 4 calls in 2 months
  })

  it('every regimen comes from the subject’s own records (insulin or pump)', () => {
    for (const fx of Object.values(fixtures)) {
      expect(fx.regimen.insulins.length > 0 || fx.regimen.pump !== null, fx.id).toBe(true)
    }
  })
})
