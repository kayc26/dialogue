// Shapes shared by the logic layer (src/lib) and the UI (src/components).
// Message shapes follow the OpenAI-compatible chat format OpenRouter speaks.

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** A message exactly as sent to / received from the API. */
export interface ChatMessage {
  role: Role
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost?: number
}

/** A message as stored in a conversation: the API shape plus UI bookkeeping. */
export interface StoredMessage extends ChatMessage {
  id: string
  createdAt: number
  model?: string
  usage?: Usage
  /** Set when the turn failed; such messages are shown but never sent back to the model. */
  error?: string
  /** A harness-to-user note (e.g. "stopped at the tool-round limit"); shown, never sent to the model. */
  notice?: string
}

export interface Conversation {
  id: string
  title: string
  model: string
  systemPrompt: string
  toolsEnabled: boolean
  messages: StoredMessage[]
  createdAt: number
  updatedAt: number
}

export interface Settings {
  defaultModel: string
}

export interface AppState {
  schemaVersion: 1
  settings: Settings
  conversations: Conversation[]
  activeId: string | null
}

export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** The subset of the Web Storage API the app uses; lets tests pass an in-memory store. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
