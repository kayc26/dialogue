// 2026-11-16-source-priority-weights.ts
// Context: ADR-0013 iteration 21. Kay: "for now let's add the clinician faq's to the data
// we can retrieve from as well, and the priority is faq -> ada -> book". In search,
// priority becomes a weight per source: on an equal match the FAQ ranks first, then
// ADA, then the book, while a clearly better match from a lower source can still win.
// This compares candidate weights. $0, no model calls.
//
// Questions: the 120 patient-style phrasings from the blind cards' "asks" (not the FAQ's
// own questions, which would trivially find themselves), searched as a type 2 patient.
// For each weighting: which source supplies the top passage, and how often the FAQ is
// first when its best passage scored below the best ADA or book passage unweighted (a
// "pulled up" FAQ answer that may be off-topic).
//
// Usage: node scripts/ephemeral/2026-11-16-source-priority-weights.ts

import { readFileSync } from 'node:fs'
import { buildIndex, type KbPassage } from '../../src/lib/chat/retrieve.ts'

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string | null; body: string; tags: string[]; diabetesType: KbPassage['diabetes_type'] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const asks = (JSON.parse(readFileSync('kb/out/cards-blind.json', 'utf8')) as { cards: { asks: string[] }[] }).cards.flatMap((c) => c.asks)
const index = buildIndex(passages)

const candidates: Record<string, Record<KbPassage['source_label'], number>> = {
  'none (1 / 1 / 1)': { care_team: 1, ADA: 1, book: 1 },
  'book only lowered (1 / 1 / 0.8)': { care_team: 1, ADA: 1, book: 0.8 },
  '1.25 / 1 / 0.8': { care_team: 1.25, ADA: 1, book: 0.8 },
  '1.5 / 1 / 0.75': { care_team: 1.5, ADA: 1, book: 0.75 },
  '2 / 1 / 0.5': { care_team: 2, ADA: 1, book: 0.5 },
}
for (const [name, w] of Object.entries(candidates)) {
  const top = { care_team: 0, ADA: 0, book: 0 }
  let faqPulledUp = 0
  const pulled: string[] = []
  for (const q of asks) {
    const hits = index.search(q, 1000, { diabetesType: 'type2' })
    if (!hits.length) continue
    const raw = hits[0]
    const weighted = hits.map((h) => ({ ...h, score: h.score * w[h.passage.source_label] })).sort((a, b) => b.score - a.score)
    const first = weighted[0].passage
    top[first.source_label]++
    if (first.source_label === 'care_team' && raw.passage.source_label !== 'care_team') {
      faqPulledUp++
      if (pulled.length < 6) pulled.push(`"${q}" → ${first.id} (was ${raw.passage.id})`)
    }
  }
  console.log(`\n${name}: top passage from FAQ ${top.care_team}, ADA ${top.ADA}, book ${top.book}; FAQ pulled up over a better unweighted match: ${faqPulledUp}`)
  for (const p of pulled) console.log(`   ${p}`)
}
