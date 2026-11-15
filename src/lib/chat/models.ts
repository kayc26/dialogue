// Wire the three model roles to OpenRouter with the tester's own key (ADR-0001), the
// cheap models and output caps of ADR-0012, and a running cost total so the $15
// budget stays visible.

import type { CompleteFn } from '../agent'
import { completeChat } from '../openrouter'
import type { ChatMessage, Usage } from '../types'
import { CLASSIFIER_SYSTEM, MODELS, MONITOR_SYSTEM } from './prompts'
import type { TurnModels } from './turn'

/** One model call, as the care-team log records it: enough to tell a reply cut off by
 *  the output cap (finish "length", reasoning tokens eating the budget) from a slow one
 *  (still "pending" when the turn was saved, i.e. it lost to the turn's timeout) from an
 *  error. Never the prompt, never the key. */
export interface CallNote {
  role: 'classify' | 'answer' | 'monitor'
  model: string
  status: 'pending' | 'done' | 'error'
  ms?: number
  finish?: string | null
  tokens?: number
  reasoning_tokens?: number
  chars?: number
  tool_calls?: number
  error?: string
}

export interface CostMeter {
  dollars: number
  calls: number
  /** This turn's calls; the chat panel clears it before each turn. */
  notes?: CallNote[]
}

type Reply = { message: ChatMessage; usage?: Usage; finishReason?: string | null }

async function noted<T extends Reply>(meter: CostMeter, role: CallNote['role'], model: string, call: () => Promise<T>): Promise<T> {
  const note: CallNote = { role, model, status: 'pending' }
  meter.notes?.push(note)
  const t0 = Date.now()
  try {
    const r = await call()
    const usage = r.usage as (Usage & { completion_tokens_details?: { reasoning_tokens?: number } }) | undefined
    Object.assign(note, {
      status: 'done',
      ms: Date.now() - t0,
      finish: r.finishReason ?? null,
      tokens: usage?.completion_tokens,
      reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens,
      chars: r.message.content?.length ?? 0,
      tool_calls: r.message.tool_calls?.length ?? 0,
    })
    return r
  } catch (e) {
    Object.assign(note, { status: 'error', ms: Date.now() - t0, error: String(e instanceof Error ? e.message : e).slice(0, 200) })
    throw e
  }
}

export function openRouterModels(apiKey: string, meter: CostMeter, signal?: AbortSignal): TurnModels {
  const title = 'Diabetes Education Assistant (demo)'
  const record = (cost?: number) => {
    meter.calls++
    if (typeof cost === 'number') meter.dollars += cost
  }
  const json = async (role: 'classify' | 'monitor', model: { id: string; maxTokens: number }, system: string, user: string) => {
    const r = await noted(meter, role, model.id, () =>
      completeChat({
        apiKey, model: model.id, maxTokens: model.maxTokens, temperature: 0, json: true, title, signal,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    )
    record(r.usage?.cost)
    return r.message.content
  }
  const complete: CompleteFn = async (messages, tools, onContent) => {
    const r = await noted(meter, 'answer', MODELS.answer.id, () =>
      completeChat({
        apiKey, model: MODELS.answer.id, maxTokens: MODELS.answer.maxTokens, temperature: 0.2, title, signal,
        messages, tools, onContent,
      }),
    )
    record(r.usage?.cost)
    return { message: r.message, usage: r.usage, aborted: r.aborted }
  }
  return {
    classify: (message: string, recent: ChatMessage[]) =>
      json(
        'classify',
        MODELS.classifier,
        CLASSIFIER_SYSTEM,
        `${recent.map((m) => `${m.role}: ${m.content ?? ''}`).join('\n')}\n\nMessage to triage:\n${message}`,
      ),
    complete,
    monitor: (transcript: string, draft: string) =>
      json('monitor', MODELS.monitor, MONITOR_SYSTEM, `Conversation so far:\n${transcript}\n\nDraft reply:\n${draft}`),
  }
}
