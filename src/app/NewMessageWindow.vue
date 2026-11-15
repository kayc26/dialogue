<script setup lang="ts">
// The portal's docked window, holding the Diabetes Assistant (ADR-0004). It opens
// straight from the Message Center's one button (QST-PORTAL-SHORTCUT: C, Kay): the
// real portal's Send a message → Contact your care team → disclaimer → question-type
// steps aren't built. The yellow banner carries the "not for emergencies" message on
// every visit. It docks above the fixed "Get help now" button so it never covers it,
// expands to a large centered panel, and fills the screen on phones.
import { nextTick, onMounted, ref } from 'vue'
import type { DataClient } from '../lib/neon/data'
import PatientView from './PatientView.vue'

defineProps<{ data: Required<DataClient> }>()
const emit = defineEmits<{ close: [] }>()

const minimized = ref(false)
const expanded = ref(false)
const title = ref<HTMLElement | null>(null)

onMounted(async () => {
  await nextTick()
  title.value?.focus() // screen readers hear where they are
})
</script>

<template>
  <div class="scrim" aria-hidden="true" />
  <section :class="['win', { min: minimized, big: expanded }]" role="dialog" aria-labelledby="win-title">
    <header class="bar">
      <h2 id="win-title" ref="title" tabindex="-1">Diabetes Assistant</h2>
      <span class="spacer" />
      <button type="button" class="icon" :aria-label="minimized ? 'Open the window' : 'Minimize'" @click="minimized = !minimized">
        {{ minimized ? '▴' : '–' }}
      </button>
      <button v-if="!minimized" type="button" class="icon wide" :aria-label="expanded ? 'Make the window smaller' : 'Make the window bigger'" @click="expanded = !expanded">
        {{ expanded ? '⤡' : '⤢' }}
      </button>
      <button type="button" class="icon" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <div v-show="!minimized" class="body">
      <div class="disclaimer">
        This assistant is AI and can be wrong. It does not give medical advice or insulin doses. Messages are not for
        emergencies: use <strong>Get help now</strong> or call 911.
      </div>
      <PatientView :data="data" />
    </div>
  </section>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(10, 20, 40, 0.35);
}
/* docked bottom-right like the portal's window, but ABOVE the fixed help button */
.win {
  position: fixed;
  z-index: 950;
  right: 1rem;
  bottom: 5.25rem;
  width: min(34rem, calc(100vw - 2rem));
  height: min(46rem, calc(100vh - 10.5rem)); /* clears the top bar above and the help button below */
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
/* expanded: a large panel centered over the dimmed page, its bottom edge above the help button */
.win.big {
  right: auto;
  left: 50%;
  top: 8vh;
  bottom: auto;
  transform: translateX(-50%);
  width: min(64rem, calc(100vw - 2rem));
  height: min(78vh, calc(92vh - 6rem));
  border-radius: 4px;
}
.win.min {
  height: auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.4rem 0.25rem 0.75rem;
  background: var(--accent);
  color: var(--accent-text);
}
.bar h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.bar h2:focus {
  outline: none;
}
.spacer {
  flex: 1;
}
.icon {
  min-width: 2.6rem;
  min-height: 2.6rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
}
.icon:hover {
  background: rgba(255, 255, 255, 0.15);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--window);
}
.disclaimer {
  background: #fff6df;
  color: #6b4e00;
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
}
@media (prefers-color-scheme: dark) {
  .disclaimer {
    background: #3a3220;
    color: #f5dc9a;
  }
}
/* phones: the window is the whole screen, above the help button */
@media (max-width: 700px) {
  .win,
  .win.big {
    right: 0;
    left: 0;
    top: 0;
    bottom: 4.6rem;
    width: auto;
    height: auto;
    border-radius: 0;
  }
  .win.min {
    top: auto;
  }
  .wide {
    display: none;
  }
}
</style>
