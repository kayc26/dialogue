// 2026-11-14-search-probe.ts
// Context: Kay asked "how to lower my blood sugar after a meal" and was shown a
// low-blood-sugar (hypoglycemia) passage. This prints the BM25 ranking the chat uses
// for a few queries, over the local KB build (kb/out/passages.json, gitignored ADA
// text — only ids, titles, sections and scores are printed, never passage bodies).
// $0: no model calls.
//
// Usage: node scripts/ephemeral/2026-11-14-search-probe.ts ["query" ...]
//
// Outcome (2026-11-14):
// - Before the fix, "how to lower my blood sugar after a meal" ranked ada-t2-guide-021
//   (the Rule of 15 for lows, under a stale "After eating" heading, TD-5) first.
// - The production log showed every answer blocked as no_citation, so that passage
//   was shown verbatim.
// - After the fix in retrieve.ts (direction from the verb, opposite-direction passages
//   at half score), "lower" questions rank high-glucose passages first, and lows still
//   find the low passages.

import { readFileSync } from 'node:fs'
import { buildIndex, tokenize, type KbPassage } from '../../src/lib/chat/retrieve.ts'

const raw = JSON.parse(readFileSync("kb/out/passages.json", "utf8")) as { passages: { id: string; docTitle: string; sourceLabel: KbPassage["source_label"]; section: string | null; body: string; tags: string[] }[] }
const passages: KbPassage[] = raw.passages.map((p) => ({ id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags }))
const index = buildIndex(passages)
const queries = process.argv.slice(2)
if (!queries.length)
  queries.push(
    'how to lower my blood sugar after a meal',
    'how to lower my blood sugar',
    'why is my blood sugar high',
    'What fruit can I eat?',
    'what do I do if my sugar is low',
  )
for (const q of queries) {
  console.log(`\n${q}\n  tokens: ${tokenize(q).join(' ')}`)
  for (const h of index.search(q, 6))
    console.log(`  ${h.score.toFixed(2).padStart(6)}  ${h.passage.id.padEnd(20)} [${h.passage.tags.join(',')}] ${h.passage.doc_title} · ${h.passage.section ?? ''}`)
}
