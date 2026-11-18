// Read-back of a demo patient's stored data (ADR-0005: regimen read back by a fixed
// template, never by the model; ADR-0006 QST-TRIAGE-CGM: A, glucose is shown, not
// interpreted). The wording reports what is on file and never instructs: a read-back
// that says "take 8 units" would be dose advice in the bot's own voice.

export interface Insulin {
  name: string
  usual_units: number
  usual_times: string[]
}
export interface Pump {
  basal_units_per_hour: number | null
  usual_bolus_units: number | null
}
export interface Regimen {
  insulins: Insulin[]
  pump: Pump | null
  /** ADR-0019: a provider's dated plan for a period (a steroid taper), shown by template. */
  special_plan?: SpecialPlan
}

export interface SpecialPlanStep {
  days: [number, number]
  steroid?: string
  insulin?: string
}
export interface SpecialPlan {
  kind: string
  title: string
  reason?: string
  set_by?: string
  /** Days counted at load time (ADR-0019 QST-PLAN-DATES: A), like the readings. */
  started_days_ago: number
  steps: SpecialPlanStep[]
  after?: string
  check?: string
  demo_note?: string
}
export interface Reading {
  minutes_before_load: number
  value_mgdl: number
  source: 'cgm' | 'fingerstick'
}

const clock = (hhmm: string): string => {
  const h = Number(hhmm.slice(0, 2))
  const suffix = h < 12 ? 'a.m.' : 'p.m.'
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`
}

function joinTimes(times: string[]): string {
  const t = times.map(clock)
  return t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`
}

/**
 * One plain sentence per insulin or pump setting, in the past tense of a record.
 * Tolerates stored regimens in other shapes (missing times, units, or a `generic`
 * field instead of `name`): a malformed record must never blank the screen.
 */
export function regimenLines(r: Regimen): string[] {
  const insulins = Array.isArray(r?.insulins) ? r.insulins : []
  const lines = insulins.flatMap((raw) => {
    const i = raw as Partial<Insulin> & { generic?: string }
    const name = i.name ?? i.generic
    if (!name) return []
    const times = Array.isArray(i.usual_times) ? i.usual_times.filter((t) => /^\d{2}:\d{2}$/.test(t)) : []
    const when = times.length ? `, usually recorded around ${joinTimes(times)}` : ''
    const dose = typeof i.usual_units === 'number' ? `about ${i.usual_units} units per dose` : 'dose not recorded'
    return [`${name}: ${dose}${when}.`]
  })
  if (r?.pump) {
    if (r.pump.basal_units_per_hour !== null)
      lines.push(`Insulin pump background rate: about ${r.pump.basal_units_per_hour} units per hour.`)
    if (r.pump.usual_bolus_units !== null)
      lines.push(`Insulin pump meal doses: about ${r.pump.usual_bolus_units} units each.`)
  }
  return lines.length ? lines : ['No insulin is on file for this demo patient.']
}

export interface SpecialPlanView {
  title: string
  reason: string | null
  setBy: string | null
  /** Day 1 is the start day; "5 days ago" makes today day 6. */
  today: number
  lastDay: number
  /** Where today falls: on a step, before the first, or after the last. */
  status: 'on' | 'not_started' | 'finished'
  steps: { label: string; text: string; current: boolean }[]
  after: string | null
  check: string | null
  note: string | null
}

/**
 * A provider's special plan, shown word for word with today's step marked (ADR-0019,
 * QST-PLAN-SHOW: A). Code works out which step is today; no model ever sees the plan
 * (ADR-0005, rule 1). Returns null when there is no plan, or one too malformed to show
 * safely: a half-read plan could point at the wrong step, so nothing beats a guess.
 */
