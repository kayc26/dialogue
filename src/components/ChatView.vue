<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useApp } from '../composables/useApp'
import { renderMarkdown } from '../lib/markdown'
import MessageItem from './MessageItem.vue'
import ModelPicker from './ModelPicker.vue'

const emit = defineEmits<{ 'toggle-sidebar': []; 'open-settings': [] }>()
const { state, active, run, isRunning, send, stop, apiKey } = useApp()

const draft = ref('')
const showSystem = ref(false)
const scroller = ref<HTMLElement | null>(null)

const runningHere = computed(() => isRunning.value && run.convId === active.value?.id)
const visible = computed(() => (active.value?.messages ?? []).filter((m) => m.role !== 'tool'))
const toolResults = computed(() => {
  const map: Record<string, string> = {}
  for (const m of active.value?.messages ?? []) if (m.role === 'tool' && m.tool_call_id) map[m.tool_call_id] = m.content ?? ''
  return map
})
const streamingHtml = computed(() => (runningHere.value && run.streaming ? renderMarkdown(run.streaming) : ''))

// With no conversation open, the header edits the default for the next new chat.
const model = computed({
  get: () => active.value?.model ?? state.settings.defaultModel,
  set: (v: string) => {
    if (active.value) active.value.model = v
    else state.settings.defaultModel = v
  },
})

async function submit(): Promise<void> {
  if (!draft.value.trim() || isRunning.value) return
  const text = draft.value
  draft.value = ''
  await send(text)
}

function onKeydown(e: KeyboardEvent): void {
  // Enter sends, Shift+Enter is a newline; never send mid-IME composition (e.g. Japanese input).
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void submit()
  }
}

// Follow new output, but only if the reader is already near the bottom.
watch(
  () => [visible.value.length, run.streaming] as const,
  async () => {
    const el = scroller.value
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    await nextTick()
    if (nearBottom) el.scrollTop = el.scrollHeight
  },
)
watch(
  () => active.value?.id,
  async () => {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
)
</script>

<template>
  <section class="chat">
    <header class="bar">
      <button class="menu" aria-label="Conversations" @click="emit('toggle-sidebar')">☰</button>
      <ModelPicker v-model="model" />
      <label v-if="active" class="toggle" title="Let the model call the browser-side tools">
        <input v-model="active.toolsEnabled" type="checkbox" /> Tools
      </label>
      <button v-if="active" class="link" @click="showSystem = !showSystem">
        {{ showSystem ? 'Hide' : 'System prompt' }}{{ !showSystem && active.systemPrompt.trim() ? ' •' : '' }}
      </button>
    </header>

    <div v-if="active && showSystem" class="system">
      <textarea v-model="active.systemPrompt" rows="3" placeholder="Optional instructions sent before every message in this conversation" />
    </div>

    <div ref="scroller" class="scroll">
      <div class="column">
        <div v-if="visible.length === 0 && !runningHere" class="welcome">
          <h1>Harness</h1>
          <p>A chat page that runs entirely in your browser and talks to OpenRouter with your own key. The model can call a few built-in tools: a calculator, the current time, and a notes store.</p>
          <p v-if="!apiKey.trim()">
            <button class="primary" @click="emit('open-settings')">Add your OpenRouter API key</button>
          </p>
        </div>

        <MessageItem v-for="m in visible" :key="m.id" :message="m" :tool-results="toolResults" />

        <div v-if="runningHere" class="live">
          <div v-if="streamingHtml" class="md" v-html="streamingHtml" />
          <div v-else class="thinking">Thinking…</div>
        </div>
      </div>
    </div>

    <form class="composer" @submit.prevent="submit">
      <textarea
        v-model="draft"
        rows="2"
        placeholder="Message (Enter to send, Shift+Enter for a new line)"
        aria-label="Message"
        @keydown="onKeydown"
      />
      <button v-if="runningHere" type="button" @click="stop">Stop</button>
      <button v-else type="submit" class="primary" :disabled="!draft.trim() || isRunning">Send</button>
    </form>
  </section>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.menu {
  display: none;
  padding: 4px 10px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  white-space: nowrap;
}

.link {
  border: none;
  background: none;
  color: var(--accent);
  padding: 4px 2px;
  font-size: 14px;
}

.system {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.column {
  max-width: 780px;
  margin: 0 auto;
  padding: 8px 20px 24px;
}

.welcome {
  margin-top: 12vh;
  color: var(--muted);
}

.welcome h1 {
  color: var(--text);
  font-size: 28px;
  margin: 0 0 8px;
}

.live {
  margin: 14px 0;
}

.thinking {
  color: var(--muted);
  font-style: italic;
}

.md :deep(p) {
  margin: 0 0 0.7em;
}

.md :deep(pre) {
  background: var(--code-bg);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}

.composer {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 10px 20px 16px;
}

.composer textarea {
  resize: vertical;
  min-height: 44px;
  max-height: 40vh;
}

.composer button {
  height: 44px;
  min-width: 72px;
}

@media (max-width: 720px) {
  .menu {
    display: inline-block;
  }

  .column,
  .composer {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
