// 2026-11-17 — Check the curated topic map (src/lib/chat/topics.ts, ADR-0018) against the
// real knowledge base: every listed id exists, which loaded passages no topic covers,
// and how much text each topic sends the answer model (before the 4 book passages),
// which drives the cost per answer. No model calls.
// Run: node node_modules/jiti/lib/jiti-cli.mjs scripts/ephemeral/2026-11-17-topic-map-check.ts
import { readFileSync } from 'node:fs'
import { buildIndex, type KbPassage } from '../../src/lib/chat/retrieve'
import { sectionPassages, TOPIC_NAMES } from '../../src/lib/chat/topics'

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string; body: string; tags: string[]; diabetesType?: KbPassage['diabetes_type'] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const index = buildIndex(passages)
const src = readFileSync('src/lib/chat/topics.ts', 'utf8')
const ids = new Set(passages.map((p) => p.id))
const hidden = (p: KbPassage) => p.tags.includes('dose_related')

const covered = new Set<string>()
for (const t of TOPIC_NAMES) {
  // An empty message: sections only, no book passages.
  const got = sectionPassages([t], '', passages, index, { hidden, diabetesType: 'type2' })
  for (const p of got) covered.add(p.id)
  const chars = got.reduce((n, p) => n + p.body.length, 0)
  console.log(`${t.padEnd(18)} ${String(got.length).padStart(3)} passages  ${String(chars).padStart(6)} chars  ~${Math.round(chars / 4)} tokens`)
}
const listedIds = [...src.matchAll(/'((?:ada|team)-[a-z0-9-]+-\d{3})'/g)].map((m) => m[1])
const missing = listedIds.filter((id) => !ids.has(id))
console.log(`\nids named literally in topics.ts but not in the knowledge base: ${missing.join(', ') || 'none'}`)
const uncovered = passages.filter((p) => p.source_label !== 'book' && !covered.has(p.id) && !hidden(p)).map((p) => p.id)
console.log(`FAQ/ADA passages (not dose-tagged) in no topic: ${uncovered.join(' ') || 'none'}`)

// Outcome (2026-11-17): every literally named id exists; per-topic sections range from
// ~1,700 chars (high_blood_sugar: most high/ketone passages are dose-tagged and hidden)
// to ~19,000 (food). Uncovered FAQ/ADA passages are the intended exclusions (covers,
// contents pages, addresses, the infographic footer, the specialists list).