export function specialPlanView(r: Regimen | null | undefined): SpecialPlanView | null {
  const p = r?.special_plan as Partial<SpecialPlan> | undefined
  if (!p || typeof p !== 'object' || typeof p.title !== 'string') return null
  if (typeof p.started_days_ago !== 'number' || !Number.isInteger(p.started_days_ago) || p.started_days_ago < -365) return null
  const raw = Array.isArray(p.steps) ? p.steps : []
  const valid = raw.every(
    (s) => Array.isArray(s?.days) && s.days.length === 2 && s.days.every(Number.isInteger) && s.days[0] >= 1 && s.days[0] <= s.days[1],
  )
  if (!raw.length || !valid) return null
  const steps = [...raw].sort((a, b) => a.days[0] - b.days[0])
  const today = p.started_days_ago + 1
  const lastDay = Math.max(...steps.map((s) => s.days[1]))
  const firstDay = steps[0].days[0]
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  return {
    title: p.title,
    reason: str(p.reason),
    setBy: str(p.set_by),
    today,
    lastDay,
    status: today < firstDay ? 'not_started' : today > lastDay ? 'finished' : 'on',
    steps: steps.map((s) => ({
      label: s.days[0] === s.days[1] ? `Day ${s.days[0]}` : `Days ${s.days[0]}–${s.days[1]}`,
      text: [str(s.steroid), str(s.insulin)].filter(Boolean).join('. ') + '.',
      current: today >= s.days[0] && today <= s.days[1],
    })),
    after: str(p.after),
    check: str(p.check),
    note: str(p.demo_note),
  }
}

/** What the chat shows for a plan question (ADR-0020). Built by code; no model writes it. */
export interface PlanReply {
  /** A provider's special plan in force, or the insulin as recorded (QST-READ-WHAT: B). */
  mode: 'special' | 'recorded'
  heading: string
  lines: string[]
  /** Special plans only. The record's heading already says what it is (Kay, 2026-11-17). */
  footer?: string
}

export const PLAN_FOOTER =
  'The full plan is under "My insulin". If your care team has told you something different since, follow what they said. If your sugar is out of range or you feel unwell, call the clinic.'

/**
 * The plan read-back for chat (ADR-0020, QST-READ-WHO: A; QST-READ-WHAT: B).
 *   - A special plan in force: today's step and the next change, in the provider's words.
 *   - Otherwise: the insulin as recorded, labeled as a record, not as a plan from the
 *     care team. The demo regimens are summaries of research dose records (ADR-0009),
 *     and calling them "your plan" would give them an authority they don't have.
 */
export function planReply(r: Regimen): PlanReply {
  const plan = specialPlanView(r)
  if (plan?.status === 'on') {
    const i = plan.steps.findIndex((s) => s.current)
    const next = plan.steps[i + 1]
    const lines = [`Today (day ${plan.today} of ${plan.lastDay}): ${plan.steps[i].text}`]
    if (next) lines.push(`From ${next.label.replace(/^Days? (\d+).*/, 'day $1')}: ${next.text}`)
    else if (plan.after) lines.push(plan.after)
    return { mode: 'special', heading: `Your plan from ${plan.setBy ?? 'your care team'} says (${plan.title}):`, lines, footer: PLAN_FOOTER }
  }
  const lines = regimenLines(r)
  if (plan?.status === 'finished') lines.unshift(`Your ${plan.title.toLowerCase()} on file ended after day ${plan.lastDay}.`)
  return { mode: 'recorded', heading: 'Your insulin as recorded (not a plan from your care team):', lines }
}

export function minutesAgo(m: number): string {
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `about ${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `about ${d} day${d === 1 ? '' : 's'} ago`
}

export interface GlucoseSummary {
  latest: Reading
  lowest24h: number
  highest24h: number
  count24h: number
}

/** Latest reading plus the past 24 hours' range. Shown as facts; nothing is judged. */
export function summarizeGlucose(readings: Reading[]): GlucoseSummary | null {
  if (readings.length === 0) return null
  const latest = readings.reduce((a, b) => (b.minutes_before_load < a.minutes_before_load ? b : a))
  const day = readings.filter((r) => r.minutes_before_load <= 24 * 60)
  // Whole mg/dL, as a meter shows it: some dataset readings were converted from mmol/L
  // and carry a decimal ("122.4 mg/dL", Kay's screenshot 2026-11-17).
  const mgdl = (v: number): number => Math.round(Number(v))
  const values = (day.length ? day : [latest]).map((r) => mgdl(r.value_mgdl))
  return {
    latest: { ...latest, value_mgdl: mgdl(latest.value_mgdl) },
    lowest24h: Math.min(...values),
    highest24h: Math.max(...values),
    count24h: day.length,
  }
}
