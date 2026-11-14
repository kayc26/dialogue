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

function expand(tokens: string[]): string[] {
  const out = [...tokens]
  for (const t of tokens) for (const s of SYNONYMS[t] ?? []) out.push(...tokenize(s))
  return out
}

export interface Index {
  search(query: string, k?: number): Hit[]
}

export function buildIndex(passages: KbPassage[], k1 = 1.2, b = 0.75): Index {
  const docs = passages.map((p) => tokenize(`${p.section ?? ''} ${p.section ?? ''} ${p.body}`))
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
      const q = [...new Set(expand(tokenize(query)))]
      const hits: Hit[] = []
      docs.forEach((d, i) => {
        let score = 0
        for (const t of q) {
          const f = tf[i].get(t) ?? 0
          if (f) score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)))
        }
        if (score > 0) hits.push({ passage: passages[i], score })
      })
      return hits.sort((a, b2) => b2.score - a.score).slice(0, k)
    },
  }
}
