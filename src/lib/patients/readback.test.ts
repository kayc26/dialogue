// The regimen read-back is the one place the app shows insulin doses. It must stay a
// record, never an instruction (ADR-0005: the bot never gives dose advice; the
// regimen is read back by template and never reaches the model).

import { describe, expect, it } from 'vitest'
import { minutesAgo, regimenLines, specialPlanView, summarizeGlucose, type Regimen, type SpecialPlan } from './readback'
import helen from '../../../patients/fixtures/demo-helen.json'
import robert from '../../../patients/fixtures/demo-robert.json'
import personas from '../../../patients/personas.json'
import george from '../../../patients/fixtures/demo-george.json'
import dorothy from '../../../patients/fixtures/demo-dorothy.json'
import mei from '../../../patients/fixtures/demo-mei.json'
import walter from '../../../patients/fixtures/demo-walter.json'

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
})

describe('special plan read-back (ADR-0019)', () => {
  // Robert's provider plan is a prednisone taper; the insulin dose that applies depends
  // on the day, so code (never a model) marks today's step. A wrong day here would show
  // the wrong insulin line as "today".
  const robertRegimen = robert.regimen as unknown as Regimen // JSON arrays stand in for the [start, end] tuples
  const plan = robertRegimen.special_plan!
  const withStart = (daysAgo: number): Regimen => ({ ...robertRegimen, special_plan: { ...plan, started_days_ago: daysAgo } })

  it("marks Robert's day 6 step (started 5 days ago) as today", () => {
    const v = specialPlanView(robertRegimen)!
    expect(v.today).toBe(6)
    expect(v.lastDay).toBe(14)
    expect(v.status).toBe('on')
    expect(v.steps.filter((s) => s.current).map((s) => s.label)).toEqual(['Days 6–8'])
    expect(v.steps.find((s) => s.current)!.text).toMatch(/30 mg.*16 units before breakfast/)
  })

  it.each([
    [0, 'Days 1–5'], // the start day itself is day 1
    [4, 'Days 1–5'], // last day of the first step
    [5, 'Days 6–8'], // first day of the next step
    [13, 'Days 12–14'], // the last day of the taper
  ])('started %i days ago → today is in %s', (daysAgo, label) => {
    const v = specialPlanView(withStart(daysAgo))!
    expect(v.status).toBe('on')
    expect(v.steps.filter((s) => s.current).map((s) => s.label)).toEqual([label])
  })

  it('after the last day, no step is marked and the plan reads as finished', () => {
    const v = specialPlanView(withStart(14))!
    expect(v.status).toBe('finished')
    expect(v.steps.some((s) => s.current)).toBe(false)
    expect(v.after).toMatch(/back to the usual plan/)
  })

  it('agrees with the patient record it belongs to', () => {
    // The fixture is hand-edited until the next build.py run; both copies must match,
    // and the plan's start must match the clinic history the triage flags read.
    const persona = personas.personas.find((p) => p.id === 'demo-robert') as { special_plan: Record<string, unknown> }
    const { $comment: _ignored, ...fromPersona } = persona.special_plan
    expect(plan).toEqual(fromPersona)
    expect(plan.started_days_ago).toBe(robert.clinic_history.days_since_steroid_start)
  })

  it('shows nothing for patients without a plan, and nothing for a plan it cannot place', () => {
    expect(specialPlanView(helen.regimen as Regimen)).toBeNull()
    const bad = { ...plan, steps: [{ days: ['6', 8] }] } as unknown as SpecialPlan
    expect(specialPlanView({ ...robertRegimen, special_plan: bad })).toBeNull()
  })
})

describe('Regression tests', () => {
  it('no read-back line ends in a doubled period after "a.m." or "p.m." (Kay, live site, 2026-11-19)', () => {
    // Bug: "what's my insulin on file" showed "…usually recorded around 6 a.m., 10 a.m.
    // and 4 p.m.." — each line added its own period after a time that already ends in one.
    // Fixed: endSentence adds a period only when the sentence doesn't end with one.
    for (const p of [helen, robert, george, dorothy, mei, walter]) {
      for (const line of regimenLines(p.regimen as Regimen)) expect(line, p.id).not.toMatch(/\.\./)
    }
    expect(regimenLines(dorothy.regimen as Regimen).join(' ')).toMatch(/ [ap]\.m\.$/) // still one period at the end
    // A special-plan step whose text brings its own period gets one, not two.
    const robertRegimen = robert.regimen as unknown as Regimen // JSON arrays stand in for the [start, end] tuples
    const plan = {
      ...robertRegimen.special_plan,
      steps: [{ days: [1, 30], steroid: 'Prednisone 10 mg each morning.', insulin: 'Insulin as usual, last dose by 6 p.m.' }],
    } as SpecialPlan
    const view = specialPlanView({ ...robertRegimen, special_plan: plan })
    expect(view?.steps[0]?.text).toBe('Prednisone 10 mg each morning. Insulin as usual, last dose by 6 p.m.')
  })

  it('does not crash on a stored regimen in another shape (rls-dev placeholder patient)', () => {
    // Bug found 2026-11-14 by a headless-Chrome click-through: the rls-dev fixture
    // stores {"insulins":[{"generic":"placeholder","kind":"basal"}]} with no usual_times,
    // and regimenLines threw "Cannot read properties of undefined (reading 'length')",
    // blanking the "My insulin" list. Stored data in an unexpected shape must degrade.
    const odd = { insulins: [{ generic: 'placeholder', kind: 'basal' }] } as unknown as Regimen
    expect(regimenLines(odd)).toEqual(['placeholder: dose not recorded.'])
  })

  it('falls back to "nothing on file" for an empty or missing regimen', () => {
    expect(regimenLines({} as Regimen)).toEqual(['No insulin is on file for this demo patient.'])
  })

  it('shows glucose in whole mg/dL, as a meter does (122.4 → 122)', () => {
    // Bug seen 2026-11-17 in Kay's screenshot: Dorothy's patient bar read
    // "Latest glucose 122.4 mg/dL". Some dataset readings were converted from mmol/L
    // and keep a decimal; a patient's meter never shows one. Fixed in summarizeGlucose,
    // which feeds the patient bar and the My insulin 24-hour low/high.
    const s = summarizeGlucose([
      { minutes_before_load: 0, value_mgdl: 122.4, source: 'cgm' },
      { minutes_before_load: 60, value_mgdl: 87.6, source: 'cgm' },
      { minutes_before_load: 120, value_mgdl: 201.5, source: 'fingerstick' },
    ])!
    expect(s.latest.value_mgdl).toBe(122)
    expect(s.lowest24h).toBe(88)
    expect(s.highest24h).toBe(202)
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
