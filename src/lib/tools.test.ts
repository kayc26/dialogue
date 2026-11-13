import { describe, expect, it } from 'vitest'
import { MemoryStorage } from './__testutils__/memoryStorage'
import { MAX_NOTE_CHARS, NotesStore, TOOL_SPECS, runTool, type ToolContext } from './tools'
import type { ToolCall } from './types'

const ctx = (): ToolContext => ({ notes: new NotesStore(new MemoryStorage()), now: () => new Date('2026-11-12T15:30:00Z') })
const call = (name: string, args: string): ToolCall => ({ id: 'c', type: 'function', function: { name, arguments: args } })

describe('runTool', () => {
  it('every advertised tool is actually handled (no spec without an implementation)', async () => {
    const c = ctx()
    for (const spec of TOOL_SPECS) {
      const out = await runTool(call(spec.function.name, '{}'), c)
      expect(out).not.toMatch(/unknown tool/)
    }
  })

  it('returns calculator results and calculator errors as text the model can read', async () => {
    expect(await runTool(call('calculator', '{"expression":"6*7"}'), ctx())).toBe('42')
    expect(await runTool(call('calculator', '{"expression":"1/0"}'), ctx())).toBe('Error: Division by zero')
  })

  it('reports invalid JSON arguments back to the model instead of throwing', async () => {
    const out = await runTool(call('calculator', '{"expression": "1+1"'), ctx())
    expect(out).toMatch(/^Error: the arguments for calculator were not valid JSON/)
  })

  it('treats empty arguments as {} — some models send "" for no-argument tools', async () => {
    expect(await runTool(call('notes_list', ''), ctx())).toBe('No notes saved yet.')
  })

  it('names the available tools when the model invents one', async () => {
    expect(await runTool(call('fetch_url', '{"url":"https://example.com"}'), ctx())).toMatch(/unknown tool "fetch_url".*calculator/)
  })

  it('notes persist across calls: write, list, read', async () => {
    const c = ctx()
    await runTool(call('notes_write', '{"title":"groceries","content":"eggs, milk"}'), c)
    expect(await runTool(call('notes_list', '{}'), c)).toBe('["groceries"]')
    expect(await runTool(call('notes_read', '{"title":"groceries"}'), c)).toBe('eggs, milk')
    expect(await runTool(call('notes_read', '{"title":"nope"}'), c)).toMatch(/no note titled "nope"/)
  })

  it('refuses a note over the size limit rather than filling the shared localStorage', async () => {
    const big = JSON.stringify({ title: 'big', content: 'x'.repeat(MAX_NOTE_CHARS + 1) })
    expect(await runTool(call('notes_write', big), ctx())).toMatch(/limit is/)
  })

  it('get_current_time honors a requested time zone and rejects an unknown one', async () => {
    const tokyo = JSON.parse(await runTool(call('get_current_time', '{"timezone":"Asia/Tokyo"}'), ctx()))
    expect(tokyo.timezone).toBe('Asia/Tokyo')
    expect(tokyo.iso_utc).toBe('2026-11-12T15:30:00.000Z')
    expect(tokyo.local).toMatch(/November 13, 2026/) // already the next day in Tokyo
    expect(await runTool(call('get_current_time', '{"timezone":"Mars/Olympus"}'), ctx())).toMatch(/unknown time zone/)
  })
})
