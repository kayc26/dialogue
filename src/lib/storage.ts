// Persistence in localStorage (ADR-0001, ADR-0003).
//
// Two rules:
// 1. Loading never crashes the page. Corrupt or unreadable data falls back to
//    an empty state — and the raw text is kept under a backup key first, so a
//    bad write never silently destroys someone's history.
// 2. The API key lives under its own key, outside the app state, so exporting
//    conversations can never include it.

import type { AppState, Conversation, KeyValueStore, StoredMessage } from './types'

export const STATE_KEY = 'harness.state'
export const BACKUP_KEY = 'harness.state.unreadable-backup'
export const API_KEY_KEY = 'harness.apiKey'
export const SCHEMA_VERSION = 1
export const DEFAULT_MODEL = 'openrouter/auto'

export function defaultState(): AppState {
  return { schemaVersion: SCHEMA_VERSION, settings: { defaultModel: DEFAULT_MODEL }, conversations: [], activeId: null }
}

export function loadState(storage: KeyValueStore): AppState {
  const raw = storage.getItem(STATE_KEY)
  if (raw === null) return defaultState()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return preserveAndReset(storage, raw)
  }
  const state = migrate(parsed)
  return state ?? preserveAndReset(storage, raw)
}

function preserveAndReset(storage: KeyValueStore, raw: string): AppState {
  try {
    storage.setItem(BACKUP_KEY, raw)
  } catch {
    // storage full: nothing more we can do without losing data, so leave the original in place
  }
  return defaultState()
}

/** Accepts any stored shape this app has ever written; returns null for anything it can't trust. */
export function migrate(data: unknown): AppState | null {
  if (!isObject(data)) return null
  if (data.schemaVersion !== SCHEMA_VERSION) return null // future versions add cases here
  const settings = isObject(data.settings) ? data.settings : {}
  const conversations = Array.isArray(data.conversations) ? data.conversations.filter(isConversation) : []
  const activeId = typeof data.activeId === 'string' && conversations.some((c) => c.id === data.activeId) ? data.activeId : null
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { defaultModel: typeof settings.defaultModel === 'string' && settings.defaultModel ? settings.defaultModel : DEFAULT_MODEL },
    conversations,
    activeId,
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export function saveState(storage: KeyValueStore, state: AppState): SaveResult {
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (err) {
    const quota = err instanceof DOMException ? err.name === 'QuotaExceededError' : /quota/i.test(String(err))
    return {
      ok: false,
      error: quota
        ? 'Browser storage is full, so recent changes are not being saved. Export your conversations, then delete some.'
        : `Could not save: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export function loadApiKey(storage: KeyValueStore): string {
  return storage.getItem(API_KEY_KEY) ?? ''
}

export function saveApiKey(storage: KeyValueStore, key: string): void {
  if (key) storage.setItem(API_KEY_KEY, key)
  else storage.removeItem(API_KEY_KEY)
}

// ---------- export / import ----------

export interface ExportFile {
  app: 'harness'
  exportVersion: 1
  exportedAt: string
  conversations: Conversation[]
}

export function exportConversations(state: AppState, now = new Date()): string {
  const file: ExportFile = { app: 'harness', exportVersion: 1, exportedAt: now.toISOString(), conversations: state.conversations }
  return JSON.stringify(file, null, 2)
}

/**
 * Parses an export file and returns the conversations to add. Conversations whose id
 * already exists get a fresh id, so importing never overwrites what's there.
 */
export function parseImport(text: string, existingIds: Set<string>, newId: () => string): Conversation[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isObject(data) || data.app !== 'harness' || !Array.isArray(data.conversations)) {
    throw new Error('That file is not a Harness export.')
  }
  const convs = data.conversations.filter(isConversation)
  if (convs.length === 0) throw new Error('The file contains no readable conversations.')
  return convs.map((c) => (existingIds.has(c.id) ? { ...c, id: newId() } : c))
}

// ---------- shape checks ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isMessage(v: unknown): v is StoredMessage {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    (v.role === 'user' || v.role === 'assistant' || v.role === 'tool' || v.role === 'system') &&
    (typeof v.content === 'string' || v.content === null)
  )
}

function isConversation(v: unknown): v is Conversation {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.model === 'string' &&
    typeof v.systemPrompt === 'string' &&
    typeof v.toolsEnabled === 'boolean' &&
    Array.isArray(v.messages) &&
    v.messages.every(isMessage) &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  )
}
