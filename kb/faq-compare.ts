// Compare the blind topic cards with the clinical care-team FAQ (ADR-0013, iteration 6:
// QST-KB-HOLDOUT-SCOPE: A, QST-KB-REDRAFT: A). The FAQ was held out of the knowledge
// base and of card drafting, so it is an independent, clinician-written reference.
//
//   node kb/faq-compare.ts [cards file]        default: kb/out/cards-blind.json
//
// For each FAQ question:
//   - coverage: which cards the assistant's own card search would shortlist for it
//     (src/lib/chat/cards.ts, same cutoffs), and whether any clears the shortlist floor;
//   - numbers: numbers in the FAQ answer that the best card lacks, and numbers in the
//     card that the FAQ doesn't use. A mismatch isn't automatically an error (the FAQ is
//     the clinic's own advice, the cards follow ADA), but every one goes to the sponsor.
// Then the reverse: cards no FAQ question reaches (topics the FAQ doesn't cover).
// Writes kb/out/faq-compare.md with each pair side by side. $0: no model calls; picking
// is the model's job at runtime, so coverage here is search-level only and a human
// reads the pairs. All text stays in git-ignored kb/out/.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildCardIndex, CARD_MIN_SCORE, type TopicCard } from '../src/lib/chat/cards.ts'
import type { KbPassage } from '../src/lib/chat/retrieve.ts'
import type { DraftCard } from './cards-check.ts'

const file = process.argv[2] ?? 'kb/out/cards-blind.json'
type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string | null; body: string; tags: string[] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags,
}))
const drafts = (JSON.parse(readFileSync(file, 'utf8')) as { cards: DraftCard[] }).cards
// Treated as approved here only to search them the way the assistant would.
const cards: TopicCard[] = drafts.map((d) => ({ id: d.id, topic: d.topic, asks: d.asks, body: d.answer, source_ids: d.sources, status: 'approved' }))
const index = buildCardIndex(cards, passages)

/** The FAQ export: "# Question" lines, each followed by its answer. */
const faq = readFileSync('kb/local-sources/FAQs.md', 'utf8')
  .split(/^# /m)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [q, ...rest] = s.split('\n')
    return { q: q.trim(), a: rest.join('\n').trim() }
  })

const nums = (t: string) => [...new Set((t.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))))]

const reached = new Set<string>()
let covered = 0
const md: string[] = [
  `# Blind cards vs. the clinical FAQ (${file})`,
  '',
  'The FAQ was held out of the knowledge base and card drafting (ADR-0013, iteration 6). For each FAQ question: the cards the assistant would shortlist, and number differences. A difference is not automatically an error; each one is for the sponsor to judge.',
  '',
]
for (const [i, f] of faq.entries()) {
  const hits = index.search(f.q, 3).filter((h) => h.score >= CARD_MIN_SCORE)
  const best = hits[0]
  if (best) covered++
  for (const h of hits) reached.add(h.card.id)
  const fn = nums(f.a)
  const cn = best ? nums(best.card.body) : []
  const faqOnly = fn.filter((n) => !cn.includes(n))
  const cardOnly = cn.filter((n) => !fn.includes(n))
  console.log(
    `${best ? 'card' : 'NONE'} ${String(i + 1).padStart(2)}. ${f.q.slice(0, 60).padEnd(60)} ` +
      `${best ? `${best.card.id} (${best.score.toFixed(1)})` : ''}${faqOnly.length ? `  FAQ-only numbers: ${faqOnly.join(',')}` : ''}${cardOnly.length ? `  card-only numbers: ${cardOnly.join(',')}` : ''}`,
  )
  md.push(
    `## ${i + 1}. ${f.q}`,
    '',
    `**Clinical FAQ**: ${f.a}`,
    '',
    best
      ? `**Best card** \`${best.card.id}\` (score ${best.score.toFixed(1)}; shortlist: ${hits.map((h) => h.card.id).join(', ')}): ${best.card.body}`
      : `**No card** clears the shortlist floor (${CARD_MIN_SCORE}); this question would take the raw-passage path.`,
    '',
    ...(faqOnly.length || cardOnly.length
      ? [`**Numbers**: FAQ only: ${faqOnly.join(', ') || 'none'} · card only: ${cardOnly.join(', ') || 'none'}`, '']
      : []),
    '**Sponsor**: agree / card wrong / card incomplete / FAQ question not a card topic (circle one, note why)',
    '',
  )
}
const unreached = cards.filter((c) => !reached.has(c.id))
md.push('## Cards no FAQ question reaches', '', ...unreached.map((c) => `- \`${c.id}\`: ${c.topic}`), '')
writeFileSync('kb/out/faq-compare.md', md.join('\n'))
console.log(`\n${covered} of ${faq.length} FAQ questions reach a card · ${unreached.length} of ${cards.length} cards reached by no FAQ question · wrote kb/out/faq-compare.md`)
