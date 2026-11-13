import { describe, expect, it } from 'vitest'
import { INTERRUPTED_RESULT, buildRequestMessages } from './history'
import type { StoredMessage } from './types'

let n = 0
const m = (msg: Omit<StoredMessage, 'id' | 'createdAt'>): StoredMessage => ({ id: `m${n++}`, createdAt: 0, ...msg })

describe('buildRequestMessages', () => {
  it('prepends the system prompt only when it has content, and strips UI-only fields', () => {
    const stored = [m({ role: 'user', content: 'hi', model: 'x' }), m({ role: 'assistant', content: 'hello', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })]
    expect(buildRequestMessages('   ', stored)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(buildRequestMessages('Be terse.', stored)[0]).toEqual({ role: 'system', content: 'Be terse.' })
  })

  it('never replays a failed turn or a harness notice to the model', () => {
    const stored = [
      m({ role: 'user', content: 'hi' }),
      m({ role: 'assistant', content: null, error: 'Out of credits (402)' }),
      m({ role: 'assistant', content: null, notice: 'Stopped after 8 tool rounds.' }),
      m({ role: 'user', content: 'retry' }),
    ]
    expect(buildRequestMessages('', stored).map((x) => x.content)).toEqual(['hi', 'retry'])
  })

  it('repairs a conversation torn mid-run (tab closed while tools ran) so it can continue', () => {
    // Stored state after the tab closed: the assistant asked for two tools, only one result was saved.
    const stored = [
      m({ role: 'user', content: 'time in Tokyo and 2+2?' }),
      m({
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'get_current_time', arguments: '{}' } },
          { id: 't2', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } },
        ],
      }),
      m({ role: 'tool', tool_call_id: 't1', content: '{"local":"…"}' }),
      m({ role: 'user', content: 'hello?' }),
    ]
    const out = buildRequestMessages('', stored)
    expect(out.map((x) => [x.role, x.tool_call_id ?? null])).toEqual([
      ['user', null],
      ['assistant', null],
      ['tool', 't1'],
      ['tool', 't2'],
      ['user', null],
    ])
    expect(out[3]!.content).toBe(INTERRUPTED_RESULT)
  })

  it('drops a tool result whose call no longer exists (e.g. after a failed turn was skipped)', () => {
    const stored = [m({ role: 'user', content: 'hi' }), m({ role: 'tool', tool_call_id: 'ghost', content: 'orphan' }), m({ role: 'assistant', content: 'hello' })]
    expect(buildRequestMessages('', stored).map((x) => x.role)).toEqual(['user', 'assistant'])
  })
})
