// Folds streamed completion chunks into one assistant message.
//
// The tricky part is tool calls: a streamed tool call arrives in pieces. The
// first delta for a call carries its `index`, `id` and `function.name`; the
// `function.arguments` JSON then trickles in across many later deltas that carry
// only the `index`. Merging by index — never by "the last call" — is what keeps
// two parallel calls from having their arguments interleaved.

import type { ChatMessage, ToolCall, Usage } from './types'

export interface StreamToolCallDelta {
  index?: number
  id?: string
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

export interface StreamChunk {
  choices?: Array<{
    delta?: { role?: string; content?: string | null; tool_calls?: StreamToolCallDelta[] }
    finish_reason?: string | null
  }>
  usage?: Usage
  error?: { message?: string; code?: number | string }
}

export class MessageAccumulator {
  private content = ''
  private calls: ToolCall[] = []
  finishReason: string | null = null
  usage: Usage | undefined

  get text(): string {
    return this.content
  }

  apply(chunk: StreamChunk): void {
    if (chunk.usage) this.usage = chunk.usage
    const choice = chunk.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) this.finishReason = choice.finish_reason
    const delta = choice.delta
    if (!delta) return
    if (typeof delta.content === 'string') this.content += delta.content
    for (const tc of delta.tool_calls ?? []) this.applyToolDelta(tc)
  }

  private applyToolDelta(tc: StreamToolCallDelta): void {
    let slot: number
    if (typeof tc.index === 'number') {
      slot = tc.index
    } else if (tc.id) {
      // Some providers omit `index`; fall back to matching by id, else a new call.
      const found = this.calls.findIndex((c) => c.id === tc.id)
      slot = found === -1 ? this.calls.length : found
    } else {
      slot = Math.max(0, this.calls.length - 1)
    }
    let call = this.calls[slot]
    if (!call) {
      call = { id: '', type: 'function', function: { name: '', arguments: '' } }
      this.calls[slot] = call
    }
    if (tc.id && !call.id) call.id = tc.id
    if (tc.function?.name) call.function.name += tc.function.name
    if (tc.function?.arguments) call.function.arguments += tc.function.arguments
  }

  /** The finished assistant message. Pass `dropToolCalls` for an aborted turn: half-streamed calls must never run. */
  message(dropToolCalls = false): ChatMessage {
    const calls = dropToolCalls ? [] : this.calls.filter(Boolean)
    const msg: ChatMessage = { role: 'assistant', content: this.content === '' && calls.length ? null : this.content }
    if (calls.length) {
      // A call that somehow arrived without an id still needs one to pair with its result.
      msg.tool_calls = calls.map((c, i) => (c.id ? c : { ...c, id: `call_${i}` }))
    }
    return msg
  }
}
