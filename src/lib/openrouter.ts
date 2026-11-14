// The only module that talks to the network. Calls go straight from the
// browser to OpenRouter (CORS verified 2026-11-12, see ADR-0001); there is no
// backend. The key is passed in per call and never logged.

import { MessageAccumulator, type StreamChunk } from './accumulate'
import { SSEParser } from './sse'
import type { ChatMessage, ToolSpec, Usage } from './types'

export const API_BASE = 'https://openrouter.ai/api/v1'

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

export interface ModelInfo {
  id: string
  name: string
  contextLength?: number
  supportsTools: boolean
  promptPrice?: number
  completionPrice?: number
}

type FetchFn = typeof fetch

export async function listModels(fetchImpl: FetchFn = fetch, signal?: AbortSignal): Promise<ModelInfo[]> {
  const res = await fetchImpl(`${API_BASE}/models`, { signal })
  if (!res.ok) throw await toError(res)
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> }
  return (body.data ?? []).map((m) => {
    const pricing = (m.pricing ?? {}) as Record<string, string>
    const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as string[]) : []
    return {
      id: String(m.id),
      name: String(m.name ?? m.id),
      contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
      supportsTools: params.includes('tools'),
      promptPrice: pricing.prompt !== undefined ? Number(pricing.prompt) : undefined,
      completionPrice: pricing.completion !== undefined ? Number(pricing.completion) : undefined,
    }
  })
}

export interface CompleteOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  tools?: ToolSpec[]
  signal?: AbortSignal
  /** Called with the full assistant text so far, each time it grows. */
  onContent?: (soFar: string) => void
  fetchImpl?: FetchFn
  /** Output cap per call (ADR-0012 spending guard). */
  maxTokens?: number
  temperature?: number
  /** Ask for a JSON object (classifier and monitor). */
  json?: boolean
  /** App name OpenRouter shows in its usage logs. */
  title?: string
}

export interface CompletionResult {
  message: ChatMessage
  usage?: Usage
  finishReason: string | null
  aborted: boolean
}

/** One streamed chat completion. Resolves with the assembled assistant message. */
export async function completeChat(opts: CompleteOptions): Promise<CompletionResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const acc = new MessageAccumulator()
  try {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      stream: true,
      usage: { include: true },
    }
    if (opts.tools?.length) body.tools = opts.tools
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens
    if (opts.temperature !== undefined) body.temperature = opts.temperature
    if (opts.json) body.response_format = { type: 'json_object' }

    const res = await fetchImpl(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': opts.title ?? 'Harness',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok) throw await toError(res)
    if (!res.body) throw new OpenRouterError('The response had no body to stream.')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const parser = new SSEParser()
    const handle = (payloads: string[]): boolean => {
      for (const p of payloads) {
        if (p === '[DONE]') return true
        let chunk: StreamChunk
        try {
          chunk = JSON.parse(p) as StreamChunk
        } catch {
          continue // a malformed line should not kill an otherwise good stream
        }
        // OpenRouter reports mid-stream failures (e.g. provider errors) as an error chunk.
        if (chunk.error) throw new OpenRouterError(chunk.error.message ?? 'The provider returned an error mid-stream.')
        const before = acc.text
        acc.apply(chunk)
        if (acc.text !== before) opts.onContent?.(acc.text)
      }
      return false
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        handle([...parser.push(decoder.decode()), ...parser.flush()])
        break
      }
      if (handle(parser.push(decoder.decode(value, { stream: true })))) {
        await reader.cancel().catch(() => {})
        break
      }
    }
    return { message: acc.message(), usage: acc.usage, finishReason: acc.finishReason, aborted: false }
  } catch (err) {
    if (isAbort(err)) {
      // Keep whatever text arrived; drop half-streamed tool calls so they can never execute.
      return { message: acc.message(true), usage: acc.usage, finishReason: 'aborted', aborted: true }
    }
    throw err
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string })?.name === 'AbortError'
}

async function toError(res: Response): Promise<OpenRouterError> {
  let detail = `${res.status} ${res.statusText}`.trim()
  try {
    const j = (await res.json()) as { error?: { message?: string } }
    if (j?.error?.message) detail = j.error.message
  } catch {
    // body was not JSON; keep the status line
  }
  return new OpenRouterError(friendly(res.status, detail), res.status)
}

function friendly(status: number, detail: string): string {
  switch (status) {
    case 401:
      return `OpenRouter rejected the API key (401). Check it in Settings. (${detail})`
    case 402:
      return `Out of OpenRouter credits (402). (${detail})`
    case 429:
      return `Rate limited by OpenRouter (429); wait a moment and retry. (${detail})`
    default:
      if (status === 404 && /tool/i.test(detail)) {
        return `This model doesn't support tool calling. Turn tools off for this conversation, or pick a model marked "tools". (${detail})`
      }
      return `OpenRouter error ${status}: ${detail}`
  }
}
