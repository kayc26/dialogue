// Save a conversation to Neon as it happens (ADR-0008, ADR-0011): one session per
// conversation, each turn's patient message and assistant reply, and the triage
// events behind each reply (the code-kept log the care-team summary draws on).
// Saving must never block the patient: failures are reported, chatting continues.

import type { DataClient } from '../neon/data'
import type { CallNote } from './models'
import type { Card, TurnOutcome } from './turn'

/** A plain-text record of what the patient was shown this turn (stored as the reply). */
export function cardsToText(cards: Card[]): string {
  return cards
    .map((c) => {
      switch (c.kind) {
        case 'escalation':
          return `[help shown: ${c.tier}]`
        case 'passage':
          return `[approved passage ${c.passage.id}, shown verbatim (${c.why})]`
        case 'dose_refusal':
          return '[dose question: referred to the care team]'
        case 'no_info':
          return "[no information on that in the knowledge base]"
        case 'social':
          return `[small talk: fixed ${c.intent} reply]`
        case 'answer':
          return `${c.text} [sources: ${c.sources.map((s) => s.id).join(', ')}]`
        case 'topic_card':
          return `${c.card.body} [approved card ${c.card.id}, shown as written; sources: ${c.card.source_ids.join(', ')}]`
      }
    })
    .join('\n')
}

export class ConversationLog {
  private sessionId: string | null = null
  private turn = 0
  constructor(
    private readonly data: Required<DataClient>,
    private readonly patientId: string,
  ) {}

  get id(): string | null {
    return this.sessionId
  }

  async record(message: string, outcome: TurnOutcome, calls: CallNote[] = []): Promise<void> {
    if (!this.sessionId) {
      const [s] = await this.data.post<{ id: string }>('sessions', { patient_id: this.patientId })
      this.sessionId = s.id
    }
    const session_id = this.sessionId
    const turn = this.turn++
    await this.data.post('messages', [
      { session_id, turn, role: 'user', content: message },
      { session_id, turn, role: 'assistant', content: cardsToText(outcome.cards) },
    ])
    await this.data.post('triage_events', {
      session_id,
      turn,
      tier: outcome.tier,
      source: outcome.triage.classifierFailed ? 'rules' : 'classifier',
      criteria: outcome.triage.criteria,
      detail: {
        softened: outcome.triage.softened,
        dose_intent: outcome.triage.doseIntent,
        guard: outcome.guard,
        blocked_draft: outcome.blockedDraft?.slice(0, 1500) ?? null,
        monitor: outcome.monitor,
        monitor_verdict: outcome.monitorVerdict,
        model_calls: outcome.modelCalls,
        card: outcome.card, // ADR-0013: which card answered, or why none did
        social: outcome.cards.flatMap((c) => (c.kind === 'social' ? [c.intent] : []))[0] ?? null, // ADR-0016: which fixed small-talk reply, if any
        calls, // per-call finish reason, tokens, timing (models.ts CallNote)
      },
    })
  }

  async recordMonitor(turn: number, verdict: { raise_tier: string; veto: boolean; reason: string }): Promise<void> {
    if (!this.sessionId) return
    await this.data.post('triage_events', {
      session_id: this.sessionId,
      turn,
      tier: verdict.raise_tier,
      source: 'monitor',
      criteria: verdict.veto ? ['monitor_dose_concern'] : [],
      detail: { background: true, reason: verdict.reason },
    })
  }

  get lastTurn(): number {
    return this.turn - 1
  }
}
