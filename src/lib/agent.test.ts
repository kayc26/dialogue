import { describe, expect, it } from 'vitest'
import { CANCELLED_RESULT, ROUND_LIMIT_RESULT, runAgent, type AgentEvent, type CompleteFn } from './agent'
import { repairToolPairs } from './history'
import type { ChatMessage, ToolCall } from './types'

// A scripted "model": each call returns the next canned assistant message.
// What's under test is the loop's behavior around it — when it runs tools,
// what it feeds back, and when it stops.
function scripted(replies: ChatMessage[]): { complete: CompleteFn; seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = []
  let i = 0
  const complete: CompleteFn = async (messages, _tools, onContent) => {
    seen.push(messages.map((m) => ({ ...m })))
    const reply = replies[Math.min(i++, replies.length - 1)]!
    if (reply.content) onContent(reply.content)
    return { message: reply }
  }
  return { complete, seen }
}

const call = (id: string, name: string, args: object): ToolCall => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const toolTurn = (...calls: ToolCall[]): ChatMessage => ({ role: 'assistant', content: null, tool_calls: calls })
const answer = (text: string): ChatMessage => ({ role: 'assistant', content: text })
const user: ChatMessage[] = [{ role: 'user', content: 'What is 6*7?' }]

function collect() {
  const events: AgentEvent[] = []
  return { events, emit: (e: AgentEvent) => events.push(e) }
}

describe('runAgent', () => {
  it('runs a requested tool, feeds the result back, and stops when the model answers', async () => {
    const { complete, seen } = scripted([toolTurn(call('c1', 'calculator', { expression: '6*7' })), answer('It is 42.')])
    const { events, emit } = collect()
    const ran: string[] = []
    const outcome = await runAgent({
      history: user,
      complete,
      runTool: async (c) => (ran.push(c.function.name), '42'),
      emit,
    })

    expect(outcome).toBe('done')
    expect(ran).toEqual(['calculator'])
    // The second model call must see the tool result, paired by id.
    expect(seen[1]!.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '42' })
    expect(events.filter((e) => e.type === 'assistant_message')).toHaveLength(2)
  })

  it('stops at the round cap and still answers every pending call, so the next request is valid', async () => {
    // A model that never stops asking for tools: the cap is what protects the user's credit.
    const { complete, seen } = scripted([toolTurn(call('loop', 'get_current_time', {}))])
    const { events, emit } = collect()
    let toolRuns = 0
    const outcome = await runAgent({
      history: user,
      maxToolRounds: 3,
      complete,
      runTool: async () => (toolRuns++, 'tick'),
      emit,
    })

    expect(outcome).toBe('round_limit')
    expect(toolRuns).toBe(3)
    expect(seen).toHaveLength(4) // 3 rounds with tools + the 4th request whose calls are refused
    const last = events.at(-1)!
    expect(last).toEqual({ type: 'tool_result', message: { role: 'tool', tool_call_id: 'loop', content: ROUND_LIMIT_RESULT } })

    // Rebuild the history the UI would store and confirm nothing needs repair.
    const stored = [...user, ...events.flatMap((e) => (e.type === 'assistant_delta' ? [] : [e.message]))]
    expect(repairToolPairs(stored)).toEqual(stored)
  })

  it('when stopped mid-way through several calls, closes the remaining ones without running them', async () => {
    const controller = new AbortController()
    const { complete } = scripted([toolTurn(call('a', 'calculator', { expression: '1+1' }), call('b', 'calculator', { expression: '2+2' }))])
    const { events, emit } = collect()
    const ran: string[] = []
    const outcome = await runAgent({
      history: user,
      signal: controller.signal,
      complete,
      runTool: async (c) => {
        ran.push(c.id)
        controller.abort() // the user presses Stop while the first tool runs
        return '2'
      },
      emit,
    })

    expect(outcome).toBe('aborted')
    expect(ran).toEqual(['a'])
    const results = events.filter((e) => e.type === 'tool_result').map((e) => ('message' in e ? e.message : null))
    expect(results).toEqual([
      { role: 'tool', tool_call_id: 'a', content: '2' },
      { role: 'tool', tool_call_id: 'b', content: CANCELLED_RESULT },
    ])
  })

  it('turns a throwing tool into an error result the model can read, instead of crashing the run', async () => {
    const { complete, seen } = scripted([toolTurn(call('c1', 'notes_read', { title: 'x' })), answer('Sorry, that failed.')])
    const outcome = await runAgent({
      history: user,
      complete,
      runTool: async () => {
        throw new Error('storage unavailable')
      },
      emit: () => {},
    })
    expect(outcome).toBe('done')
    expect(seen[1]!.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'Error: storage unavailable' })
  })
})
