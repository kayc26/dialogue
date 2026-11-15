// One patient turn, end to end (ADR-0005..0008). Model calls are injected, so the
// ordering guarantees are testable offline:
//   1. fixed-rule triage first; an emergency short-circuits with no model call;
//   2. classifier (timeout counts as check-in), combined with the rules;
//   3. a dose question gets the fixed refusal card, and the answer model is never called;
//   4. dose-tagged passages are never given to the model; one is shown verbatim only if
//      it's the best match and the question is about glucose/insulin/medicine;
//   5. nothing relevant in the knowledge base -> "no information" with no model call;
//   6. the agent loop writes an answer from shown passages (search_kb tool, few rounds);
//   7. the guard checks it; a blocked answer falls back to the best passage verbatim;
//   8. in a dose-flagged session the monitor must approve before display; otherwise it
//      reviews in the background and can raise the tier on the next screen (ADR-0007).

import { runAgent, type CompleteFn } from '../agent'
import type { ChatMessage, ToolSpec } from '../types'
import { combineTriage, parseClassifier, type CombinedTriage } from './combine'
import { checkAnswer, stripCitations } from './guard'
import { ANSWER_SYSTEM, ANSWER_TOOL_ROUNDS, MONITOR_PAUSED } from './prompts'
import { direction, type Hit, type Index, type KbPassage } from './retrieve'
import { maxTier, triageRules, type Profile, type Tier } from './triage'

export type Card =
  | { kind: 'escalation'; tier: Tier; criteria: string[] }
  | { kind: 'passage'; passage: KbPassage; why: 'urgent' | 'dose' | 'fallback' }
  | { kind: 'dose_refusal' }
  | { kind: 'no_info' }
  | { kind: 'answer'; text: string; sources: KbPassage[] }

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
}

export interface TurnInput {
  message: string
  history: ChatMessage[] // earlier user/assistant turns, plain text
  profile: Profile
  index: Index
  doseSession: boolean // sticky once a dose/medication topic has come up (ADR-0007)
  models: TurnModels
  timeoutMs?: number
  /** Overrides MONITOR_PAUSED (tests run both ways). */
  monitorEnabled?: boolean
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
}

const MIN_SCORE = 2.0
/** The model's "nothing in the passages" reply (ANSWER_SYSTEM asks for this wording). */
const NO_INFO = /\bI don[’']?t have (?:any )?information (?:on|about) (?:that|this)\b/i
const MEDICAL_TOPIC = /\b(sugar|glucose|insulin|ketone|medic|dose|pump|shot|injection|metformin|pill|high|low|a1c|dka)\w*/i
const isDose = (p: KbPassage) => p.tags.includes('dose_related')

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
function urgentPassage(index: Index, message: string, glucose: number | null): KbPassage | null {
  const dir = glucose !== null ? (glucose > 180 ? 'high' : glucose < 70 ? 'low' : null) : direction(message)
  if (!dir) return null
  const q = dir === 'high' ? `${message} high blood sugar ketones` : `${message} low blood glucose treat`
  return index.search(q, 12).map((h) => h.passage).find((p) => p.tags.includes('urgent')) ?? null
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
  const cards: Card[] = []

  // 1. Emergency: no model call, 911 first, approved "while you wait" passage.
  if (rules.tier === 'emergency') {
    const p = urgentPassage(index, message, rules.glucose)
    cards.push({ kind: 'escalation', tier: 'emergency', criteria: rules.criteria })
    if (p) cards.push({ kind: 'passage', passage: p, why: 'urgent' })
    const triage: CombinedTriage = { tier: 'emergency', criteria: rules.criteria, doseIntent: rules.doseIntent, softened: false, classifierFailed: false }
    return { triage, tier: 'emergency', cards, doseSession: input.doseSession, guard: null, monitor: 'none', monitorVerdict: null, background: null, modelCalls }
  }

  // 2. Classifier.
  modelCalls++
  const triage = combineTriage(rules, parseClassifier(await withTimeout(models.classify(message, input.history.slice(-4)), timeoutMs)))
  let tier = triage.tier
  const doseSession = input.doseSession || triage.doseIntent || MEDICAL_TOPIC.test(message) && /\b(insulin|dose|medic|pump|shot|injection)\w*/i.test(message)

  if (tier !== 'none') {
    cards.push({ kind: 'escalation', tier, criteria: triage.criteria })
    if (tier === 'urgent' || tier === 'checkin') {
      const p = urgentPassage(index, message, rules.glucose)
      if (p) cards.push({ kind: 'passage', passage: p, why: 'urgent' })
    }
  }

  const done = (extra: Partial<TurnOutcome> = {}): TurnOutcome => ({
    triage, tier, cards, doseSession, guard: null, monitor: 'none', monitorVerdict: null, background: null, modelCalls, ...extra,
  })

  // 3. Dose question: fixed card, no answer model.
  if (triage.doseIntent) {
    cards.push({ kind: 'dose_refusal' })
    return done()
  }

  // 4–5. Retrieval.
  const hits: Hit[] = index.search(message, 8)
  const top = hits[0]
  if (top && isDose(top.passage) && MEDICAL_TOPIC.test(message)) {
    cards.push({ kind: 'passage', passage: top.passage, why: 'dose' })
  }
  const context = hits.filter((h) => !isDose(h.passage) && h.score >= MIN_SCORE).slice(0, 4).map((h) => h.passage)
  if (context.length === 0) {
    if (!cards.some((c) => c.kind === 'passage')) cards.push({ kind: 'no_info' })
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
      const found = index.search(q, 4).filter((h) => !isDose(h.passage)).map((h) => h.passage)
      for (const p of found) shown.set(p.id, p)
      return found.length ? found.map(fmt).join('\n\n') : 'No matching passages.'
    },
    emit: (e) => {
      if (e.type === 'assistant_message' && !e.message.tool_calls?.length) draft = e.message.content ?? ''
    },
  })

  // 7. Guard.
  const verdict = checkAnswer(draft, [...shown.values()], message)
  const fallback = (): void => {
    cards.push({ kind: 'passage', passage: context[0], why: 'fallback' })
  }
  if (!verdict.ok) {
    // The prompt tells the model to say "I don't have information on that" when the
    // passages don't answer. That reply carries no citation, and showing the top
    // passage in its place answers a question the model just said it couldn't.
    if (verdict.reason === 'no_citation' && NO_INFO.test(draft)) cards.push({ kind: 'no_info' })
    else fallback()
    return done({ guard: verdict.reason, blockedDraft: draft })
  }
  const answer: Card = { kind: 'answer', text: stripCitations(draft), sources: verdict.citations.map((id) => shown.get(id)!).filter(Boolean) }

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
    const mv = parseMonitor(await withTimeout(models.monitor(transcript, draft), timeoutMs))
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
  const background = withTimeout(models.monitor(transcript, draft), timeoutMs * 2).then(parseMonitor)
  return done({ monitor: 'background', background })
}
