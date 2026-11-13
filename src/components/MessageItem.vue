<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'
import type { StoredMessage } from '../lib/types'

const props = defineProps<{
  message: StoredMessage
  /** tool_call_id → result text, so each call card can show its own result. */
  toolResults: Record<string, string>
}>()

// Sanitized in renderMarkdown (src/lib/markdown.ts) — the only v-html in the app.
const html = computed(() => (props.message.role === 'assistant' && props.message.content ? renderMarkdown(props.message.content) : ''))

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

const meta = computed(() => {
  const m = props.message
  if (m.role !== 'assistant' || !m.model) return ''
  const parts = [m.model]
  if (m.usage) parts.push(`${m.usage.prompt_tokens} in · ${m.usage.completion_tokens} out`)
  if (typeof m.usage?.cost === 'number') parts.push(`$${m.usage.cost.toFixed(m.usage.cost < 0.01 ? 5 : 3)}`)
  return parts.join(' · ')
})
</script>

<template>
  <div v-if="message.role === 'user'" class="row user">
    <div class="bubble">{{ message.content }}</div>
  </div>

  <div v-else-if="message.error" class="row">
    <div class="alert error" role="alert">{{ message.error }}</div>
  </div>

  <div v-else-if="message.notice" class="row">
    <div class="alert notice">{{ message.notice }}</div>
  </div>

  <div v-else-if="message.role === 'assistant'" class="row assistant">
    <div v-if="html" class="md" v-html="html" />
    <details v-for="call in message.tool_calls ?? []" :key="call.id" class="tool">
      <summary>
        <span class="tool-name">{{ call.function.name }}</span>
        <span v-if="toolResults[call.id] === undefined" class="pending">running…</span>
        <span v-else class="preview">→ {{ toolResults[call.id] }}</span>
      </summary>
      <div class="tool-body">
        <div class="label">Arguments</div>
        <pre>{{ pretty(call.function.arguments) }}</pre>
        <template v-if="toolResults[call.id] !== undefined">
          <div class="label">Result</div>
          <pre>{{ pretty(toolResults[call.id]!) }}</pre>
        </template>
      </div>
    </details>
    <div v-if="meta" class="meta">{{ meta }}</div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 14px 0;
}

.user {
  align-items: flex-end;
}

.bubble {
  background: var(--user-bubble);
  border-radius: var(--radius);
  padding: 8px 12px;
  max-width: 85%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.md {
  overflow-wrap: anywhere;
}

.md :deep(p) {
  margin: 0 0 0.7em;
}

.md :deep(p:last-child) {
  margin-bottom: 0;
}

.md :deep(pre) {
  background: var(--code-bg);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}

.md :deep(code) {
  font-family: var(--mono);
  font-size: 0.9em;
}

.md :deep(:not(pre) > code) {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 1px 4px;
}

.md :deep(table) {
  border-collapse: collapse;
}

.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
}

.tool {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  font-size: 14px;
}

.tool summary {
  cursor: pointer;
  padding: 6px 10px;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.tool-name {
  font-family: var(--mono);
  font-weight: 600;
  flex: none;
}

.tool-name::before {
  content: 'tool · ';
  font-weight: 400;
  color: var(--muted);
}

.preview,
.pending {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-body {
  border-top: 1px solid var(--border);
  padding: 6px 10px 10px;
}

.label {
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.tool-body pre {
  margin: 4px 0 0;
  background: var(--code-bg);
  border-radius: 6px;
  padding: 8px;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.meta {
  font-size: 12px;
  color: var(--muted);
}

.alert {
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
}

.error {
  background: var(--danger-bg);
  color: var(--danger);
}

.notice {
  background: var(--notice-bg);
}
</style>
