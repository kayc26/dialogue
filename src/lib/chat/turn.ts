// One patient turn, end to end (ADR-0005..0008). Model calls are injected, so the
// ordering guarantees are testable offline:
//   1. fixed-rule triage first; an emergency short-circuits with no model call;
//   2. classifier (timeout counts as check-in), combined with the rules;
//   3. a dose question gets the fixed refusal card, and the answer model is never called;
//   4. dose-tagged passages are never given to the model; one is shown verbatim only if
//      it's the best match and the question is about glucose/insulin/medicine;
//   3b. approved topic cards (ADR-0013): search shortlists up to 3, a model picks one
//      id or "none", code checks the pick is on the shortlist, and a picked card is
//      shown word for word; no model writes text on that path;
//   5. nothing relevant in the knowledge base -> "no information" with no model call;
//   6. the agent loop writes an answer from shown passages (search_kb tool, few rounds);
//   7. the guard checks it; a blocked answer falls back to the best passage verbatim;
//   8. in a dose-flagged session the monitor must approve before display; otherwise it
//      reviews in the background and can raise the tier on the next screen (ADR-0007).

import { runAgent, type CompleteFn } from '../agent'
import type { ChatMessage, ToolSpec } from '../types'
import { CARD_FALLBACK_SCORE, CARD_MIN_SCORE, CARD_SHORTLIST, parsePick, type CardHit, type CardIndex, type TopicCard } from './cards'
import { combineTriage, parseClassifier, type CombinedTriage } from './combine'
import { checkAnswer, stripCitations, trimBookNumbers } from './guard'
import { ANSWER_SYSTEM, ANSWER_TOOL_ROUNDS, CARDS_PAUSED, MONITOR_PAUSED } from './prompts'
import { direction, type DiabetesType, type Hit, type Index, type KbPassage, type SearchOptions } from './retrieve'
import { maxTier, triageRules, type Profile, type Tier } from './triage'

export type Card =
  | { kind: 'escalation'; tier: Tier; criteria: string[] }
  | { kind: 'passage'; passage: KbPassage; why: 'urgent' | 'dose' | 'fallback' }
  | { kind: 'dose_refusal' }
  | { kind: 'no_info' }
  | { kind: 'answer'; text: string; sources: KbPassage[] }
  | { kind: 'topic_card'; card: TopicCard; sources: KbPassage[] }

/** What the card step did, for the care-team log (ADR-0013's falsifier: which card or
 *  passage answered each turn). */
export interface CardStep {
  /** The card shown, if one was. */
  id: string | null
  how:
    | 'picked' // the model picked a shortlisted card
    | 'fallback' // the pick call failed; the top card scored high enough on its own
    | 'none' // the model said none, or named a card that wasn't offered
    | 'failed' // the pick call failed and no card scored high enough
    | 'no_match' // no card scored high enough to shortlist; no pick call
  shortlist: string[]
}

export interface MonitorVerdict {
  veto: boolean
  raise_tier: Tier
  reason: string
}

export interface TurnModels {
  /** Raw classifier reply (JSON text), or throws/null on failure. */
  classify(message: string, recent: ChatMessage[]): Promise<string | null>
  /** One streamed/non-streamed completion for the agent loop. */
  complete: CompleteFn
  /** Raw monitor reply (JSON text) for the conversation plus the draft. */
  monitor(transcript: string, draft: string): Promise<string | null>
  /** Raw pick reply: one shortlisted card id, or "none". */
  pick(message: string, recent: ChatMessage[], shortlist: TopicCard[]): Promise<string | null>
}

export interface TurnInput {
  message: string
  history: ChatMessage[] // earlier user/assistant turns, plain text
  profile: Profile
  index: Index
  /** Approved topic cards (ADR-0013). Absent or empty: the raw-passage path, as before cards. */
  cards?: CardIndex
  doseSession: boolean // sticky once a dose/medication topic has come up (ADR-0007)
  models: TurnModels
  timeoutMs?: number
  /** Overrides MONITOR_PAUSED (tests run both ways). */
  monitorEnabled?: boolean
  /** Overrides CARDS_PAUSED (tests run both ways). */
  cardsEnabled?: boolean
  /** The patient's diabetes type: passages for the other type rank lower (ADR-0013, QST-KB-RAG-FIXES: B). */
  diabetesType?: DiabetesType
  /** Hide dose-tagged passages from the model (default true; only test runs set false). */
  hideDosePassages?: boolean
  /** Rules 2 and 3 (dose-advice block, dose refusal card). Default true; only test runs set false. */
  enforceDoseRules?: boolean
}

