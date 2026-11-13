<script setup lang="ts">
import { computed, useId } from 'vue'
import { useApp } from '../composables/useApp'

const model = defineModel<string>({ required: true })
const { models, modelsError, modelInfo } = useApp()
const listId = useId()

const info = computed(() => modelInfo(model.value))
const toolsLabel = computed(() => {
  if (!models.value.length) return ''
  if (!info.value) return model.value === 'openrouter/auto' ? 'auto-routed' : 'unknown model'
  return info.value.supportsTools ? 'supports tools' : 'no tool support'
})

function commit(e: Event): void {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v) model.value = v
}
</script>

<template>
  <span class="picker">
    <input
      :list="listId"
      :value="model"
      aria-label="Model"
      placeholder="provider/model"
      spellcheck="false"
      @change="commit"
    />
    <datalist :id="listId">
      <option value="openrouter/auto">Auto (OpenRouter picks)</option>
      <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}{{ m.supportsTools ? ' · tools' : '' }}</option>
    </datalist>
    <span
      v-if="toolsLabel"
      class="badge"
      :class="{ good: info?.supportsTools, bad: info && !info.supportsTools }"
    >{{ toolsLabel }}</span>
    <span v-else-if="modelsError" class="badge bad" :title="modelsError">model list unavailable</span>
  </span>
</template>

<style scoped>
.picker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

input {
  width: 260px;
  max-width: 50vw;
  font-family: var(--mono);
  font-size: 13px;
  padding: 5px 8px;
}

.badge {
  font-size: 12px;
  white-space: nowrap;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}

.badge.good {
  color: var(--accent);
  border-color: var(--accent);
}

.badge.bad {
  color: var(--danger);
  border-color: var(--danger);
}
</style>
