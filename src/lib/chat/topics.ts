// Curated topic sections (ADR-0018, QST-RETRIEVAL-SHAPE: A; book: C, "best few passages").
//
// Word search handed the answer model four short fragments, and when the question's
// words weren't in the text it handed over nearby ones ("what can i eat after a hike"
// got how to treat a low). Now the classifier, which already runs on every message,
// also names one or two topics, and the answer model reads the WHOLE care-team FAQ and
// ADA material for those topics, plus the few book passages from the matching chapter
// that best match the question. The approach follows Kay's other prototype
// (kayc26/diabetes_chatbot, kb_curated/).
//
// This file holds passage ids only, never source text (the text is copyrighted and
// lives in kb_chunks). Ids come from kb/out/passages.json (build of 2026-11-16). A
// passage can sit in more than one topic. Left out on purpose: covers, tables of
// contents, addresses, the "early adulthood" page, and the nutrition infographic footer.
// Dose-tagged ids are listed where they belong; the turn still hides them from the
// model (ADR-0005), so listing them changes nothing about what the model sees.

import type { DiabetesType, Index, KbPassage } from './retrieve'

export const TOPICS = {
  basics: 'what diabetes is, how insulin and glucose work, a new diagnosis, the ABCs, complications',
  low_blood_sugar: 'hypoglycemia, low readings, shaky/sweaty/dizzy, confusion, the 15-15 rule, glucagon',
  high_blood_sugar: 'hyperglycemia, high readings, why sugar is high, thirst, ketones, DKA',
  monitoring: 'checking blood glucose, meters, CGMs, target range, time in range, patterns',
  medicines_devices: 'types of insulin and other diabetes medicines, pens, pumps, AID systems, supplies, costs (general information, not doses)',
  food: 'meals, carbs, the diabetes plate, portions, snacks, hunger, protein, drinks, fruit, eating on a budget, protein shakes, supplements, fasting',
  sweeteners: 'sugar substitutes, artificial sweeteners, sugar alcohols, sugar-free labels',
  activity: 'exercise, physical activity, walking, hiking, sports, staying safe while active, eating around exercise',
  daily_life: 'sick days, stress, sleep, work, travel, routines, getting older',
  support: 'emotional wellbeing, burnout, motivation, working with the care team, preparing for doctor visits and appointments, diabetes education classes, judging health information found online or from friends',
} as const
export type Topic = keyof typeof TOPICS
export const TOPIC_NAMES = Object.keys(TOPICS) as Topic[]

