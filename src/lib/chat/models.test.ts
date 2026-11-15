// The OpenRouter wiring for the chat's model roles, against a stand-in server that
// streams what OpenRouter streams. These pin the request settings and reply handling
// that Kay's first live test (2026-11-14) showed to matter.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../types'
import { openRouterModels, type CostMeter } from './models'

const ev = (obj: object) => `data: ${JSON.stringify(obj)}\n\n`

/** Stub fetch: records each request body and streams back the given reply. */
function serve(reply: { content: string; finish: string; completion_tokens: number; reasoning_tokens?: number }) {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    const sse =
      ev({ choices: [{ delta: { role: 'assistant', content: reply.content }, finish_reason: reply.finish }] }) +
      ev({
        choices: [],
        usage: {
          prompt_tokens: 100, completion_tokens: reply.completion_tokens, total_tokens: 100 + reply.completion_tokens, cost: 0.0001,
          completion_tokens_details: { reasoning_tokens: reply.reasoning_tokens ?? 0 },
        },
      }) +
      'data: [DONE]\n\n'
    return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  })
  return bodies
}

afterEach(() => vi.unstubAllGlobals())

describe('Regression tests', () => {
  it('the classifier is asked without JSON mode, with low reasoning effort (gpt-oss-20b answered "{}" in JSON mode)', async () => {
    // Bug: with response_format json_object, gpt-oss-20b replied "{}" (3 tokens) on
    // every turn, so every turn fell back to a check-in card ("a bit annoying" — Kay).
    const bodies = serve({ content: '{"tier":"none","happening_now":false,"dose_intent":false,"reason":"food question"}', finish: 'stop', completion_tokens: 30 })
    const meter: CostMeter = { dollars: 0, calls: 0, notes: [] }
    const raw = await openRouterModels('k', meter).classify('What fruit can I eat?', [])
    expect(raw).toContain('"tier":"none"')
    expect(bodies[0].response_format).toBeUndefined()
    expect(bodies[0].reasoning).toEqual({ effort: 'low', exclude: true })
  })

  it('an answer cut off by the output cap comes back empty, so it is never shown, and the log keeps why', async () => {
    // Bug: Haiku spent 361 of 500 tokens thinking, finished with "length", and the
    // 308-character fragment it had written was shown to the patient.
    serve({ content: 'Berries and apples are good choices. Keep fruit to', finish: 'length', completion_tokens: 500, reasoning_tokens: 361 })
    const meter: CostMeter = { dollars: 0, calls: 0, notes: [] }
    const r = await openRouterModels('k', meter).complete([{ role: 'user', content: 'What fruit can I eat?' } as ChatMessage], [], () => {})
    expect(r.message.content).toBe('')
    expect(meter.notes?.[0]).toMatchObject({ role: 'answer', status: 'done', finish: 'length', tokens: 500, reasoning_tokens: 361, chars: 50 })
  })

  it('a finished answer is passed through unchanged', async () => {
    serve({ content: 'Berries are a good choice. [kb:fruit]', finish: 'stop', completion_tokens: 120, reasoning_tokens: 60 })
    const meter: CostMeter = { dollars: 0, calls: 0, notes: [] }
    const r = await openRouterModels('k', meter).complete([{ role: 'user', content: 'fruit?' } as ChatMessage], [], () => {})
    expect(r.message.content).toBe('Berries are a good choice. [kb:fruit]')
    expect(meter.dollars).toBeCloseTo(0.0001)
  })
})
