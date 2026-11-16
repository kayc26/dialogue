// Can the assistant answer the care-team FAQ well without the FAQ? (ADR-0013,
// iteration 10; QST-KB-FAQ-EVAL.) The FAQ is held out of the knowledge base, so its
// 13 questions are an independent test and its answers are the clinical reference.
//
//   npm run kb:eval-faq -- [cards file] [--cards] [--type=type1|type2] [--hide-dose] [--yes]
//   (reads OPENROUTER_API_KEY from git-ignored .env.local, like the other kb: scripts;
//    jiti runs the app's own TypeScript modules unchanged; default cards file:
//    kb/out/cards-blind.json)
//
// Each FAQ question goes through the real turn (src/lib/chat/turn.ts) with the real
// models (src/lib/chat/models.ts): triage, the card step (the blind cards are treated
// as approved for this test only; nothing is loaded anywhere), then the AI-written
// answer from the ADA guides and the book, then the guard. What the patient would see
// is written beside the FAQ answer in kb/out/eval-faq.md, with separate blanks for
// the four checks Kay listed: numbers right, citations right, declined when it should,
// agrees with the FAQ.
//
// Costs real OpenRouter credit (ADR-0012, $15 total): dry run unless --yes, and it
// stops if the run passes MAX_DOLLARS. Prints the key's presence, never the key.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildCardIndex, type TopicCard } from '../src/lib/chat/cards'
import { openRouterModels, type CostMeter } from '../src/lib/chat/models'
import { buildIndex, type DiabetesType, type KbPassage } from '../src/lib/chat/retrieve'
import { CARDS_PAUSED } from '../src/lib/chat/prompts'
import { runTurn, type Card } from '../src/lib/chat/turn'
import type { DraftCard } from './cards-lib'

const MAX_DOLLARS = 0.25
const args = process.argv.slice(2)
// Cards follow the app's switch (CARDS_PAUSED, the RAG-only trial) unless --cards is given.
const useCards = args.includes('--cards') || !CARDS_PAUSED
// --type=type1|type2: answer as a patient with that diabetes type (QST-KB-RAG-FIXES: B).
const diabetesType = args.find((a) => a.startsWith('--type='))?.slice(7) as DiabetesType | undefined
// Kay, 2026-11-16: in test runs the model may read dose-tagged passages (rule 1 off);
// the guard's dose-advice block and the dose refusal card stay. --hide-dose restores it.
const hideDosePassages = args.includes('--hide-dose')
const cardsFile = args.find((a) => !a.startsWith('--')) ?? 'kb/out/cards-blind.json'
const key = process.env.OPENROUTER_API_KEY ?? ''

type Built = { id: string; docTitle: string; sourceLabel: KbPassage['source_label']; section: string | null; body: string; tags: string[] }
const passages: KbPassage[] = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Built[] }).passages.map((p) => ({
  id: p.id, doc_title: p.docTitle, source_label: p.sourceLabel, section: p.section, body: p.body, tags: p.tags,
}))
if (passages.some((p) => p.source_label === 'care_team')) throw new Error('the FAQ is in passages.json; it must be held out for this test')
const drafts = (JSON.parse(readFileSync(cardsFile, 'utf8')) as { cards: DraftCard[] }).cards
const cards: TopicCard[] = drafts.map((d) => ({ id: d.id, topic: d.topic, asks: d.asks, body: d.answer, source_ids: d.sources, status: 'approved' }))
const faq = readFileSync('kb/local-sources/FAQs.md', 'utf8')
  .split(/^# /m)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [q, ...rest] = s.split('\n')
    return { q: q.trim(), a: rest.join('\n').trim() }
  })

