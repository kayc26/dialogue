// The v1 tool set (ADR-0003): everything runs in the browser.
// Each tool returns a string for the model; failures are returned as
// "Error: …" strings rather than thrown, so the model can read them and recover.
//
// Deliberately absent: fetch_url (ADR-0003 records why — CORS limits it, and it
// would let a prompt-injected model send conversation content anywhere).

import { calculate } from './calc'
import type { KeyValueStore, ToolCall, ToolSpec } from './types'

export const NOTES_KEY = 'harness.notes.v1'
export const MAX_NOTE_CHARS = 20_000

interface Note {
  content: string
  updatedAt: number
}

export class NotesStore {
  constructor(private readonly storage: KeyValueStore) {}

  private all(): Record<string, Note> {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(NOTES_KEY) ?? '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, Note>) : {}
    } catch {
      return {}
    }
  }

  write(title: string, content: string): void {
    const notes = this.all()
    notes[title] = { content, updatedAt: Date.now() }
    this.storage.setItem(NOTES_KEY, JSON.stringify(notes))
  }

  read(title: string): string | null {
    const notes = this.all()
    return Object.hasOwn(notes, title) ? (notes[title]?.content ?? null) : null
  }

  list(): Array<{ title: string; updatedAt: number; chars: number }> {
    return Object.entries(this.all())
      .map(([title, n]) => ({ title, updatedAt: n.updatedAt, chars: n.content.length }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export interface ToolContext {
  notes: NotesStore
  now: () => Date
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'calculator',
      description:
        'Evaluate an arithmetic expression exactly. Supports + - * / % ^ (or **), parentheses, the constants pi and e, and the functions sqrt, cbrt, abs, sin, cos, tan, asin, acos, atan, ln, log (base 10), log2, exp, floor, ceil, round, pow(x, y), min(...), max(...). Use it for any arithmetic instead of computing in your head.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'e.g. "(3.5 + 2) * sqrt(16) / 7"' } },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: "Get the current date and time, in the user's local time zone or a given IANA time zone.",
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'Optional IANA zone such as "America/New_York" or "Asia/Tokyo".' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notes_write',
      description: "Save a note under a title in the user's browser, overwriting any note with the same title. Notes persist across conversations.",
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' }, content: { type: 'string' } },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notes_read',
      description: 'Read a saved note by its exact title.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notes_list',
      description: 'List the titles of all saved notes, most recently updated first.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export async function runTool(call: ToolCall, ctx: ToolContext): Promise<string> {
  const name = call.function.name
  let args: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(call.function.arguments.trim() || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('arguments must be a JSON object')
    args = parsed as Record<string, unknown>
  } catch (err) {
    return `Error: the arguments for ${name} were not valid JSON (${err instanceof Error ? err.message : String(err)}).`
  }

  try {
    switch (name) {
      case 'calculator':
        return calculate(requireString(args, 'expression'))
      case 'get_current_time':
        return currentTime(ctx.now(), optionalString(args, 'timezone'))
      case 'notes_write': {
        const title = requireString(args, 'title').trim()
        const content = requireString(args, 'content')
        if (!title) return 'Error: title must not be empty.'
        if (content.length > MAX_NOTE_CHARS) return `Error: note is ${content.length} characters; the limit is ${MAX_NOTE_CHARS}.`
        ctx.notes.write(title, content)
        return `Saved note "${title}" (${content.length} characters).`
      }
      case 'notes_read': {
        const title = requireString(args, 'title').trim()
        const content = ctx.notes.read(title)
        return content ?? `Error: no note titled "${title}". Use notes_list to see what exists.`
      }
      case 'notes_list': {
        const list = ctx.notes.list()
        return list.length ? JSON.stringify(list.map((n) => n.title)) : 'No notes saved yet.'
      }
      default:
        return `Error: unknown tool "${name}". Available tools: ${TOOL_SPECS.map((t) => t.function.name).join(', ')}.`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string') throw new Error(`missing required string argument "${key}"`)
  return v
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function currentTime(now: Date, timezone?: string): string {
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: timezone })
  } catch {
    throw new Error(`unknown time zone "${timezone}"`)
  }
  return JSON.stringify({
    iso_utc: now.toISOString(),
    local: fmt.format(now),
    timezone: fmt.resolvedOptions().timeZone,
  })
}
