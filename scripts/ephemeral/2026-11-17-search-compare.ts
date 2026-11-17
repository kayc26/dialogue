// 2026-11-17 — Why are kayc26/diabetes_chatbot's answers better? That bot sends whole
// hand-curated topic sections (picked by a model) to the answer model; ours sends the
// top 4 BM25 passages. This prints what OUR search hands the answer model for a
// question: the passages above MIN_SCORE (2.0), in the order turn.ts would use them,
// with source and length. No model calls.
// Run: node node_modules/jiti/lib/jiti-cli.mjs scripts/ephemeral/2026-11-17-search-compare.ts "question" ["question" …]
import { readFileSync } from 'node:fs'
import { buildIndex, type KbPassage } from '../../src/lib/chat/retrieve'

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string; body: string; tags: string[]; diabetesType?: KbPassage['diabetes_type'] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const index = buildIndex(passages)
for (const q of process.argv.slice(2)) {
  console.log(`\n${q}`)
  const hits = index.search(q, 8, { diabetesType: 'type2' }).filter((h) => h.score >= 2.0 && !h.passage.tags.includes('dose_related')).slice(0, 4)
  if (!hits.length) console.log('  (nothing above MIN_SCORE: "no information")')
  for (const h of hits) console.log(`  ${h.score.toFixed(1).padStart(5)}  ${h.passage.source_label.padEnd(9)} ${String(h.passage.body.length).padStart(5)} chars  ${h.passage.id}: ${h.passage.body.slice(0, 90).replace(/\s+/g, ' ')}…`)
}

// Outcome (2026-11-17): for "what can i eat after a hike" our search returns how to treat a
// low, time-in-range targets and the plate method; the ADA guide's exercise section
// (ada-t1-guide-048…054) never makes the top 4 ("hike" isn't in it, and the type 2
// ranking pushes the type 1 guide down). "Why is my blood sugar high?" returns
// complications, eating patterns, screening and sweeteners: none says why. The other bot
// routes both to whole sections (activity; high blood sugar). Recorded in ADR-0018.
