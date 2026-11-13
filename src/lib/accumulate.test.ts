import { describe, expect, it } from 'vitest'
import { MessageAccumulator, type StreamChunk } from './accumulate'

const delta = (d: NonNullable<NonNullable<StreamChunk['choices']>[number]['delta']>, finish: string | null = null): StreamChunk => ({
  choices: [{ delta: d, finish_reason: finish }],
})

describe('MessageAccumulator', () => {
  it('concatenates streamed text and records usage from the final chunk', () => {
    const acc = new MessageAccumulator()
    acc.apply(delta({ role: 'assistant', content: 'The answer ' }))
    acc.apply(delta({ content: 'is 42.' }, 'stop'))
    acc.apply({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 } })
    expect(acc.message()).toEqual({ role: 'assistant', content: 'The answer is 42.' })
    expect(acc.finishReason).toBe('stop')
    expect(acc.usage?.total_tokens).toBe(15)
  })

  it('assembles two parallel tool calls whose argument fragments arrive interleaved', () => {
    // The shape OpenAI-compatible providers stream for parallel calls: id + name
    // first, then argument fragments tagged only by index, in any order.
    const acc = new MessageAccumulator()
    acc.apply(delta({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'calculator', arguments: '' } }] }))
    acc.apply(delta({ tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'get_current_time', arguments: '' } }] }))
    acc.apply(delta({ tool_calls: [{ index: 0, function: { arguments: '{"expres' } }] }))
    acc.apply(delta({ tool_calls: [{ index: 1, function: { arguments: '{"timezone":' } }] }))
    acc.apply(delta({ tool_calls: [{ index: 0, function: { arguments: 'sion":"2+2"}' } }] }))
    acc.apply(delta({ tool_calls: [{ index: 1, function: { arguments: '"Asia/Tokyo"}' } }] }, 'tool_calls'))

    const msg = acc.message()
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } },
      { id: 'call_b', type: 'function', function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' } },
    ])
    for (const c of msg.tool_calls!) expect(() => JSON.parse(c.function.arguments)).not.toThrow()
  })

  it('keeps text that precedes a tool call ("Let me calculate that…")', () => {
    const acc = new MessageAccumulator()
    acc.apply(delta({ content: 'Let me check.' }))
    acc.apply(delta({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'notes_list', arguments: '{}' } }] }, 'tool_calls'))
    const msg = acc.message()
    expect(msg.content).toBe('Let me check.')
    expect(msg.tool_calls).toHaveLength(1)
  })

  it('drops half-streamed tool calls when the turn is aborted, so they can never run', () => {
    const acc = new MessageAccumulator()
    acc.apply(delta({ content: 'Working on it' }))
    acc.apply(delta({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'calculator', arguments: '{"expr' } }] }))
    expect(acc.message(true)).toEqual({ role: 'assistant', content: 'Working on it' })
  })
})
