// 2026-11-14-cards-check.ts
// Context: ADR-0013 (QST-KB-SHAPE: C, QST-KB-REVIEW: A). Kay asked to see the topic
// cards and their proposed answers before any pipeline is built. Nibble drafted them by
// hand in kb/out/cards-draft.json (gitignored: ADA-derived text). This script:
//   1. runs every card through the assistant's own answer guard (src/lib/chat/guard.ts):
//      no dose advice, citations only to its listed sources, and every number in the
//      card must appear in those sources;
//   2. checks that every source id exists, and flags dose-tagged sources;
//   3. writes kb/out/cards-draft.md: each card beside its source passages, for Kay and
//      the clinical sponsor to review.
// $0: no model calls. Prints card ids and pass/fail only.
//
// Usage: node scripts/ephemeral/2026-11-14-cards-check.ts
//
// Outcome (2026-11-14): all 30 hand-drafted cards passed: no dose advice, and every
// number appears in its sources. 15 cards draw on dose-tagged sources (only their
// non-dose sentences) and say so in their review notes. The review doc gives Kay and
// the sponsor one card per section, with its sources in a collapsible block.

import { readFileSync, writeFileSync } from 'node:fs'
import { checkAnswer } from '../../src/lib/chat/guard.ts'

type Passage = { id: string; docTitle: string; section: string | null; body: string; tags: string[] }
type Card = { id: string; topic: string; asks: string[]; answer: string; sources: string[]; review_notes: string[] }

const passages = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Passage[] }).passages
const byId = new Map(passages.map((p) => [p.id, p]))
const draft = JSON.parse(readFileSync('kb/out/cards-draft.json', 'utf8')) as { status: string; cards: Card[] }

let failed = 0
const md: string[] = [
  '# Topic cards: DRAFT for clinical review',
  '',
  `> ${draft.status}`,
  '',
  'Each card shows the proposed answer, the questions it is meant for, and the approved passages it was written from.',
  'Checked automatically: no dose advice, and every number in the answer appears in its sources.',
  'To review, mark each card **Approve**, **Edit** (write the change), or **Drop**.',
  '',
  '## Topics',
  '',
  ...draft.cards.map((c, i) => `${i + 1}. [${c.topic}](#${c.id})`),
  '',
]

for (const [i, c] of draft.cards.entries()) {
  const missing = c.sources.filter((s) => !byId.has(s))
  const shown = c.sources.filter((s) => byId.has(s)).map((s) => ({ id: s, body: byId.get(s)!.body }))
  const verdict = checkAnswer(`${c.answer} ${c.sources.map((s) => `[kb:${s}]`).join(' ')}`, shown, '')
  const doseTagged = c.sources.filter((s) => byId.get(s)?.tags.includes('dose_related'))
  const words = c.answer.split(/\s+/).length
  const ok = verdict.ok && missing.length === 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(22)} ${String(words).padStart(3)} words${verdict.ok ? '' : `  guard: ${verdict.reason}`}${missing.length ? `  missing: ${missing.join(',')}` : ''}${doseTagged.length ? `  dose-tagged sources: ${doseTagged.length}` : ''}`)

  md.push(
    `---`,
    '',
    `<a id="${c.id}"></a>`,
    `## ${i + 1}. ${c.topic}`,
    '',
    `**For questions like:** ${c.asks.map((a) => `“${a}”`).join(' · ')}`,
    '',
    '**Proposed answer:**',
    '',
    `> ${c.answer}`,
    '',
    `*${words} words · automatic checks: ${ok ? 'passed' : `FAILED (${verdict.ok ? 'missing source' : verdict.reason})`}*`,
    '',
  )
  if (c.review_notes.length) md.push('**Questions for the reviewer:**', '', ...c.review_notes.map((n) => `- ${n}`), '')
  md.push('**Review:** ☐ Approve ☐ Edit ☐ Drop', '', '<details><summary>Source passages (' + c.sources.length + ')</summary>', '')
  for (const s of c.sources) {
    const p = byId.get(s)
    if (!p) continue
    md.push(`**${s}**${p.tags.includes('dose_related') ? ' *(dose-tagged)*' : ''}: ${p.docTitle}${p.section ? ` · ${p.section}` : ''}`, '', '```', p.body.trim(), '```', '')
  }
  md.push('</details>', '')
}

writeFileSync('kb/out/cards-draft.md', md.join('\n'))
console.log(`\n${draft.cards.length} cards, ${failed} failed. Wrote kb/out/cards-draft.md`)
process.exit(failed ? 1 : 0)
