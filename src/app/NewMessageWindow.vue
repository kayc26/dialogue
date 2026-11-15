<script setup lang="ts">
// The portal's docked "New message" window (ADR-0004: Kay's screenshots of the real
// portal's flow). Send a message → Contact your care team → disclaimer → "What type of
// medical question?" → Non-urgent medical question → the Diabetes Assistant. Every
// other option is static and says so. The disclaimer is in this project's own words; no
// portal vendor or health-system names. It docks above the fixed "Get help now" button
// so it never covers it, and fills the screen on phones.
import { nextTick, ref, watch } from 'vue'
import type { DataClient } from '../lib/neon/data'
import PatientView from './PatientView.vue'

type Step = 'menu' | 'disclaimer' | 'type' | 'assistant'

const props = defineProps<{ data: Required<DataClient>; start: Step }>()
const emit = defineEmits<{ close: [] }>()

const step = ref<Step>(props.start)
const trail = ref<Step[]>([])
const minimized = ref(false)
const expanded = ref(false)
const notice = ref('')
const title = ref<HTMLElement | null>(null)

const TITLES: Record<Step, string> = {
  menu: 'New message',
  disclaimer: 'Before you continue',
  type: 'Contact your care team',
  assistant: 'Diabetes Assistant',
}

function go(next: Step): void {
  trail.value.push(step.value)
  step.value = next
  notice.value = ''
}
function back(): void {
  const prev = trail.value.pop()
  if (prev) step.value = prev
  notice.value = ''
}
function notInDemo(name: string): void {
  notice.value = `“${name}” is part of the portal, but it isn't included in this demo.`
}

watch(step, async () => {
  await nextTick()
  title.value?.focus() // screen readers hear where they are after each step
})

const MENU = [
  { icon: '📅', name: 'Schedule an appointment', text: 'Ask to book a visit with your care team.' },
  { icon: '💊', name: 'Refill a medication', text: 'Ask for a refill of a medicine on your list.' },
  { icon: '💲', name: 'Billing help', text: 'Questions about a bill.' },
] as const
const TYPES = [
  'Prescription question',
  'Test results question',
  'Appointment question',
  'Attach a document or photo',
  'Referral or pre-authorization request',
] as const
</script>

<template>
  <div class="scrim" aria-hidden="true" />
  <section
    :class="['win', { min: minimized, big: expanded, chat: step === 'assistant' }]"
    role="dialog"
    aria-labelledby="win-title"
  >
    <header class="bar">
      <button v-if="trail.length && !minimized" type="button" class="icon" aria-label="Back" @click="back">←</button>
      <h2 id="win-title" ref="title" tabindex="-1">{{ TITLES[step] }}</h2>
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
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div v-if="step === 'menu'" class="pad">
        <h3>What would you like to do?</h3>
        <ul class="options menu">
          <li v-for="m in MENU" :key="m.name">
            <button type="button" class="option static" @click="notInDemo(m.name)">
              <span class="oi" aria-hidden="true">{{ m.icon }}</span>
              <span><strong>{{ m.name }}</strong><span>{{ m.text }}</span></span>
              <span class="chev" aria-hidden="true">→</span>
            </button>
          </li>
          <li>
            <button type="button" class="option" @click="go('disclaimer')">
              <span class="oi" aria-hidden="true">💬</span>
              <span><strong>Contact your care team</strong><span>Ask a non-urgent question.</span></span>
              <span class="chev" aria-hidden="true">→</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-else-if="step === 'disclaimer'" class="pad">
        <h3>Messages are not for emergencies</h3>
        <ul class="rules">
          <li><strong>In an emergency, call 911</strong>, or use the red <strong>Get help now</strong> button.</li>
          <li>If you need help <strong>today</strong>, call the nurse line.</li>
          <li>Messages are for questions that can wait. Your care team may take a few business days to reply.</li>
          <li>In this demo, the Diabetes Assistant answers first, from approved diabetes education material. It never gives insulin or medicine doses.</li>
        </ul>
        <p class="confirm">Choosing <strong>Yes</strong> means your question is not urgent.</p>
        <div class="actions">
          <button type="button" class="primary" @click="go('type')">Yes, it's not urgent</button>
          <button type="button" class="secondary" @click="trail.length ? back() : emit('close')">No, go back</button>
        </div>
      </div>

      <div v-else-if="step === 'type'" class="pad">
        <h3>What type of medical question?</h3>
        <ul class="options compact">
          <li>
            <button type="button" class="option" @click="go('assistant')">
              <span><strong>Non-urgent medical question</strong><span>Ask the Diabetes Assistant</span></span>
              <span class="chev" aria-hidden="true">→</span>
            </button>
          </li>
          <li v-for="t in TYPES" :key="t">
            <button type="button" class="option static" @click="notInDemo(t)">
              <span><strong>{{ t }}</strong></span>
              <span class="chev" aria-hidden="true">→</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-else class="assistant">
        <div class="disclaimer">
          This assistant is AI and can be wrong. It does not give medical advice or insulin doses. In an emergency, use
          <strong>Get help now</strong> or call 911.
        </div>
        <PatientView :data="data" />
      </div>
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
/* expanded: a large panel centered over the dimmed page (Kay's screenshot), sized so
   its bottom edge stays above the fixed help button */
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
.pad {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
h3 {
  margin: 0 0 0.9rem;
  font-size: 1.35rem;
  font-weight: 400;
  color: var(--text);
}
.options {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.option {
  width: 100%;
  min-height: 3.5rem;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.compact .option {
  grid-template-columns: 1fr auto;
  min-height: 3rem;
}
.option:hover {
  border-color: var(--accent);
}
.option strong {
  display: block;
  font-weight: 400;
  color: var(--text);
}
/* the first menu's titles are bold, as in the real portal; question types are plain */
.menu .option strong {
  font-weight: 600;
}
.option span span {
  display: block;
  color: var(--muted);
  font-size: 0.85rem;
}
.option.static {
  opacity: 0.8;
}
.oi {
  font-size: 1.4rem;
}
.chev {
  color: var(--muted);
  font-size: 1.4rem;
}
.rules {
  padding-left: 1.2rem;
  margin: 0 0 0.75rem;
}
.rules li {
  margin-bottom: 0.4rem;
}
.confirm {
  color: var(--danger);
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.primary,
.secondary {
  min-height: 3rem;
  padding: 0 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
}
.primary {
  border: 0;
  background: var(--accent);
  color: var(--accent-text);
}
.secondary {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
}
.notice {
  margin: 0;
  padding: 0.6rem 1rem;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.assistant {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
