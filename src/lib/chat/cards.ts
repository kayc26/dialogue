// Approved topic cards (ADR-0013: C + A). A card is a short, plain-language answer to
// one common question, written from approved passages and approved by the clinical
// sponsor. When a question matches a card, the patient sees that card word for word
// (QST-KB-CARD-USE: A): no model writes text on that path. The model only picks which
// shortlisted card answers the question, or "none", and code checks its pick.
//
// Only approved cards are ever used. RLS already serves members nothing else
// (db/migrations/0003_kb_cards.sql); this file filters again, so a draft can't reach a
// patient through a wrong query or a loosened policy.

import type { DataClient } from '../neon/data'
import { buildIndex, type KbPassage } from './retrieve.ts'

export interface TopicCard {
  id: string
  topic: string
  /** Questions the card is meant for; they help search, the patient never sees them. */
  asks: string[]
  /** The approved text, shown exactly as written. */
  body: string
  /** Passage ids the card was written from (kb_chunks.id), for the source chips. */
  source_ids: string[]
  status: 'draft' | 'approved'
}

export interface CardHit {
  card: TopicCard
  score: number
  /** The passages the card cites, for its source chips (unknown ids skipped). */
  sources: KbPassage[]
}

export interface CardIndex {
  search(query: string, k?: number): CardHit[]
  readonly size: number
}

// Cutoffs calibrated on two card sets, each test question held out of its own card,
// word rarity from the 2026-11-16 knowledge base (439 passages)
// (scripts/ephemeral/2026-11-16-card-match-calibration.ts, 2026-11-16):
//   - blind redraft (30 cards, 120 questions): right card scored 1.8 at the least,
//     4.9 at the 10th percentile, 7.9 median; off-topic up to 3.3; the highest WRONG
//     first place 14.9 ("When should someone call 911 for a low?" ranked the
//     when-to-get-help card above the severe-low card; "How much juice should I drink
//     if I'm going low?" ranked the drinks card first at 14.4);
//   - first drafts: wrong first places up to 12.8;
//   - a card's score alone vs. among all 30 differed by 0.97–1.19×, so the cutoffs
//     hold while the sponsor approves cards in batches.
// Right and wrong overlap across the whole range, so the score alone can't choose a
// card: search shortlists and the pick decides.

/** Shortlist floor. It saves a pick call on questions no card could answer; the pick
 *  and the shortlist check, not this number, keep a wrong card away. */
export const CARD_MIN_SCORE = 2.5
/** When the pick call fails, the top card is shown only at or above this score;
 *  otherwise the turn takes the raw-passage path (ADR-0013, decision item 4). Set
 *  above every wrong first place seen (14.9), so in practice a failed pick almost
 *  always takes the raw-passage path. */
export const CARD_FALLBACK_SCORE = 16
/** ADR-0013: "about 3". The right card was in the top 3 for 94 of 120 held-out
 *  questions (top 5: 104); a miss takes the raw-passage path, as before cards. */
export const CARD_SHORTLIST = 3

export function buildCardIndex(cards: TopicCard[], passages: KbPassage[] = []): CardIndex {
  const approved = cards.filter((c) => c.status === 'approved')
  const byId = new Map(approved.map((c) => [c.id, c]))
  const passageById = new Map(passages.map((p) => [p.id, p]))
  const sourcesOf = (c: TopicCard) => c.source_ids.map((id) => passageById.get(id)).filter((p): p is KbPassage => !!p)
  // The passage index weights `section` twice, so the topic and the questions a card
  // is meant for count more than its body. Word rarity comes from the cards *and* the
  // whole knowledge base, so a card's score is the same whether 2 cards are approved
  // or 30 (the cutoffs below were calibrated that way).
  const index = buildIndex(
    approved.map((c) => ({
      id: c.id, doc_title: c.topic, source_label: 'care_team', section: `${c.topic} ${c.asks.join(' ')}`, body: c.body, tags: [],
    })),
    undefined,
    undefined,
    passages.map((p) => `${p.section ?? ''} ${p.body}`),
  )
  return {
    size: approved.length,
    search(query, k = CARD_SHORTLIST) {
      return index.search(query, k).map((h) => {
        const card = byId.get(h.passage.id)!
        return { card, score: h.score, sources: sourcesOf(card) }
      })
    },
  }
}

export type CardPick = { id: string } | { none: true } | null

/**
 * Read the picker's reply. A shortlisted id → that card; "none" → none; an id that
 * isn't on the shortlist, or an unreadable reply → none too (the model chose
 * something we didn't offer, so we don't trust it to have read the shortlist).
 * Only no reply at all (failure or timeout) returns null.
 */
export function parsePick(text: string | null | undefined, shortlist: string[]): CardPick {
  if (text === null || text === undefined) return null
  const t = text.trim().replace(/^["'`]+|["'`.]+$/g, '').trim()
  if (shortlist.includes(t)) return { id: t }
  if (/^none\b/i.test(t)) return { none: true }
  const named = shortlist.filter((id) => new RegExp(`(^|[^a-z0-9-])${id}([^a-z0-9-]|$)`, 'i').test(text))
  return named.length === 1 ? { id: named[0] } : { none: true }
}

/**
 * Approved cards for this member. Any failure gives an empty list, so the assistant
 * answers from raw passages as before: the table may not exist yet while a migration
 * rolls out (the site deploys on every push, before the database changes), and a
 * missing card must never take the patient view down with it.
 */
export async function loadApprovedCards(data: DataClient): Promise<TopicCard[]> {
  try {
    const rows = await data.get<TopicCard[]>('kb_cards?status=eq.approved&select=id,topic,asks,body,source_ids,status')
    return Array.isArray(rows) ? rows.filter((c) => c.status === 'approved') : []
  } catch {
    return []
  }
}
