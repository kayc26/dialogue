// In-browser BM25 search over the knowledge-base passages (ADR-0005: RAG, not long
// context; 136 passages load once after sign-in). Everyday words are expanded to the
// clinical terms the passages use, because older users say "sugar" and "going low",
// not "glucose" and "hypoglycemia".

export interface KbPassage {
  id: string
  doc_title: string
  source_label: 'ADA' | 'care_team'
  section: string | null
  body: string
  tags: string[]
}

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
function lean(text: string): Direction {
  const t = text.toLowerCase()
  const lows = (t.match(/hypoglycemia|\blow blood (?:glucose|sugar)/g) ?? []).length
  const highs = (t.match(/hyperglycemia|\bhigh blood (?:glucose|sugar)/g) ?? []).length
  return lows > highs ? 'low' : highs > lows ? 'high' : null
}

/** A passage about the opposite problem keeps half its score: still findable, never first by accident. */
const OPPOSITE_DIRECTION = 0.5

export interface Index {
  search(query: string, k?: number): Hit[]
}

export function buildIndex(passages: KbPassage[], k1 = 1.2, b = 0.75): Index {
  const docs = passages.map((p) => tokenize(`${p.section ?? ''} ${p.section ?? ''} ${p.body}`))
  const leans = passages.map((p) => lean(`${p.section ?? ''} ${p.body}`))
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1)
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const tf = docs.map((d) => {
    const m = new Map<string, number>()
    for (const t of d) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const N = docs.length
  const idf = (t: string) => {
    const n = df.get(t) ?? 0
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  }
  return {
    search(query: string, k = 5): Hit[] {
      const dir = direction(query)
      const q = expand(query, tokenize(query), dir)
      const hits: Hit[] = []
      docs.forEach((d, i) => {
        let score = 0
        for (const [t, w] of q) {
          const f = tf[i].get(t) ?? 0
          if (f) score += w * idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)))
        }
        if (dir && leans[i] && leans[i] !== dir) score *= OPPOSITE_DIRECTION
        if (score > 0) hits.push({ passage: passages[i], score })
      })
      return hits.sort((a, b2) => b2.score - a.score).slice(0, k)
    },
  }
}
