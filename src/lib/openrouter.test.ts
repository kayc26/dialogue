import { describe, expect, it } from 'vitest'
import { OpenRouterError, completeChat } from './openrouter'

// A stand-in for OpenRouter's server: a real Response whose body streams the
// given SSE text in awkward chunk sizes, as a slow network delivers it.
function streamingFetch(sse: string, chunkSize = 7, status = 200): typeof fetch {
  return (async () => {
    const bytes = new TextEncoder().encode(sse)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize))
        controller.close()
      },
    })
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof fetch
}

const ev = (obj: object) => `data: ${JSON.stringify(obj)}\n\n`

describe('completeChat', () => {
  it('assembles a streamed tool call and usage even when chunks split multi-byte characters', async () => {
    const sse =
      ': OPENROUTER PROCESSING\n\n' +
      ev({ choices: [{ delta: { role: 'assistant', content: 'Je vérifie… ' } }] }) + // é and … are multi-byte
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":' } }] } }] }) +
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"6*7"}' } }] }, finish_reason: 'tool_calls' }] }) +
      ev({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, cost: 0.00002 } }) +
      'data: [DONE]\n\n'

    const seen: string[] = []
    for (const size of [1, 3, 7, 64]) {
      const r = await completeChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: streamingFetch(sse, size), onContent: (t) => seen.push(t) })
      expect(r.message).toEqual({
        role: 'assistant',
        content: 'Je vérifie… ',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"6*7"}' } }],
      })
      expect(r.finishReason).toBe('tool_calls')
      expect(r.usage?.total_tokens).toBe(20)
    }
    expect(seen.every((t) => !t.includes('�'))).toBe(true) // no mangled characters ever shown
  })

  it('surfaces a mid-stream provider error instead of returning a truncated answer as if complete', async () => {
    const sse = ev({ choices: [{ delta: { content: 'Partial' } }] }) + ev({ error: { message: 'Provider returned error', code: 502 } })
    await expect(completeChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: streamingFetch(sse) })).rejects.toThrow('Provider returned error')
  })

  it('sends the per-call output cap and JSON mode (ADR-0012 spending guard)', async () => {
    let sent: Record<string, unknown> = {}
    const capture = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return streamingFetch(ev({ choices: [{ delta: { content: '{}' } }] }) + 'data: [DONE]\n\n')(_url, init)
    }) as typeof fetch
    await completeChat({ apiKey: 'k', model: 'm', messages: [], fetchImpl: capture, maxTokens: 150, json: true, temperature: 0 })
    expect(sent).toMatchObject({ max_tokens: 150, response_format: { type: 'json_object' }, temperature: 0 })
  })

  it('explains a rejected key in words a user can act on', async () => {
    const fetch401 = (async () =>
      new Response(JSON.stringify({ error: { message: 'No auth credentials found', code: 401 } }), { status: 401 })) as typeof fetch
    const err = await completeChat({ apiKey: 'bad', model: 'm', messages: [], fetchImpl: fetch401 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OpenRouterError)
    expect((err as OpenRouterError).status).toBe(401)
    expect((err as Error).message).toMatch(/rejected the API key.*Settings/)
  })

  it('keeps the text received so far when the user stops the stream', async () => {
    const controller = new AbortController()
    const fetchUntilAbort = (async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(ev({ choices: [{ delta: { content: 'First half' } }] })))
          init?.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')))
        },
      })
      return new Response(body, { status: 200 })
    }) as unknown as typeof fetch
    const done = completeChat({
      apiKey: 'k',
      model: 'm',
      messages: [],
      signal: controller.signal,
      fetchImpl: fetchUntilAbort,
      onContent: () => controller.abort(),
    })
    const r = await done
    expect(r.aborted).toBe(true)
    expect(r.message).toEqual({ role: 'assistant', content: 'First half' })
  })
})
