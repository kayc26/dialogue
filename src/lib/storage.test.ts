import { describe, expect, it } from 'vitest'
import { MemoryStorage } from './__testutils__/memoryStorage'
import { BACKUP_KEY, STATE_KEY, defaultState, exportConversations, loadState, parseImport, saveState } from './storage'
import type { AppState, Conversation } from './types'

const conv = (id: string): Conversation => ({
  id,
  title: `chat ${id}`,
  model: 'openrouter/auto',
  systemPrompt: '',
  toolsEnabled: true,
  messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
  createdAt: 1,
  updatedAt: 1,
})

describe('loadState / saveState', () => {
  it('round-trips conversations', () => {
    const s = new MemoryStorage()
    const state: AppState = { ...defaultState(), conversations: [conv('a')], activeId: 'a' }
    expect(saveState(s, state)).toEqual({ ok: true })
    expect(loadState(s)).toEqual(state)
  })

  it('opens to an empty app on first visit', () => {
    expect(loadState(new MemoryStorage())).toEqual(defaultState())
  })

  it('recovers from corrupt data without crashing, and keeps the raw text as a backup', () => {
    const s = new MemoryStorage()
    s.setItem(STATE_KEY, '{"schemaVersion":1,"conversations":[{"id":') // a write cut off mid-way
    expect(loadState(s)).toEqual(defaultState())
    expect(s.getItem(BACKUP_KEY)).toBe('{"schemaVersion":1,"conversations":[{"id":')
  })

  it('backs up instead of misreading data written by a newer version of the app', () => {
    const s = new MemoryStorage()
    const future = JSON.stringify({ schemaVersion: 99, conversations: [] })
    s.setItem(STATE_KEY, future)
    expect(loadState(s)).toEqual(defaultState())
    expect(s.getItem(BACKUP_KEY)).toBe(future)
  })

  it('keeps the good conversations when one stored conversation is malformed', () => {
    const s = new MemoryStorage()
    s.setItem(STATE_KEY, JSON.stringify({ ...defaultState(), conversations: [conv('a'), { id: 'broken' }], activeId: 'broken' }))
    const loaded = loadState(s)
    expect(loaded.conversations.map((c) => c.id)).toEqual(['a'])
    expect(loaded.activeId).toBeNull() // pointed at the dropped conversation
  })

  it('reports a full browser storage as a readable error instead of throwing', () => {
    const s = new MemoryStorage(200)
    const state: AppState = { ...defaultState(), conversations: [conv('a'), conv('b'), conv('c')] }
    const r = saveState(s, state)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/storage is full/)
  })
})

describe('export / import', () => {
  it('imports an export from another browser, giving colliding ids fresh ones instead of overwriting', () => {
    const file = exportConversations({ ...defaultState(), conversations: [conv('a'), conv('b')] })
    let k = 0
    const imported = parseImport(file, new Set(['a']), () => `new${k++}`)
    expect(imported.map((c) => c.id)).toEqual(['new0', 'b'])
    expect(imported[0]!.messages).toEqual(conv('a').messages)
  })

  it('rejects files that are not Harness exports with a message a person can act on', () => {
    expect(() => parseImport('not json', new Set(), () => 'x')).toThrow('not valid JSON')
    expect(() => parseImport('{"conversations":[]}', new Set(), () => 'x')).toThrow('not a Harness export')
  })
})
