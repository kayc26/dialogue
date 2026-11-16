// 2026-11-16-diabetes-type-ranking.ts
// Context: ADR-0013, QST-KB-RAG-FIXES: B (Kay): passages for the patient's other diabetes
// type rank lower (OTHER_TYPE in src/lib/chat/retrieve.ts). How much does that move the
// real top results? $0, no model calls. Questions: the 13 held-out FAQ questions (their
// text only) plus the blind cards' "asks" (patient-style phrasings). For each, the top 4
// passages with no patient type vs. a type 2 and a type 1 patient. Prints counts only.
//
// Usage: node scripts/ephemeral/2026-11-16-diabetes-type-ranking.ts
//
// Outcome (2026-11-16), type 2 patient, 133 questions:
//   - demoting the other type (×0.7): top passage from the type 1 guide 53 → 9, but
//     from the book 59 → 80. The type 1 guide's first places went to the book, feeding
//     the book-only answers seen in the baseline FAQ run.
//   - boosting the own type (×1/0.7) instead, as shipped: type 1 guide 53 → 24, book
//     59 → 40, type 2 guide 21 → 69. Type 1 patient: type 2 guide 21 → 6, book 59 → 24.
//   Same order between the two ADA guides either way; boosting also keeps ADA ahead of
//   the book.

import { readFileSync } from 'node:fs'
import { buildIndex, OTHER_TYPE, type KbPassage } from '../../src/lib/chat/retrieve.ts'

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string | null; body: string; tags: string[]; diabetesType: KbPassage['diabetes_type'] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags, diabetes_type: p.diabetesType,
}))
const faqQs = readFileSync('kb/local-sources/FAQs.md', 'utf8').split('\n').filter((l) => l.startsWith('# ')).map((l) => l.slice(2))
const asks = (JSON.parse(readFileSync('kb/out/cards-blind.json', 'utf8')) as { cards: { asks: string[] }[] }).cards.flatMap((c) => c.asks)
const questions = [...faqQs, ...asks]
const index = buildIndex(passages)

const typeOf = new Map(passages.map((p) => [p.id, p.diabetes_type]))
for (const patient of ['type2', 'type1'] as const) {
  const other = patient === 'type2' ? 'type1' : 'type2'
  let topWasOther = 0
  let topNowOther = 0
  let topChanged = 0
  let otherInTop4Before = 0
  let otherInTop4After = 0
  let bookTopBefore = 0
  let bookTopAfter = 0
  for (const q of questions) {
    const before = index.search(q, 4).map((h) => h.passage.id)
    const after = index.search(q, 4, { diabetesType: patient }).map((h) => h.passage.id)
    if (before[0] && typeOf.get(before[0]) === other) topWasOther++
    if (after[0] && typeOf.get(after[0]) === other) topNowOther++
    if (before[0] !== after[0]) topChanged++
    otherInTop4Before += before.filter((id) => typeOf.get(id) === other).length
    otherInTop4After += after.filter((id) => typeOf.get(id) === other).length
    if (before[0] && typeOf.get(before[0]) === 'any') bookTopBefore++
    if (after[0] && typeOf.get(after[0]) === 'any') bookTopAfter++
  }
  console.log(
    `${patient} patient, ${questions.length} questions, OTHER_TYPE=${OTHER_TYPE}: top passage from the ${other} guide ${topWasOther} → ${topNowOther}; ` +
      `top passage changed ${topChanged}; ${other} passages in the top 4: ${otherInTop4Before} → ${otherInTop4After}; ` +
      `top passage from the book: ${bookTopBefore} → ${bookTopAfter}`,
  )
}
