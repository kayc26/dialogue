// Wire the three model roles to OpenRouter with the tester's own key (ADR-0001), the
// cheap models and output caps of ADR-0012, and a running cost total so the $15
// budget stays visible.

import type { CompleteFn } from '../agent'
import { completeChat } from '../openrouter'
import type { ChatMessage } from '../types'
import { CLASSIFIER_SYSTEM, MODELS, MONITOR_SYSTEM } from './prompts'
import type { TurnModels } from './turn'

export interface CostMeter {
  dollars: number
  calls: number
}

export function openRouterModels(apiKey: string, meter: CostMeter, signal?: AbortSignal): TurnModels {
  const title = 'Diabetes Education Assistant (demo)'
  const record = (cost?: number) => {
    meter.calls++
    if (typeof cost === 'number') meter.dollars += cost
  }
  const json = async (model: { id: string; maxTokens: number }, system: string, user: string) => {
    const r = await completeChat({
      apiKey, model: model.id, maxTokens: model.maxTokens, temperature: 0, json: true, title, signal,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    record(r.usage?.cost)
    return r.message.content
  }
  const complete: CompleteFn = async (messages, tools, onContent) => {
    const r = await completeChat({
      apiKey, model: MODELS.answer.id, maxTokens: MODELS.answer.maxTokens, temperature: 0.2, title, signal,
      messages, tools, onContent,
    })
    record(r.usage?.cost)
    return { message: r.message, usage: r.usage, aborted: r.aborted }
  }
  return {
    classify: (message: string, recent: ChatMessage[]) =>
      json(
        MODELS.classifier,
        CLASSIFIER_SYSTEM,
        `${recent.map((m) => `${m.role}: ${m.content ?? ''}`).join('\n')}\n\nMessage to triage:\n${message}`,
      ),
    complete,
    monitor: (transcript: string, draft: string) =>
      json(MODELS.monitor, MONITOR_SYSTEM, `Conversation so far:\n${transcript}\n\nDraft reply:\n${draft}`),
  }
}
