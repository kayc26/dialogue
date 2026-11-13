// The agent loop (ADR-0003, option C): ask the model; if it requests tool
// calls, run them, append the results, and ask again — until the model answers
// without tools, the user stops it, or the round cap is hit.
//
// The invariant this module protects: every assistant tool call in the
// history is followed by a `tool` message with its id. Providers reject a
// history that breaks it, so a capped or cancelled run must still close every
// call it leaves behind — otherwise the user's NEXT message fails.

import type { ChatMessage, ToolCall, ToolSpec, Usage } from './types'

export const MAX_TOOL_ROUNDS = 8

export type CompleteFn = (
  messages: ChatMessage[],
  tools: ToolSpec[] | undefined,
  onContent: (soFar: string) => void,
) => Promise<{ message: ChatMessage; usage?: Usage; aborted?: boolean }>

export type RunToolFn = (call: ToolCall) => Promise<string>

export type AgentEvent =
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_message'; message: ChatMessage; usage?: Usage }
  | { type: 'tool_result'; message: ChatMessage }

export type AgentOutcome = 'done' | 'round_limit' | 'aborted'

export interface AgentInput {
  history: ChatMessage[]
  tools?: ToolSpec[]
  maxToolRounds?: number
  signal?: AbortSignal
  complete: CompleteFn
  runTool: RunToolFn
  emit: (e: AgentEvent) => void
}

export const ROUND_LIMIT_RESULT = 'Not executed: the harness stopped this run after reaching its tool-round limit.'
export const CANCELLED_RESULT = 'Not executed: the user stopped the run.'

export async function runAgent(input: AgentInput): Promise<AgentOutcome> {
  const maxRounds = input.maxToolRounds ?? MAX_TOOL_ROUNDS
  const messages = [...input.history]
  let rounds = 0

  for (;;) {
    if (input.signal?.aborted) return 'aborted'
    const { message, usage, aborted } = await input.complete(messages, input.tools, (soFar) =>
      input.emit({ type: 'assistant_delta', content: soFar }),
    )
    messages.push(message)
    input.emit({ type: 'assistant_message', message, usage })
    if (aborted || input.signal?.aborted) {
      closeCalls(message.tool_calls ?? [], CANCELLED_RESULT, messages, input.emit)
      return 'aborted'
    }

    const calls = message.tool_calls ?? []
    if (calls.length === 0) return 'done'

    if (rounds >= maxRounds) {
      closeCalls(calls, ROUND_LIMIT_RESULT, messages, input.emit)
      return 'round_limit'
    }
    rounds++

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]!
      if (input.signal?.aborted) {
        closeCalls(calls.slice(i), CANCELLED_RESULT, messages, input.emit)
        return 'aborted'
      }
      let content: string
      try {
        content = await input.runTool(call)
      } catch (err) {
        content = `Error: ${err instanceof Error ? err.message : String(err)}`
      }
      const result: ChatMessage = { role: 'tool', tool_call_id: call.id, content }
      messages.push(result)
      input.emit({ type: 'tool_result', message: result })
    }
  }
}

function closeCalls(calls: ToolCall[], reason: string, messages: ChatMessage[], emit: AgentInput['emit']): void {
  for (const call of calls) {
    const result: ChatMessage = { role: 'tool', tool_call_id: call.id, content: reason }
    messages.push(result)
    emit({ type: 'tool_result', message: result })
  }
}
