<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApp } from '../composables/useApp'
import ModelPicker from './ModelPicker.vue'

const emit = defineEmits<{ close: [] }>()
const { apiKey, state, exportAll, importFile, storageUsedChars } = useApp()

const draft = ref(apiKey.value)
const reveal = ref(false)
const status = ref('')
const origin = location.origin
const usedKb = ref(0)

const hasKey = computed(() => apiKey.value.trim() !== '')
const dirty = computed(() => draft.value.trim() !== apiKey.value.trim())

onMounted(() => (usedKb.value = Math.round(storageUsedChars() / 1024)))

function saveKey(): void {
  apiKey.value = draft.value.trim()
  status.value = apiKey.value ? 'Key saved in this browser.' : 'Key removed.'
}

function forgetKey(): void {
  apiKey.value = ''
  draft.value = ''
  status.value = 'Key removed from this browser.'
}

async function onImport(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const n = await importFile(file)
    status.value = `Imported ${n} conversation${n === 1 ? '' : 's'}.`
  } catch (err) {
    status.value = err instanceof Error ? err.message : String(err)
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section class="panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">Settings</h2>
        <button aria-label="Close settings" @click="emit('close')">Close</button>
      </header>

      <h3>OpenRouter API key</h3>
      <form class="key-row" @submit.prevent="saveKey">
        <input
          v-model="draft"
          :type="reveal ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-or-v1-…"
          aria-label="OpenRouter API key"
        />
        <button type="button" @click="reveal = !reveal">{{ reveal ? 'Hide' : 'Show' }}</button>
        <button type="submit" class="primary" :disabled="!dirty">Save</button>
      </form>
      <button v-if="hasKey" class="forget" @click="forgetKey">Forget key</button>

      <div class="explain">
        <p>
          Your key is stored only in this browser's <code>localStorage</code>, and requests go straight from this page to
          OpenRouter. There is no server in between. It never enters the code or the repo.
        </p>
        <p>
          <strong>Use a dedicated key with a credit limit.</strong> Storage belongs to the whole site
          <code>{{ origin }}</code>, so other pages served from that address can read it.
          Create one at <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/settings/keys</a>.
        </p>
      </div>

      <h3>Default model for new chats</h3>
      <ModelPicker v-model="state.settings.defaultModel" />

      <h3>Your data</h3>
      <p class="explain">
        About {{ usedKb }} KB of this site's ~5 MB browser storage is in use (shared by every app on {{ origin }}).
      </p>
      <div class="data-row">
        <button @click="exportAll">Export conversations</button>
        <label class="import">
          Import…
          <input type="file" accept="application/json,.json" @change="onImport" />
        </label>
      </div>

      <p v-if="status" class="status" role="status">{{ status }}</p>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgb(0 0 0 / 0.4);
  display: grid;
  place-items: center;
  padding: 16px;
}

.panel {
  background: var(--panel);
  border-radius: 14px;
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 18px 22px 22px;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.25);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 20px;
}

h3 {
  font-size: 15px;
  margin: 22px 0 8px;
}

.key-row {
  display: flex;
  gap: 8px;
}

.key-row input {
  font-family: var(--mono);
  font-size: 13px;
}

.forget {
  margin-top: 8px;
  color: var(--danger);
}

.explain {
  color: var(--muted);
  font-size: 13.5px;
}

.explain p {
  margin: 10px 0 0;
}

code {
  font-family: var(--mono);
  font-size: 0.92em;
}

.data-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.import {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
}

.import:hover {
  border-color: var(--accent);
}

.import input {
  display: none;
}

.status {
  margin: 16px 0 0;
  font-size: 14px;
}
</style>
