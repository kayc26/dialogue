// 2026-11-17 — Why did "I'm hungrym" get the no-information reply on the live site?
// Production log: triage none, classifier only, no answer model → retrieval found no
// passage at or above MIN_SCORE (2.0, turn.ts). This prints the top hits for the typo
// and for nearby phrasings against the local build of the knowledge base
// (kb/out/passages.json, same content as production's kb_chunks). No model calls.
// Run: npx tsx scripts/ephemeral/2026-11-17-search-hungry.ts
import { readFileSync } from 'node:fs'
import { buildIndex, type KbPassage } from '../../src/lib/chat/retrieve'

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string; body: string; tags: string[]; diabetesType?: KbPassage['diabetes_type'] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const index = buildIndex(passages)
for (const q of ["I'm hungrym", "I'm hungry", 'I am hungry, what can I eat?', 'what snack can I have', 'hmmm']) {
  const hits = index.search(q, 3)
  console.log(`\n${q}`)
  if (!hits.length) console.log('  (no hits)')
  for (const h of hits) console.log(`  ${h.score.toFixed(2)}  ${h.passage.source_label.padEnd(9)} ${h.passage.section.slice(0, 70)}`)
}

// Outcome (2026-11-17): the typo is the whole cause. "hungrym" matches no word in the
// knowledge base (no hits); "I'm hungry" scores 9.24 on the care-team FAQ "I am still
// hungry between meals" (MIN_SCORE 2.0), so it would have been answered. "hmmm" has no
// hits either. Search is exact-word BM25 with synonym expansion, no typo tolerance;
// filed as a KANBAN backlog card (ADR-0016 iteration 4).
