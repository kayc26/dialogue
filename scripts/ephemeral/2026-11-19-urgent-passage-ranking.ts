// Why does "my blood sugar is high, what do i do" show ada-t2-guide-022 word for word?
// Reproduces turn.ts urgentPassage(): search `${message} high blood sugar ketones`,
// take the first 'urgent'-tagged, non-book hit. Prints the top urgent candidates with
// scores, per diabetes type, using the real local build (kb/out/passages.json).
//
//   node --no-warnings scripts/ephemeral/2026-11-19-urgent-passage-ranking.ts
//
// Local only; prints ids, sections and scores, not passage text.

import { readFileSync } from 'node:fs'
import { buildIndex, type KbPassage } from '../../src/lib/chat/retrieve.ts'

const raw = JSON.parse(readFileSync(new URL('../../kb/out/passages.json', import.meta.url), 'utf8')) as {
  passages: Array<{ id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string | null; body: string; tags: string[]; diabetesType: KbPassage['diabetes_type'] }>
}
const passages: KbPassage[] = raw.passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const index = buildIndex(passages)

const messages = ['my blood sugar is high, what do i do', 'my blood sugar is 400, what do i do', 'my sugar is high, what should I do?']
for (const message of messages) {
  const q = `${message} high blood sugar ketones`
  for (const diabetesType of [undefined, 'type1', 'type2'] as const) {
    const hits = index.search(q, 12, { diabetesType }).filter((h) => h.passage.tags.includes('urgent') && h.passage.source_label !== 'book')
    console.log(`\n"${message}"  type=${diabetesType ?? '-'}`)
    for (const h of hits.slice(0, 4)) console.log(`  ${h.score.toFixed(2).padStart(6)}  ${h.passage.id.padEnd(18)} ${h.passage.source_label.padEnd(9)} ${(h.passage.section ?? '').slice(0, 60)}`)
  }
}

// --- Outcome (2026-11-19) ---
// Type 2 patients: ada-t2-guide-022 wins (15.67), a chunk that is half "preventing lows"
// and half "what is hyperglycemia": the definition Kay saw. Type 1 / no type:
// ada-t1-guide-027 ("Ketones and DKA", also explanatory). The care team's own
// team-faqs-008 ("What do I do when I have a high blood sugar") ranks 2nd-4th, never shown.
// Same for all three phrasings. Recorded in ADR-0021 (QST-URGENT-REPLY).