console.log(`FAQ questions: ${faq.length} · passages: ${passages.length} (no FAQ) · cards: ${useCards ? `${cards.length} from ${cardsFile}` : "off (CARDS_PAUSED; --cards to include)"} · patient type: ${diabetesType ?? "none"} · dose passages: ${hideDosePassages ? "hidden" : "shown to the model"}`)
console.log(`OpenRouter key: ${key ? 'set' : 'NOT SET (OPENROUTER_API_KEY)'} · stop above $${MAX_DOLLARS}`)
if (!args.includes('--yes') || !key) {
  console.log('\nDry run: no model calls. Estimated cost about $0.05 (about 3 calls per question). Re-run with --yes.')
  process.exit(0)
}

const index = buildIndex(passages)
const cardIndex = buildCardIndex(cards, passages)
const meter: CostMeter = { dollars: 0, calls: 0 }
const shown = (c: Card): string => {
  switch (c.kind) {
    case 'topic_card': return `**[approved card \`${c.card.id}\`, shown as written]** ${c.card.body}`
    case 'answer': return `**[AI-written answer; sources: ${c.sources.map((s) => `\`${s.id}\` (${s.source_label})`).join(', ')}]** ${c.text}`
    case 'passage': return `**[passage \`${c.passage.id}\` shown word for word (${c.why})]** ${c.passage.body}`
    case 'escalation': return `**[help shown: ${c.tier}]**`
    case 'dose_refusal': return "**[dose refusal]** I can't give advice about insulin or medicine doses. Your care team can help with that."
    case 'no_info': return "**[no information]** I don't have information on that. Your care team can help."
  }
}

const md: string[] = [
  `# Can the assistant answer the FAQ without the FAQ? (${new Date().toISOString().slice(0, 10)})`,
  '',
  `Cards: \`${cardsFile}\` (treated as approved for this test only). Passages: the ADA guides and the book; the FAQ held out. Models: as in \`src/lib/chat/prompts.ts\`.`,
  '',
]
const summary: string[] = []
for (const [i, f] of faq.entries()) {
  if (meter.dollars > MAX_DOLLARS) {
    console.log(`stopping: $${meter.dollars.toFixed(4)} spent, over $${MAX_DOLLARS}`)
    break
  }
  meter.notes = []
  const o = await runTurn({
    message: f.q, history: [], profile: { history_of_dka: false, pregnant: false, uses_pump: false },
    index, cards: cardIndex, cardsEnabled: useCards, diabetesType, hideDosePassages, doseSession: false, models: openRouterModels(key, meter),
  })
  const kinds = o.cards.map((c) => c.kind).join('+')
  const line = `${String(i + 1).padStart(2)}. ${kinds.padEnd(24)} card:${o.card?.how ?? '-'}${o.card?.id ? `(${o.card.id})` : ''}${o.guard ? ` guard:${o.guard}` : ''}  ${f.q.slice(0, 55)}`
  console.log(line)
  summary.push(line)
  md.push(
    `## ${i + 1}. ${f.q}`,
    '',
    `**Clinical FAQ**: ${f.a}`,
    '',
    `**Assistant** (tier ${o.tier}; card step: ${o.card ? `${o.card.how}${o.card.id ? ` \`${o.card.id}\`` : ''}, shortlist ${o.card.shortlist.join(', ') || 'none'}` : 'not run'}${o.guard ? `; guard blocked: ${o.guard}` : ''}):`,
    '',
    ...o.cards.map(shown),
    '',
    ...(o.blockedDraft ? [`*Blocked draft (never shown)*: ${o.blockedDraft}`, ''] : []),
    '**Score**: numbers right ☐ · citations right ☐ · declined when it should ☐ · agrees with the FAQ ☐ · notes:',
    '',
  )
}
md.push('## Run summary', '', '```', ...summary, '```', '', `Model calls: ${meter.calls} · cost: $${meter.dollars.toFixed(4)}`)
writeFileSync('kb/out/eval-faq.md', md.join('\n'))
console.log(`\nmodel calls ${meter.calls} · cost $${meter.dollars.toFixed(4)} · wrote kb/out/eval-faq.md`)
