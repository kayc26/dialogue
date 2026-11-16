// Check topic-card drafts against the knowledge base before the sponsor reads them
// (ADR-0013: decision items 2, 5, 6; iteration 6).
//
//   node kb/cards-check.ts [cards file]        default: kb/out/cards-blind.json
//
// For each card (checks in kb/cards-lib.ts, shared with kb/cards-load.ts):
//   1. every source id exists in kb/out/passages.json;
//   2. the assistant's own answer guard passes (src/lib/chat/guard.ts): no dose advice,
//      and every number appears in a cited ADA passage. Citing the book doesn't make a
//      number count (QST-KB-BOOK-ROLE: A);
//   3. reading level: Flesch-Kincaid grade, aiming for 6th–8th (Kay, 2026-11-16);
//   4. cards citing dose-tagged passages are marked for closer reading
//      (QST-KB-DOSE-CARDS: B: the sponsor decides each one).
// Writes <cards file>.md beside it: each card with its sources, for the sponsor.
// $0: no model calls. Card and passage text is ADA- and book-derived, so all of it
// stays in git-ignored kb/out/ (ADR-0005). Exit code 1 if any card fails 1 or 2.

import { writeFileSync } from 'node:fs'
import { checkCard, readCards, readPassages } from './cards-lib.ts'

export type { DraftCard } from './cards-lib.ts'

const file = process.argv[2] ?? 'kb/out/cards-blind.json'
const byId = readPassages()
const draft = readCards(file)

const SOURCE = { ADA: 'American Diabetes Association', care_team: 'Your care team', book: 'Bright Spots & Landmines (diaTribe)' } as const
const seen = new Set<string>()
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
  const { problems, cited, doseTagged, grade, words } = checkCard(c, byId, seen)
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