export interface TurnOutcome {
  triage: CombinedTriage
  tier: Tier
  cards: Card[]
  doseSession: boolean
  guard: string | null // why an answer was blocked, if it was
  /** The model's draft when the guard blocked it, kept for the care-team log so a
   *  block can be diagnosed later (the patient never sees it). */
  blockedDraft?: string
  monitor: 'none' | 'blocking' | 'background' | 'paused'
  monitorVerdict: MonitorVerdict | null
  /** For background review: resolves after display; may raise the tier next screen. */
  background: Promise<MonitorVerdict | null> | null
  modelCalls: number
  /** Null when the card step didn't run (emergency, dose question, no approved cards). */
  card: CardStep | null
}

const MIN_SCORE = 2.0
/** The model's "nothing in the passages" reply (ANSWER_SYSTEM asks for this wording). */
const NO_INFO = /\bI don[’']?t have (?:any )?information (?:on|about) (?:that|this)\b/i

/**
 * A reply that says nothing but "no information", however the model words it, even
 * with citations attached. Every sentence is a decline ("I don't have information…",
 * "The passages don't list…"), a referral ("Your care team can help."), or the help
 * reminder. Shown as an answer, it credited a source for a non-answer (baseline FAQ
 * run, 2026-11-16).
 */
const DECLINE_SENTENCE =
  /^(?:I don[’']?t have (?:any )?information\b|I can[’']?t (?:tell|say|answer)\b|The (?:passages|sources|material)s? (?:don[’']?t|do not|doesn[’']?t)\b|(?:Your|The) care team (?:can|will) help\b|If you feel (?:very )?unwell\b)/i
export function isOnlyDecline(text: string): boolean {
  const sentences = stripCitations(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  return sentences.length > 0 && sentences.every((s) => DECLINE_SENTENCE.test(s))
}
const MEDICAL_TOPIC = /\b(sugar|glucose|insulin|ketone|medic|dose|pump|shot|injection|metformin|pill|high|low|a1c|dka)\w*/i
const isDose = (p: KbPassage) => p.tags.includes('dose_related')
/** Only ADA (and care-team) passages are ever shown word for word. A book passage is
 *  first-person and copyrighted, so it can inform a written answer but is never shown
 *  as the urgent, dose, or fallback passage (ADR-0013, QST-KB-BOOK-ROLE: A). */
const showable = (p: KbPassage) => p.source_label !== 'book'

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

export function parseMonitor(text: string | null): MonitorVerdict | null {
  if (!text) return null
  try {
    const o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>
    if (typeof o.veto !== 'boolean') return null
    const tiers: Tier[] = ['none', 'checkin', 'distress', 'urgent', 'emergency']
    return {
      veto: o.veto,
      raise_tier: tiers.includes(o.raise_tier as Tier) ? (o.raise_tier as Tier) : 'none',
      reason: typeof o.reason === 'string' ? o.reason.slice(0, 200) : '',
    }
  } catch {
    return null
  }
}

/** The approved passage to show on an escalation: lows get the low card, highs the high one. */
/** The approved "what to do" passage for a red flag, only when the message says which
 *  way the problem points (a reading, or words like "low" / "high"). Without that,
 *  the escalation card stands alone: a check-in that came from a failed classifier on
 *  "What fruit can I eat?" must not arrive with the Rule of 15 for lows attached. */
function urgentPassage(index: Index, message: string, glucose: number | null, opts: SearchOptions = {}): KbPassage | null {
  const dir = glucose !== null ? (glucose > 180 ? 'high' : glucose < 70 ? 'low' : null) : direction(message)
  if (!dir) return null
  const q = dir === 'high' ? `${message} high blood sugar ketones` : `${message} low blood glucose treat`
  return index.search(q, 12, opts).map((h) => h.passage).find((p) => p.tags.includes('urgent') && showable(p)) ?? null
}

const SEARCH_TOOL: ToolSpec = {
  type: 'function',
  function: {
    name: 'search_kb',
    description: 'Search the approved diabetes education passages. Returns passages with ids to cite as [kb:id].',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
}

const fmt = (p: KbPassage) => `[kb:${p.id}] ${p.doc_title}${p.section ? ` (${p.section})` : ''}\n${p.body}`

export async function runTurn(input: TurnInput): Promise<TurnOutcome> {
  const { message, profile, index, models } = input
  const timeoutMs = input.timeoutMs ?? 6000
  let modelCalls = 0
  const rules = triageRules(message, profile)
  const byType: SearchOptions = { diabetesType: input.diabetesType }
  // The three dose rules. All on in the live app; test runs may pause them (ADR-0013,
  // Kay 2026-11-16: rule 1 "drop the dose-related constraint for testing", then
  // "pause 2 and 3 for now on test").
  //   1. dose-tagged passages hidden from the model, shown only word for word (ADR-0005);
  //   2. the guard blocks dose advice in what the model writes;
  //   3. a dose question gets the fixed refusal card and no answer model.
  const hidden = (p: KbPassage) => (input.hideDosePassages ?? true) && isDose(p)
  const enforceDose = input.enforceDoseRules ?? true
  const cards: Card[] = []

  // 1. Emergency: no model call, 911 first, approved "while you wait" passage.
  if (rules.tier === 'emergency') {
    const p = urgentPassage(index, message, rules.glucose, byType)
    cards.push({ kind: 'escalation', tier: 'emergency', criteria: rules.criteria })
    if (p) cards.push({ kind: 'passage', passage: p, why: 'urgent' })
    const triage: CombinedTriage = { tier: 'emergency', criteria: rules.criteria, doseIntent: rules.doseIntent, softened: false, classifierFailed: false }
    return { triage, tier: 'emergency', cards, doseSession: input.doseSession, guard: null, monitor: 'none', monitorVerdict: null, background: null, modelCalls, card: null }
  }

  // 2. Classifier.
  modelCalls++
  const triage = combineTriage(rules, parseClassifier(await withTimeout(models.classify(message, input.history.slice(-4)), timeoutMs)))
  let tier = triage.tier
  const doseSession = input.doseSession || triage.doseIntent || MEDICAL_TOPIC.test(message) && /\b(insulin|dose|medic|pump|shot|injection)\w*/i.test(message)

  // One question, one reply (Kay, 2026-11-14: "I ask one question and it gives me
  // several cards"). Besides the help notice, a turn shows ONE body: the answer, or a
  // single approved passage, or a fixed card. Only an urgent red flag adds its "what
  // to do" passage, because there that passage is the point.
  if (tier !== 'none') {
    cards.push({ kind: 'escalation', tier, criteria: triage.criteria })
    if (tier === 'urgent') {
      const p = urgentPassage(index, message, rules.glucose, byType)
      if (p) cards.push({ kind: 'passage', passage: p, why: 'urgent' })
    }
  }
  const hasPassage = () => cards.some((c) => c.kind === 'passage')

  let cardStep: CardStep | null = null
  // Set when a book-number sentence was trimmed from an answer that is still shown.
  let trimNote: Pick<TurnOutcome, 'guard' | 'blockedDraft'> = { guard: null }
  const done = (extra: Partial<TurnOutcome> = {}): TurnOutcome => ({
    triage, tier, cards, doseSession, monitor: 'none', monitorVerdict: null, background: null, modelCalls, card: cardStep, ...trimNote, ...extra,
  })

  // 3. Dose question: fixed card, no answer model.
  if (triage.doseIntent && enforceDose) {
    cards.push({ kind: 'dose_refusal' })
    return done()
  }

  // 3b. Approved topic cards. A picked card is the reply's body, shown as approved, so
  // the answer guard and the monitor have nothing to check: no model wrote it, and the
  // sponsor approved it as dose-free (ADR-0013, decision item 5).
  // Cards are paused (CARDS_PAUSED: Kay, 2026-11-16, QST-KB-RAG-FIRST: "try c first"):
  // the trial answers from RAG only.
  if (input.cards && input.cards.size > 0 && (input.cardsEnabled ?? !CARDS_PAUSED)) {
    const shortlist = input.cards.search(message, CARD_SHORTLIST).filter((h) => h.score >= CARD_MIN_SCORE)
    const ids = shortlist.map((h) => h.card.id)
    let shown: CardHit | undefined
    let how: CardStep['how'] = 'no_match'
    if (shortlist.length > 0) {
      modelCalls++
      const pick = parsePick(await withTimeout(models.pick(message, input.history.slice(-4), shortlist.map((h) => h.card)), timeoutMs), ids)
      if (pick === null) {
        shown = shortlist[0].score >= CARD_FALLBACK_SCORE ? shortlist[0] : undefined
        how = shown ? 'fallback' : 'failed'
      } else if ('id' in pick) {
        shown = shortlist.find((h) => h.card.id === pick.id)
        how = 'picked'
      } else {
        how = 'none'
      }
    }
    cardStep = { id: shown?.card.id ?? null, how, shortlist: ids }
    if (shown) {
      cards.push({ kind: 'topic_card', card: shown.card, sources: shown.sources })
      return done()
    }
  }

  // 4–5. Retrieval.
  const hits: Hit[] = index.search(message, 8, byType)
  const top = hits[0]
  // A dose-tagged best match is never given to the model; it is shown word for word,
  // but only when no answer is shown (as the one passage in place of an answer).
  const dosePassage = top && hidden(top.passage) && showable(top.passage) && MEDICAL_TOPIC.test(message) ? top.passage : null
  const context = hits.filter((h) => !hidden(h.passage) && h.score >= MIN_SCORE).slice(0, 4).map((h) => h.passage)
  if (context.length === 0) {
    if (dosePassage && !hasPassage()) cards.push({ kind: 'passage', passage: dosePassage, why: 'dose' })
    else if (!hasPassage()) cards.push({ kind: 'no_info' })
    return done()
  }

  // 6. Agent loop.
  const shown = new Map(context.map((p) => [p.id, p]))
  const messages: ChatMessage[] = [
    { role: 'system', content: ANSWER_SYSTEM },
    ...input.history.slice(-6),
    { role: 'user', content: `${message}\n\nPassages:\n\n${context.map(fmt).join('\n\n')}` },
  ]
  let draft = ''
  const complete: CompleteFn = async (...args) => {
    modelCalls++
    return input.models.complete(...args)
  }
  await runAgent({
    history: messages,
    tools: [SEARCH_TOOL],
    maxToolRounds: ANSWER_TOOL_ROUNDS,
    complete,
    runTool: async (call) => {
      const q = String((JSON.parse(call.function.arguments || '{}') as { query?: string }).query ?? '')
      const found = index.search(q, 4, byType).filter((h) => !hidden(h.passage)).map((h) => h.passage)
      for (const p of found) shown.set(p.id, p)
      return found.length ? found.map(fmt).join('\n\n') : 'No matching passages.'
    },
    emit: (e) => {
      if (e.type === 'assistant_message' && !e.message.tool_calls?.length) draft = e.message.content ?? ''
    },
  })

  // 7. Guard.
  const verdict = checkAnswer(draft, [...shown.values()], message, { doseAdvice: enforceDose })
  // A book-only number costs its sentence, not the whole answer (QST-KB-RAG-ROUND3: B).
  const trimmed = verdict.ok ? null : trimBookNumbers(draft, [...shown.values()], message, { doseAdvice: enforceDose })
  if (trimmed) trimNote = { guard: `trimmed_book_number:${verdict.ok ? '' : verdict.reason.slice('unsupported_number:'.length)}`, blockedDraft: draft }
  const fallback = (): void => {
    if (hasPassage()) return // an urgent passage is already the reply's body
    if (dosePassage) return void cards.push({ kind: 'passage', passage: dosePassage, why: 'dose' })
    const best = context.find(showable)
    cards.push(best ? { kind: 'passage', passage: best, why: 'fallback' } : { kind: 'no_info' })
  }
  if (!verdict.ok && !trimmed) {
    // The prompt tells the model to say "I don't have information on that" when the
    // passages don't answer. That reply carries no citation, and showing the top
    // passage in its place answers a question the model just said it couldn't.
    if (verdict.reason === 'no_citation' && NO_INFO.test(draft)) cards.push({ kind: 'no_info' })
    else fallback()
    return done({ guard: verdict.reason, blockedDraft: draft })
  }
  const text = trimmed ? trimmed.text : draft
  const citations = trimmed ? trimmed.citations : verdict.ok ? verdict.citations : []
  if (isOnlyDecline(text)) {
    cards.push({ kind: 'no_info' })
    return done({ guard: 'decline_with_citation', blockedDraft: draft })
  }
  const answer: Card = { kind: 'answer', text: stripCitations(text), sources: citations.map((id) => shown.get(id)!).filter(Boolean) }

  // 8. Monitor (paused by Kay, 2026-11-14: ADR-0007). While paused, no monitor call is
  // made; the fixed-rule guard above still blocks dose advice, and dose questions still
  // get the refusal card before any model writes.
  if (!(input.monitorEnabled ?? !MONITOR_PAUSED)) {
    cards.push(answer)
    return done({ monitor: 'paused' })
  }
  const transcript = [...input.history, { role: 'user', content: message }]
    .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content ?? ''}`)
    .join('\n')
  if (doseSession) {
    modelCalls++
    const mv = parseMonitor(await withTimeout(models.monitor(transcript, text), timeoutMs))
    if (!mv) {
      tier = maxTier(tier, 'checkin') // monitor down: fixed checks still applied; show help inline
      if (!cards.some((c) => c.kind === 'escalation')) cards.unshift({ kind: 'escalation', tier, criteria: ['monitor_unavailable'] })
      cards.push(answer)
      return done({ tier, monitor: 'blocking' })
    }
    if (mv.raise_tier && maxTier(tier, mv.raise_tier) !== tier) {
      tier = maxTier(tier, mv.raise_tier)
      cards.unshift({ kind: 'escalation', tier, criteria: ['monitor_raised'] })
    }
    if (mv.veto) {
      cards.push({ kind: 'dose_refusal' })
      return done({ tier, monitor: 'blocking', monitorVerdict: mv, guard: 'monitor_veto' })
    }
    cards.push(answer)
    return done({ tier, monitor: 'blocking', monitorVerdict: mv })
  }

  cards.push(answer)
  modelCalls++
  const background = withTimeout(models.monitor(transcript, text), timeoutMs * 2).then(parseMonitor)
  return done({ monitor: 'background', background })
}
