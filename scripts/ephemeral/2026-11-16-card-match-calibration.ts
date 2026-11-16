// 2026-11-16-card-match-calibration.ts
// Context: ADR-0013, wiring approved topic cards into the turn (src/lib/chat/cards.ts).
// Two BM25 score cutoffs need numbers from the real cards, not guesses:
//   CARD_MIN_SCORE       below it, no card is shortlisted and no pick call is made;
//   CARD_FALLBACK_SCORE  when the pick call fails, the top card is shown only above it.
// Method, $0 (no model calls): treat the 30 hand-drafted cards in kb/out/cards-draft.json
// as approved, then
//   1. held-out asks: for each card and each of its "asks", rebuild the index with that
//      ask removed and search for it, so a card can't match its own wording;
//   2. off-topic questions, which should score below CARD_MIN_SCORE;
//   3. on-topic questions no card covers (from the raw corpus), which shouldn't pass
//      CARD_FALLBACK_SCORE with the wrong card.
// Word rarity comes from the cards plus the whole knowledge base (kb/out/passages.json),
// as in the app, so scores do not depend on how many cards are approved; section 4
// checks that.
// Prints scores and ranks only (card ids, no card text: ADA-derived, ADR-0005).
//
// Usage: node scripts/ephemeral/2026-11-16-card-match-calibration.ts
//
// Outcome (2026-11-16):
//   - First run (rarity from the cards alone) gave cutoffs 2.5 / 8, but the turn tests
//     then showed scores swing with how many cards are approved. Fixed in
//     buildIndex(background); section 4 now checks it: alone vs. among 30 = 0.97–1.11×.
//   - Second run (rarity from cards + the 439-passage knowledge base): right card first
//     46/79, top 3 60/79, top 5 65/79; right-card score min 2.2, p10 4.1, median 7.2;
//     off-topic max 2.6; highest wrong first place 12.8 (the "high" cards cluster).
//     Set CARD_MIN_SCORE = 2.5, CARD_FALLBACK_SCORE = 13, shortlist 3 (src/lib/chat/cards.ts).
//   - Measured on the 2026-11-14 drafts, which were written with the FAQ in view; to be
//     re-run on the blind redraft (ADR-0013, QST-KB-REDRAFT: A).

import { readFileSync } from 'node:fs'
import { buildCardIndex, type TopicCard } from '../../src/lib/chat/cards.ts'
import type { KbPassage } from '../../src/lib/chat/retrieve.ts'

type Draft = { id: string; topic: string; asks: string[]; answer: string; sources: string[] }
const drafts = (JSON.parse(readFileSync('kb/out/cards-draft.json', 'utf8')) as { cards: Draft[] }).cards
type Built = { id: string; docTitle: string; sourceLabel: KbPassage["source_label"]; section: string | null; body: string; tags: string[] }
const passages: KbPassage[] = (JSON.parse(readFileSync("kb/out/passages.json", "utf8")) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags,
}))
const asCard = (d: Draft, asks = d.asks): TopicCard => ({
  id: d.id, topic: d.topic, asks, body: d.answer, source_ids: d.sources, status: 'approved',
})

// 1. Held-out asks.
const own: number[] = []
const wrongTop: { q: string; want: string; got: string; score: number }[] = []
let rank1 = 0
let inTop3 = 0
let inTop5 = 0
let total = 0
for (const d of drafts) {
  for (const [i, q] of d.asks.entries()) {
    const index = buildCardIndex(drafts.map((x) => (x === d ? asCard(x, x.asks.filter((_, j) => j !== i)) : asCard(x))), passages)
    const hits = index.search(q, 5)
    const r = hits.findIndex((h) => h.card.id === d.id)
    total++
    if (r === 0) rank1++
    if (r >= 0 && r < 3) inTop3++
    if (r >= 0) inTop5++
    if (r >= 0) own.push(hits[r].score)
    if (hits[0] && hits[0].card.id !== d.id) wrongTop.push({ q, want: d.id, got: hits[0].card.id, score: hits[0].score })
  }
}
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]
console.log(`held-out asks: ${total}; own card ranked 1st: ${rank1}; in top 3: ${inTop3}; in top 5: ${inTop5}`)
console.log(`own-card score: min ${pct(own, 0).toFixed(1)}  p10 ${pct(own, 0.1).toFixed(1)}  median ${pct(own, 0.5).toFixed(1)}`)
console.log('wrong card ranked first:')
for (const w of wrongTop.sort((a, b) => b.score - a.score)) console.log(`  ${w.score.toFixed(1).padStart(5)}  "${w.q}"  want ${w.want}, got ${w.got}`)

// 2 and 3. Questions that should not land on a card, or not confidently.
const full = buildCardIndex(drafts.map((d) => asCard(d)), passages)
const probes: Record<string, string[]> = {
  'off-topic': [
    'How do I renew my passport?',
    'What time is it?',
    'Can you help me with my taxes?',
    'Who won the game last night?',
    'Thank you',
  ],
  'on-topic, likely no card': [
    'Can I drink alcohol?',
    'What is gestational diabetes?',
    'How do I store my insulin when travelling?',
    'Is diabetes genetic?',
    'Can I donate blood?',
    'What does A1C mean?',
  ],
  'suggestion chips': ['What fruit can I eat?', 'What should I do if my sugar is low?', 'Are sugar substitutes safe?', 'What is a healthy snack?'],
}
for (const [label, qs] of Object.entries(probes)) {
  console.log(`\n${label}:`)
  for (const q of qs) {
    const h = full.search(q, 3)
    console.log(`  ${(h[0]?.score ?? 0).toFixed(1).padStart(5)}  ${(h[0]?.card.id ?? '-').padEnd(24)} "${q}"`)
  }
}

// 4. Score stability: each card's score for its own first ask, alone vs. among all 30.
// The sponsor may approve cards in batches; a cutoff that only holds at 30 would
// silently stop cards matching while few are approved.
const ratios = drafts.map((d) => {
  const alone = buildCardIndex([asCard(d)], passages).search(d.asks[0], 1)[0]?.score ?? 0
  const among = full.search(d.asks[0], 30).find((h) => h.card.id === d.id)?.score ?? 0
  return among ? alone / among : 1
})
console.log(`\nscore alone / score among 30: min ${Math.min(...ratios).toFixed(2)}  max ${Math.max(...ratios).toFixed(2)}`)
