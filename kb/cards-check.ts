// Check topic-card drafts against the knowledge base before the sponsor reads them
// (ADR-0013: decision items 2, 5, 6; iteration 6).
//
//   node kb/cards-check.ts [cards file]        default: kb/out/cards-blind.json
//
// For each card:
//   1. every source id exists in kb/out/passages.json;
//   2. the assistant's own answer guard passes (src/lib/chat/guard.ts): no dose advice,
//      and every number appears in a cited ADA passage. Citing the book doesn't make a
//      number count (QST-KB-BOOK-ROLE: A), and at least one source must be ADA when the
//      card has any number;
//   3. reading level: Flesch-Kincaid grade, aiming for 6th–8th (Kay, 2026-11-16);
//   4. cards citing dose-tagged passages are marked for closer reading
//      (QST-KB-DOSE-CARDS: B: the sponsor decides each one).
// Writes <cards file>.md beside it: each card with its sources, for the sponsor.
// $0: no model calls. Card and passage text is ADA- and book-derived, so all of it
// stays in git-ignored kb/out/ (ADR-0005). Exit code 1 if any card fails 1 or 2.

import { readFileSync, writeFileSync } from 'node:fs'
import { checkAnswer } from '../src/lib/chat/guard.ts'

interface Passage { id: string; docTitle: string; sourceLabel: 'ADA' | 'care_team' | 'book'; section: string | null; body: string; tags: string[] }
export interface DraftCard { id: string; topic: string; asks: string[]; answer: string; sources: string[]; review_notes?: string[] }

const file = process.argv[2] ?? 'kb/out/cards-blind.json'
const passages = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Passage[] }).passages
const byId = new Map(passages.map((p) => [p.id, p]))
const draft = JSON.parse(readFileSync(file, 'utf8')) as { status?: string; cards: DraftCard[] }

/** Syllables by vowel groups, with a silent final e; close enough for a grade level. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups?.length ?? 1)
}
export function gradeLevel(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length)
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return 0.39 * (words.length / sentences) + 11.8 * (syl / Math.max(1, words.length)) - 15.59
}

const SOURCE = { ADA: 'American Diabetes Association', care_team: 'Your care team', book: 'Bright Spots & Landmines (diaTribe)' } as const
const ids = new Set<string>()
let failed = 0
const md: string[] = [
  `# Topic cards for clinical review (${file})`,
  '',
  draft.status ? `> ${draft.status}` : '',
  '',
  'Checked automatically: sources exist; no dose advice; every number appears in a cited ADA passage (the book is never the authority on numbers); reading level.',
  'Cards marked **dose-tagged sources** cite passages that mention insulin or doses: read those closely (ADR-0013, QST-KB-DOSE-CARDS: B).',
  'To review, mark each card **Approve**, **Edit** (write the change), or **Drop**.',
  '',
  '## Topics',
  '',
  ...draft.cards.map((c, i) => `${i + 1}. [${c.topic}](#${c.id})`),
  '',
]

for (const [i, c] of draft.cards.entries()) {
  const problems: string[] = []
  if (!/^card-[a-z0-9-]+$/.test(c.id)) problems.push('bad id')
  if (ids.has(c.id)) problems.push('duplicate id')
  ids.add(c.id)
  const missing = c.sources.filter((s) => !byId.has(s))
  if (missing.length) problems.push(`missing sources: ${missing.join(',')}`)
  if (c.sources.length === 0) problems.push('no sources')
  const cited = c.sources.filter((s) => byId.has(s)).map((s) => byId.get(s)!)
  const verdict = checkAnswer(
    `${c.answer} ${c.sources.map((s) => `[kb:${s}]`).join(' ')}`,
    cited.map((p) => ({ id: p.id, body: p.body, source_label: p.sourceLabel })),
    '',
  )
  if (!verdict.ok) problems.push(`guard: ${verdict.reason}`)
  const doseTagged = cited.filter((p) => p.tags.includes('dose_related')).map((p) => p.id)
  const words = c.answer.split(/\s+/).filter(Boolean).length
  const grade = gradeLevel(c.answer)
  const ok = problems.length === 0
  if (!ok) failed++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(26)} ${String(words).padStart(3)} words  grade ${grade.toFixed(1).padStart(4)}` +
      `${grade > 8 ? ' (above 8)' : ''}${doseTagged.length ? `  dose-tagged sources: ${doseTagged.length}` : ''}${problems.length ? `  ${problems.join('; ')}` : ''}`,
  )

  const credit = [...new Set(cited.map((p) => SOURCE[p.sourceLabel]))].map((s) => `📄 ${s}`).join('  ')
  md.push(
    `## ${i + 1}. ${c.topic}`,
    `<a id="${c.id}"></a>`,
    '',
    `**Meant for questions like**: ${c.asks.map((a) => `“${a}”`).join(' · ')}`,
    '',
    `> ${c.answer}`,
    '',
    `*Shown with*: ${credit} · *Reading grade*: ${grade.toFixed(1)} · *Words*: ${words}${doseTagged.length ? ' · **dose-tagged sources**' : ''}${ok ? '' : ` · **CHECK FAILED**: ${problems.join('; ')}`}`,
    '',
    ...(c.review_notes?.length ? [`*Drafting notes*: ${c.review_notes.join(' ')}`, ''] : []),
    '<details><summary>Source passages</summary>',
    '',
    ...cited.map((p) => `**${p.id}** (${SOURCE[p.sourceLabel]}, ${p.docTitle}; ${p.section ?? 'no section'}${p.tags.length ? `; tags: ${p.tags.join(', ')}` : ''})\n\n${p.body}\n`),
    '</details>',
    '',
  )
}

const out = file.replace(/\.json$/, '.md')
writeFileSync(out, md.join('\n'))
console.log(`\n${draft.cards.length - failed} of ${draft.cards.length} cards pass · wrote ${out}`)
process.exit(failed ? 1 : 0)
