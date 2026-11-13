// App-wide state: conversations, the API key, the model list, and the running
// agent turn. One shared instance (module-level), used by every component.
// All logic worth testing lives in src/lib; this file only wires it to Vue.

import { computed, reactive, ref, watch } from 'vue'
import { MAX_TOOL_ROUNDS, runAgent } from '../lib/agent'
import { buildRequestMessages } from '../lib/history'
import { completeChat, listModels, type ModelInfo } from '../lib/openrouter'
import { exportConversations, loadApiKey, loadState, parseImport, saveApiKey, saveState } from '../lib/storage'
import { NotesStore, TOOL_SPECS, runTool } from '../lib/tools'
import type { ChatMessage, Conversation, KeyValueStore, StoredMessage, Usage } from '../lib/types'

// ---------- storage (with a fallback for browsers that block it) ----------

function openStorage(): { store: KeyValueStore; persistent: boolean } {
  try {
    const s = window.localStorage
    s.getItem('harness.probe')
    return { store: s, persistent: true }
  } catch {
    const mem = new Map<string, string>()
    return {
      store: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
        removeItem: (k) => void mem.delete(k),
      },
      persistent: false,
    }
  }
}

const { store, persistent } = openStorage()
const uid = () => crypto.randomUUID()

const state = reactive(loadState(store))
const apiKey = ref(loadApiKey(store))
const saveError = ref<string | null>(persistent ? null : 'This browser is blocking localStorage, so nothing will be saved after you close the tab.')

let saveTimer: ReturnType<typeof setTimeout> | undefined
function flush(): void {
  clearTimeout(saveTimer)
  if (!persistent) return
  const r = saveState(store, state)
  saveError.value = r.ok ? null : r.error
}
watch(state, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 300)
}, { deep: true })
watch(apiKey, (k) => saveApiKey(store, k.trim()))
window.addEventListener('beforeunload', flush)

// ---------- models ----------

const models = ref<ModelInfo[]>([])
const modelsError = ref('')
let modelsRequested = false

async function loadModels(): Promise<void> {
  if (modelsRequested) return
  modelsRequested = true
  try {
    models.value = (await listModels()).sort((a, b) => a.id.localeCompare(b.id))
    modelsError.value = ''
  } catch (err) {
    modelsRequested = false
    modelsError.value = err instanceof Error ? err.message : String(err)
  }
}

function modelInfo(id: string): ModelInfo | undefined {
  return models.value.find((m) => m.id === id)
}

// ---------- conversations ----------

const active = computed<Conversation | null>(() => state.conversations.find((c) => c.id === state.activeId) ?? null)

function newConversation(): Conversation {
  const now = Date.now()
  state.conversations.unshift({
    id: uid(),
    title: 'New chat',
    model: state.settings.defaultModel,
    systemPrompt: '',
    toolsEnabled: true,
    messages: [],
    createdAt: now,
    updatedAt: now,
  })
  const conv = state.conversations[0]! // the reactive proxy, so later mutations re-render
  state.activeId = conv.id
  return conv
}

function selectConversation(id: string): void {
  state.activeId = id
}

function deleteConversation(id: string): void {
  if (run.convId === id) stop()
  const i = state.conversations.findIndex((c) => c.id === id)
  if (i !== -1) state.conversations.splice(i, 1)
  if (state.activeId === id) state.activeId = state.conversations[0]?.id ?? null
}

// ---------- running a turn ----------

const run = reactive({
  convId: null as string | null,
  streaming: '',
  controller: null as AbortController | null,
})
const isRunning = computed(() => run.controller !== null)

function toStored(msg: ChatMessage, model: string, usage?: Usage): StoredMessage {
  return { ...msg, id: uid(), createdAt: Date.now(), model: msg.role === 'assistant' ? model : undefined, usage }
}

async function send(text: string): Promise<void> {
  const content = text.trim()
  if (!content || isRunning.value) return
  const conv = active.value ?? newConversation()

  if (!apiKey.value.trim()) {
    conv.messages.push({ id: uid(), role: 'assistant', content: null, createdAt: Date.now(), error: 'Add your OpenRouter API key in Settings first.' })
    return
  }

  conv.messages.push({ id: uid(), role: 'user', content, createdAt: Date.now() })
  if (conv.title === 'New chat') conv.title = content.length > 48 ? `${content.slice(0, 48)}…` : content
  conv.updatedAt = Date.now()

  const controller = new AbortController()
  run.controller = controller
  run.convId = conv.id
  run.streaming = ''
  const model = conv.model
  const notes = new NotesStore(store)

  try {
    const outcome = await runAgent({
      history: buildRequestMessages(conv.systemPrompt, conv.messages),
      tools: conv.toolsEnabled ? TOOL_SPECS : undefined,
      signal: controller.signal,
      complete: (messages, tools, onContent) =>
        completeChat({ apiKey: apiKey.value.trim(), model, messages, tools, signal: controller.signal, onContent }),
      runTool: (call) => runTool(call, { notes, now: () => new Date() }),
      emit: (e) => {
        if (e.type === 'assistant_delta') {
          run.streaming = e.content
          return
        }
        run.streaming = ''
        const m = e.message
        // An aborted turn can end with nothing to show; don't store an empty bubble.
        if (m.role === 'assistant' && !m.content && !m.tool_calls?.length) return
        conv.messages.push(toStored(m, model, e.type === 'assistant_message' ? e.usage : undefined))
        conv.updatedAt = Date.now()
      },
    })
    if (outcome === 'round_limit') {
      conv.messages.push({
        id: uid(),
        role: 'assistant',
        content: null,
        createdAt: Date.now(),
        notice: `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls, so a looping model can't spend credit unattended. Send a message to let it continue.`,
      })
    }
  } catch (err) {
    conv.messages.push({
      id: uid(),
      role: 'assistant',
      content: null,
      createdAt: Date.now(),
      model,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    run.controller = null
    run.convId = null
    run.streaming = ''
    flush()
  }
}

function stop(): void {
  run.controller?.abort()
}

// ---------- export / import / usage ----------

function exportAll(): void {
  const blob = new Blob([exportConversations(state)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `harness-conversations-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function importFile(file: File): Promise<number> {
  const added = parseImport(await file.text(), new Set(state.conversations.map((c) => c.id)), uid)
  state.conversations.unshift(...added)
  return added.length
}

/** Characters stored by EVERY app on this origin — the ~5 MB budget is shared (ADR-0001). */
function storageUsedChars(): number {
  if (!persistent) return 0
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) ?? ''
    total += k.length + (localStorage.getItem(k)?.length ?? 0)
  }
  return total
}

export function useApp() {
  return {
    state,
    apiKey,
    saveError,
    models,
    modelsError,
    loadModels,
    modelInfo,
    active,
    newConversation,
    selectConversation,
    deleteConversation,
    run,
    isRunning,
    send,
    stop,
    exportAll,
    importFile,
    storageUsedChars,
  }
}