/** Sent with every routed answer, like the other bot's `always/`. */
const ALWAYS = ['ada-t1-guide-031'] // When to Seek Immediate Help

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(3, '0')}`)
const t1 = (...n: number[]) => n.map((x) => `ada-t1-guide-${String(x).padStart(3, '0')}`)
const t2 = (...n: number[]) => n.map((x) => `ada-t2-guide-${String(x).padStart(3, '0')}`)
const faq = (...n: number[]) => n.map((x) => `team-faqs-${String(x).padStart(3, '0')}`)

/** Care-team FAQ and ADA passages per topic, chosen by hand from their headings. */
const SECTIONS: Record<Topic, string[]> = {
  basics: [...t1(11, 12, 13), ...t2(2, 3, 12, 25, 26)],
  low_blood_sugar: [...t1(14, 15, 16, 23, 24, 25, 60), ...t2(21, 22)],
  high_blood_sugar: [...faq(8, 9), ...t1(27, 28, 29), ...t2(23)],
  monitoring: [...t1(32, 36, 38, 70), ...t2(13, 20)],
  medicines_devices: [...faq(12), ...t1(25, 33, 34, 39, 40, 59, 60, 76), ...t2(6, 7, 9, 11, 15, 16)], // 25, 60: glucagon
  food: [
    ...faq(1, 2, 3, 4, 5, 6, 7, 10, 11, 13),
    ...t1(41, 42, 43, 44, 46, 47, 75),
    ...t2(40, 41, 43),
    ...range('ada-plate', 1, 7),
    'ada-portions-001', 'ada-portions-002', 'ada-portions-006', 'ada-portions-007',
    'ada-nutrition-faqs-001', 'ada-nutrition-faqs-002', 'ada-nutrition-faqs-003',
  ],
  sweeteners: ['ada-sweeteners-001', 'ada-sweeteners-003', 'ada-sweeteners-004', 'ada-sweeteners-006'],
  activity: [...t1(48, 49, 50, 51, 52, 53, 54), ...t2(45, 46), 'ada-exercise-004'],
  daily_life: [...t1(30, 55, 56, 57, 61, 90, 91), ...t2(24)],
  support: [...t1(62, 63, 69, 71, 72, 74, 78, 79, 80, 81, 82, 83, 84, 85, 86, 88, 92), ...t2(5, 35, 37)],
}

/** The book's chapters (Bright Spots & Landmines), by passage-number range. */
const BOOK_CHAPTERS: Partial<Record<Topic, [number, number][]>> = {
  basics: [[1, 35]], // Start Here
  food: [[36, 272]],
  support: [[273, 451]], // Mindset
  activity: [[452, 676]], // Exercise
  daily_life: [[677, 728]], // Sleep
}
const bookTopicOf = (id: string): Topic[] => {
  const m = /^bright-spots-(\d+)$/.exec(id)
  if (!m) return []
  const n = Number(m[1])
  return (Object.entries(BOOK_CHAPTERS) as [Topic, [number, number][]][]).filter(([, rs]) => rs.some(([a, b]) => n >= a && n <= b)).map(([t]) => t)
}

/** Chapter headings inside the book ("FOOD: BRIGHT SPOTS") and the topic each maps to
 *  in BOOK_CHAPTERS. "Start Here" (basics) has no heading of this form. */
const CHAPTER_HEADING = /^(FOOD|MINDSET|EXERCISE|SLEEP)\s*:/
const HEADING_TOPIC: Record<string, Topic> = { FOOD: 'food', MINDSET: 'support', EXERCISE: 'activity', SLEEP: 'daily_life' }

/** Every passage id this map lists by name (sections and "always"), for checks. */
export function topicMapIds(): string[] {
  return [...new Set([...ALWAYS, ...Object.values(SECTIONS).flat()])]
}

export interface MapPassage {
  id: string
  source_label: string
  section: string | null
}

/**
 * Does this map still fit a knowledge-base build? The map names passages by id and the
 * book's chapters by number range, so a rebuild that renumbers passages would shrink a
 * section, or send a chapter to the wrong topic, with no error anywhere: sectionPassages
 * skips ids it can't find. Returns one line per problem; empty means the map fits.
 * kb/load.ts refuses to load a build with problems; topics.test.ts checks the local
 * build (kb/out/passages.json) whenever it exists.
 */
export function checkTopicMap(passages: MapPassage[]): string[] {
  const problems: string[] = []
  const byId = new Map(passages.map((p) => [p.id, p]))
  for (const id of ALWAYS) if (!byId.has(id)) problems.push(`always: ${id} is not in the knowledge base`)
  for (const [topic, ids] of Object.entries(SECTIONS)) {
    for (const id of ids) {
      const p = byId.get(id)
      if (!p) problems.push(`${topic}: ${id} is not in the knowledge base`)
      else if (p.source_label === 'book') problems.push(`${topic}: ${id} is a book passage; the book is routed by chapter, not listed`)
    }
  }
  for (const p of passages) {
    if (p.source_label !== 'book') continue
    if (!/^bright-spots-\d+$/.test(p.id)) {
      problems.push(`book: ${p.id} doesn't follow the bright-spots-NNN numbering the chapter ranges rely on`)
      continue
    }
    const topics = bookTopicOf(p.id)
    if (topics.length === 0) {
      problems.push(`book: ${p.id} falls in no chapter range, so no answer can use it`)
      continue
    }
    const heading = CHAPTER_HEADING.exec(p.section ?? '')
    if (heading && !topics.includes(HEADING_TOPIC[heading[1]])) {
      problems.push(`book: ${p.id} is headed "${p.section}" but its range sends it to ${topics.join(', ')}`)
    }
  }
  return problems
}

/** Keep only real topic names, in order, at most two (the classifier's reply is untrusted). */
export function validTopics(names: unknown): Topic[] {
  if (!Array.isArray(names)) return []
  const out: Topic[] = []
  for (const n of names) if (typeof n === 'string' && n in TOPICS && !out.includes(n as Topic)) out.push(n as Topic)
  return out.slice(0, 2)
}

export interface SectionOptions {
  diabetesType?: DiabetesType
  /** Passages the model must not see (dose-tagged, ADR-0005). */
  hidden: (p: KbPassage) => boolean
  /** Book passages per answer (Kay, 2026-11-17: "best few passages"). */
  bookLimit?: number
  /** Minimum search score for a book passage to be included. */
  bookMinScore?: number
}

/**
 * What the answer model reads for these topics: "when to get help", then the care-team
 * FAQ, then ADA (the patient's own diabetes type first), then the best few book
 * passages from the matching chapters. Empty when no listed passage is loaded, so the
 * caller falls back to word search.
 */
export function sectionPassages(topics: Topic[], message: string, passages: KbPassage[], index: Index, opts: SectionOptions): KbPassage[] {
  if (topics.length === 0) return []
  const byId = new Map(passages.map((p) => [p.id, p]))
  const ids = new Set<string>(topics.flatMap((t) => SECTIONS[t]))
  const listed = [...ids].map((id) => byId.get(id)).filter((p): p is KbPassage => !!p && !opts.hidden(p))
  if (listed.length === 0) return []
  const own = (p: KbPassage) => opts.diabetesType !== undefined && p.diabetes_type === opts.diabetesType
  const rank = (p: KbPassage) => (p.source_label === 'care_team' ? 0 : own(p) ? 1 : 2)
  const core = listed.sort((a, b) => rank(a) - rank(b))

  const book = index
    .search(message, 60, { diabetesType: opts.diabetesType })
    .filter((h) => h.passage.source_label === 'book' && h.score >= (opts.bookMinScore ?? 2) && !opts.hidden(h.passage))
    .filter((h) => bookTopicOf(h.passage.id).some((t) => topics.includes(t)))
    .slice(0, opts.bookLimit ?? 4)
    .map((h) => h.passage)

  const always = ALWAYS.map((id) => byId.get(id)).filter((p): p is KbPassage => !!p && !opts.hidden(p) && !ids.has(p.id))
  return [...always, ...core, ...book]
}
