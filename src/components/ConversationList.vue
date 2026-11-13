<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../composables/useApp'

const emit = defineEmits<{ picked: [] }>()
const { state, selectConversation, deleteConversation, run } = useApp()

const sorted = computed(() => [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt))

function pick(id: string): void {
  selectConversation(id)
  emit('picked')
}

function remove(id: string, title: string): void {
  if (confirm(`Delete "${title}"? This can't be undone (unless you exported it).`)) deleteConversation(id)
}
</script>

<template>
  <nav aria-label="Conversations">
    <p v-if="sorted.length === 0" class="empty">No conversations yet.</p>
    <ul>
      <li v-for="c in sorted" :key="c.id" :class="{ active: c.id === state.activeId }">
        <button class="item" :title="c.title" @click="pick(c.id)">
          <span class="title">{{ c.title }}</span>
          <span v-if="run.convId === c.id" class="dot" aria-label="running" />
        </button>
        <button class="delete" :aria-label="`Delete ${c.title}`" title="Delete" @click="remove(c.id, c.title)">×</button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.empty {
  color: var(--muted);
  font-size: 14px;
  padding: 0 14px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0 8px;
}

li {
  display: flex;
  align-items: center;
  border-radius: 8px;
}

li.active,
li:hover {
  background: var(--panel);
}

.item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  text-align: left;
  padding: 7px 8px;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
}

.delete {
  border: none;
  background: none;
  color: var(--muted);
  padding: 4px 9px;
  visibility: hidden;
}

li:hover .delete,
li.active .delete,
.delete:focus-visible {
  visibility: visible;
}
</style>
