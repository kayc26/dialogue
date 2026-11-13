<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ChatView from './components/ChatView.vue'
import ConversationList from './components/ConversationList.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useApp } from './composables/useApp'

const { apiKey, saveError, loadModels, newConversation } = useApp()
const hasKey = computed(() => apiKey.value.trim() !== '')
// First visit with no key: open Settings straight away.
const showSettings = ref(!hasKey.value)
const sidebarOpen = ref(false)

onMounted(loadModels)

function startChat(): void {
  newConversation()
  sidebarOpen.value = false
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="brand-row">
        <span class="brand">Harness</span>
        <button class="primary" @click="startChat">New chat</button>
      </div>
      <ConversationList class="list" @picked="sidebarOpen = false" />
      <div class="sidebar-foot">
        <button @click="showSettings = true">Settings</button>
        <span v-if="!hasKey" class="no-key">No API key</span>
      </div>
    </aside>

    <div v-if="sidebarOpen" class="scrim" @click="sidebarOpen = false" />

    <main class="main">
      <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>
      <ChatView @toggle-sidebar="sidebarOpen = !sidebarOpen" @open-settings="showSettings = true" />
    </main>

    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 270px 1fr;
  height: 100%;
}

.sidebar {
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
}

.brand {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}

.no-key {
  color: var(--danger);
  font-size: 13px;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.save-error {
  margin: 0;
  padding: 8px 16px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 14px;
}

.scrim {
  display: none;
}

@media (max-width: 720px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(300px, 85vw);
    z-index: 20;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .sidebar.open {
    transform: none;
  }

  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgb(0 0 0 / 0.35);
  }
}
</style>
