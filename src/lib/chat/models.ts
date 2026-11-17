// Wire the three model roles to OpenRouter with the tester's own key (ADR-0001), the
// cheap models and output caps of ADR-0012, and a running cost total so the $15
// budget stays visible.

import type { CompleteFn } from '../agent'
import { completeChat } from '../openrouter'
import type { ChatMessage, Usage } from '../types'
import { CLASSIFIER_SYSTEM, MODELS, MONITOR_SYSTEM, PICK_SYSTEM, pickPrompt } from './prompts'
import type { TurnModels } from './turn'

/** One model call, as the care-team log records it: enough to tell a reply cut off by
 *  the output cap (finish "length", reasoning tokens eating the budget) from a slow one
 *  (still "pending" when the turn was saved, i.e. it lost to the turn's timeout) from an
 *  error. Never the prompt, never the key. */
export interface CallNote {
  role: 'classify' | 'answer' | 'monitor' | 'pick'
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

/**
 * `apiKey` is an OpenRouter key (kb:eval-faq runs locally with one), or a function that
 * returns a fresh sign-in token when calls go through the model proxy (ADR-0014, C), in
 * which case `baseUrl` is the proxy's URL and the shared key never reaches the browser.
 */
export function openRouterModels(
  apiKey: string | (() => Promise<string>),
  meter: CostMeter,
  opts: { signal?: AbortSignal; baseUrl?: string } = {},
): TurnModels {
  const { signal, baseUrl } = opts
  const title = 'Diabetes Education Assistant (demo)'
  const record = (cost?: number) => {
    meter.calls++
    if (typeof cost === 'number') meter.dollars += cost
  }
  const json = async (role: 'classify' | 'monitor' | 'pick', model: { id: string; maxTokens: number }, system: string, user: string) => {
    const r = await noted(meter, role, model.id, () =>
      // No JSON mode: with it, gpt-oss-20b replied "{}" (3 tokens) and every turn fell
      // back to a check-in (Kay's test, 2026-11-14). The prompt asks for JSON and
      // parseClassifier / parseMonitor take the {...} out of plain text.
      completeChat({
        apiKey, baseUrl, model: model.id, maxTokens: model.maxTokens, temperature: 0, reasoningEffort: 'low', title, signal,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    )
    record(r.usage?.cost)
    return r.message.content
  }
  const complete: CompleteFn = async (messages, tools, onContent) => {
    const r = await noted(meter, 'answer', MODELS.answer.id, () =>
      completeChat({
        apiKey, baseUrl, model: MODELS.answer.id, maxTokens: MODELS.answer.maxTokens, temperature: 0.2, title, signal,
        messages, tools, onContent,
      }),
    )
    record(r.usage?.cost)
    // An answer cut off by the output cap is never shown: the missing half of a medical
    // sentence can be the part that matters. Emptied, the guard blocks it
    // (empty_answer) and an approved passage is shown instead; the call note keeps
    // finish "length" for the log.
    if (r.finishReason === 'length' && !r.message.tool_calls?.length) {
      return { message: { ...r.message, content: '' }, usage: r.usage, aborted: r.aborted }
    }
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
    // Plain text, like the JSON roles: parsePick (cards.ts) takes the id out and checks it.
    pick: (message, recent, shortlist) => json('pick', MODELS.picker, PICK_SYSTEM, pickPrompt(message, recent, shortlist)),
  }
}
