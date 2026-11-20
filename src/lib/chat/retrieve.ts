// In-browser BM25 search over the knowledge-base passages (ADR-0005: RAG, not long
// context; the passages, 472 in production on 2026-11-17, load once after sign-in).
// Since ADR-0018 this is the fallback: answers first read curated topic sections
// (topics.ts), and search runs when the classifier picks no topic. Everyday words are expanded to the
// clinical terms the passages use, because older users say "sugar" and "going low",
// not "glucose" and "hypoglycemia".

export interface KbPassage {
  id: string
  doc_title: string
  source_label: 'ADA' | 'care_team' | 'book' // ADR-0013: 'book' is never the authority on numbers
  section: string | null
  body: string
  tags: string[]
  /** Which diabetes type the passage's document is written for (migration 0003); absent
   *  until the database has the column, and then search simply doesn't use it. */
  diabetes_type?: 'type1' | 'type2' | 'any' | null
}

export type DiabetesType = 'type1' | 'type2'

export interface Hit {
  passage: KbPassage
  score: number
}

const STOP = new Set(
  'a an and are as at be but by can could did do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to too was we were what when where which who why will with would you your am im ive dont should'.split(' '),
)

const SYNONYMS: Record<string, string[]> = {
  sugar: ['glucose'],
  sugars: ['glucose'],
  low: ['hypoglycemia'],
  lows: ['hypoglycemia'],
  hypo: ['hypoglycemia'],
  high: ['hyperglycemia'],
  carbs: ['carbohydrate'],
  carb: ['carbohydrate'],
  sweetener: ['substitute'],
  sweeteners: ['substitute'],
  exercise: ['activity'],
  walking: ['activity'],
  ketone: ['ketones'],
  drinks: ['beverages'],
  drink: ['beverage'],
  shot: ['insulin'],
  shots: ['insulin'],
  snack: ['snacks'],
  hungry: ['hunger'],
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

/** Query terms with weights: the person's own words count fully; clinical synonyms
 *  count half, so a passage that repeats "glucose" can't outrank the FAQ that uses
 *  the person's own words ("why is my blood sugar high"). */
function expand(query: string, tokens: string[], dir: Direction): Map<string, number> {
  const q = new Map<string, number>()
  for (const t of tokens) q.set(t, 1)
  const add = (s: string) => {
    for (const t of tokenize(s)) if (!q.has(t)) q.set(t, 0.5)
  }
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) add(s)
  // the direction's clinical name is the concept itself, so it counts fully
  if (dir === 'high') for (const t of ['high', 'hyperglycemia']) q.set(t, 1)
  if (dir === 'low') for (const t of ['low', 'hypoglycemia']) q.set(t, 1)
  // "my sugar" / "blood sugar" means glucose, not table sugar: otherwise the
  // sugar-substitutes leaflet, which says "sugar" on every line, outranks the answer.
  if (GLUCOSE_SENSE.test(query.toLowerCase())) q.set('glucose', 1)
  return q
}
const GLUCOSE_SENSE =
  /\b(?:blood|my|your|his|her|their) sugars?\b|\bsugars? (?:is|was|are|were|level|levels|reading|readings|number|numbers|high|low|go|goes|went|drop|drops|dropped|spike|spikes|keeps|stays|runs)\b/

/** Which way a question about glucose points: bringing a high down, or a low up.
 *  "lower my blood sugar" shares the words "blood sugar" with every passage about
 *  treating a LOW, so the direction has to be read from the verb, not the nouns. */
export type Direction = 'high' | 'low' | null
const DOWN_VERB = /\b(?:lower|lowering|reduce|reducing|decrease|decreasing|drop|(?:bring|get)(?:ing|ting)?(?:\s+\w+){0,3}\s+down)\b/
const UP_VERB = /\b(?:raise|raising|(?:bring|get)(?:ing|ting)?(?:\s+\w+){0,3}\s+up)\b/
const GLUCOSE_WORD = /\b(?:sugars?|glucose|readings?|numbers?|a1c)\b/

export function direction(text: string): Direction {
  const t = text.toLowerCase()
  const glucose = GLUCOSE_WORD.test(t)
  const high = /\b(?:high|highs|hyperglycemia)\b/.test(t) || (glucose && DOWN_VERB.test(t))
  const low = /\b(?:low|lows|hypo|hypoglycemia)\b/.test(t) || (glucose && UP_VERB.test(t))
  return high === low ? null : high ? 'high' : 'low'
}

