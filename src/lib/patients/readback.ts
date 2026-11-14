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
}
export interface Reading {
  minutes_before_load: number
  value_mgdl: number
  source: 'cgm' | 'fingerstick'
}

export const REGIMEN_DISCLAIMER =
  "This is what's on file for this demo patient. It is not advice. Your care team's latest instructions always come first."

const clock = (hhmm: string): string => {
  const h = Number(hhmm.slice(0, 2))
  const suffix = h < 12 ? 'a.m.' : 'p.m.'
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`
}

function joinTimes(times: string[]): string {
  const t = times.map(clock)
  return t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`
}

/** One plain sentence per insulin or pump setting, in the past tense of a record. */
export function regimenLines(r: Regimen): string[] {
  const lines = r.insulins.map((i) => {
    const when = i.usual_times.length ? `, usually recorded around ${joinTimes(i.usual_times)}` : ''
    return `${i.name}: about ${i.usual_units} units per dose${when}.`
  })
  if (r.pump) {
    if (r.pump.basal_units_per_hour !== null)
      lines.push(`Insulin pump background rate: about ${r.pump.basal_units_per_hour} units per hour.`)
    if (r.pump.usual_bolus_units !== null)
      lines.push(`Insulin pump meal doses: about ${r.pump.usual_bolus_units} units each.`)
  }
  return lines.length ? lines : ['No insulin is on file for this demo patient.']
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
  const values = (day.length ? day : [latest]).map((r) => r.value_mgdl)
  return { latest, lowest24h: Math.min(...values), highest24h: Math.max(...values), count24h: day.length }
}