/** Which way a passage leans, by how often it names lows versus highs. */
export function lean(text: string): Direction {
  const t = text.toLowerCase()
  const lows = (t.match(/hypoglycemia|\blow blood (?:glucose|sugar)/g) ?? []).length
  const highs = (t.match(/hyperglycemia|\bhigh blood (?:glucose|sugar)/g) ?? []).length
  return lows > highs ? 'low' : highs > lows ? 'high' : null
}

/** A passage about the opposite problem keeps half its score: still findable, never first by accident. */
const OPPOSITE_DIRECTION = 0.5

/** A passage written for the patient's own diabetes type scores 1/0.7 (about 1.43×)
 *  (ADR-0013, QST-KB-RAG-FIXES: B): a type 2 patient gets the type 2 guide ahead of
 *  the type 1 guide, but the type 1 guide still answers what only it covers (ketones
 *  and DKA, mostly). It boosts the patient's own type rather than demoting the other:
 *  the two ADA guides end up in the same order either way, but demoting the type 1
 *  guide handed its first places to the book (top passage from the book rose 59 → 80
 *  of 133 questions for a type 2 patient), while boosting the patient's own guide
 *  keeps ADA ahead (scripts/ephemeral/2026-11-16-diabetes-type-ranking.ts). */
export const OTHER_TYPE = 0.7
const OWN_TYPE = 1 / OTHER_TYPE

/** Source priority in search (Kay, 2026-11-16: "faq -> ada -> book"). Only the book is
 *  weighted down, so ADA wins a near-equal match with it. The FAQ is not boosted: its
 *  13 short nutrition answers share everyday words ("sugar", "juice") with many
 *  questions, and a boost of even 1.25 ranked them first for questions they don't
 *  answer ("How much juice should I drink if I'm going low?" → the beverages answer).
 *  FAQ-first is applied among relevant passages instead (turn.ts, byPriority).
 *  scripts/ephemeral/2026-11-16-source-priority-weights.ts: book top passages 30 → 14
 *  of 120 questions, ADA 88 → 103, FAQ pulled up off-topic 1. */
export const SOURCE_WEIGHT: Record<KbPassage['source_label'], number> = { care_team: 1, ADA: 1, book: 0.8 }

export interface SearchOptions {
  /** The patient's diabetes type; passages for the other type rank lower, never vanish. */
  diabetesType?: DiabetesType
}

export interface Index {
  search(query: string, k?: number, opts?: SearchOptions): Hit[]
}

/**
 * BM25 over `passages`. `background` texts are never returned; they only count toward
 * word rarity (IDF) and average length, so scores don't swing with how many passages
 * are searchable. The card index needs this: with 2 approved cards instead of 30, a
 * good match scored under the shortlist floor and cards silently stopped matching.
 */
export function buildIndex(passages: KbPassage[], k1 = 1.2, b = 0.75, background: string[] = []): Index {
  const docOf = (p: KbPassage) => tokenize(`${p.section ?? ''} ${p.section ?? ''} ${p.body}`)
  const docs = passages.map(docOf)
  const bg = background.map(tokenize)
  const leans = passages.map((p) => lean(`${p.section ?? ''} ${p.body}`))
  const all = [...docs, ...bg]
  const avgLen = all.reduce((n, d) => n + d.length, 0) / Math.max(all.length, 1)
  const df = new Map<string, number>()
  for (const d of all) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const tf = docs.map((d) => {
    const m = new Map<string, number>()
    for (const t of d) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const N = all.length
  const idf = (t: string) => {
    const n = df.get(t) ?? 0
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  }
  return {
    search(query: string, k = 5, opts: SearchOptions = {}): Hit[] {
      const dir = direction(query)
      const own = (p: KbPassage) => opts.diabetesType !== undefined && p.diabetes_type === opts.diabetesType
      const q = expand(query, tokenize(query), dir)
      const hits: Hit[] = []
      docs.forEach((d, i) => {
        let score = 0
        for (const [t, w] of q) {
          const f = tf[i].get(t) ?? 0
          if (f) score += w * idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)))
        }
        if (dir && leans[i] && leans[i] !== dir) score *= OPPOSITE_DIRECTION
        if (own(passages[i])) score *= OWN_TYPE
        score *= SOURCE_WEIGHT[passages[i].source_label] ?? 1
        if (score > 0) hits.push({ passage: passages[i], score })
      })
      return hits.sort((a, b2) => b2.score - a.score).slice(0, k)
    },
  }
}
