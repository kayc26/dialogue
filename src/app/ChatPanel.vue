<script setup lang="ts">
// The patient chat (ADR-0005..0008). Each message runs one turn (src/lib/chat/turn.ts)
// and is saved to Neon. The OpenRouter key is the tester's own and lives only in this
// browser (ADR-0001). Without a key, or if a model call fails, the fixed-rule triage
// still runs and still shows help: the help path never depends on the key.
import { computed, nextTick, ref, watch } from 'vue'
import type { ChatMessage } from '../lib/types'
import type { DataClient } from '../lib/neon/data'
import { buildIndex, type KbPassage } from '../lib/chat/retrieve'
import { openRouterModels, type CostMeter } from '../lib/chat/models'
import { ConversationLog, cardsToText } from '../lib/chat/persist'
import { runTurn, type Card, type TurnOutcome } from '../lib/chat/turn'
import { maxTier, triageRules, TIER_RANK, type Profile, type Tier } from '../lib/chat/triage'
import { OpenRouterError } from '../lib/openrouter'

const props = defineProps<{
  data: Required<DataClient>
  patientId: string
  profile: Profile
  passages: KbPassage[]
}>()

const KEY = 'dea.openrouterKey'
const readKey = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}
const apiKey = ref(readKey())
const keyDraft = ref('')
function saveKey(): void {
  apiKey.value = keyDraft.value.trim()
  keyDraft.value = ''
  try {
    localStorage.setItem(KEY, apiKey.value)
  } catch {
    /* the key then lasts for this page only */
  }
}
function forgetKey(): void {
  apiKey.value = ''
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
}

interface Item {
  who: 'you' | 'assistant' | 'note'
  text?: string
  cards?: Card[]
}
const items = ref<Item[]>([])
const draft = ref('')
const busy = ref(false)
const saveProblem = ref('')
const index = computed(() => buildIndex(props.passages))
const meter: CostMeter = { dollars: 0, calls: 0 }
const cost = ref(0)
let history: ChatMessage[] = []
let doseSession = false
let tier: Tier = 'none'
let log = new ConversationLog(props.data, props.patientId)

watch(
  () => props.patientId,
  () => {
    items.value = []
    history = []
    doseSession = false
    tier = 'none'
    log = new ConversationLog(props.data, props.patientId)
  },
)

const list = ref<HTMLElement | null>(null)
async function scrollDown(): Promise<void> {
  await nextTick()
  list.value?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Rules-only turn. With no key, show exactly what the fixed rules found (nothing for a
 * plain question). When the model path *fails* mid-turn, the ADR-0006 floor applies:
 * a failure counts as at least check-in.
 */
function rulesOnly(message: string, failed: boolean): TurnOutcome {
  const r = triageRules(message, props.profile)
  const t = failed ? maxTier(r.tier, 'checkin') : r.tier
  const cards: Card[] = t === 'none' ? [] : [{ kind: 'escalation', tier: t, criteria: r.criteria }]
  if (r.doseIntent) cards.push({ kind: 'dose_refusal' })
  return {
    triage: { tier: t, criteria: [...r.criteria, failed ? 'model_unavailable' : 'no_key'], doseIntent: r.doseIntent, softened: false, classifierFailed: true },
    tier: t, cards, doseSession, guard: null, monitor: 'none', monitorVerdict: null, background: null, modelCalls: 0,
  }
}

async function send(): Promise<void> {
  const message = draft.value.trim()
  if (!message || busy.value) return
  draft.value = ''
  busy.value = true
  items.value.push({ who: 'you', text: message })
  await scrollDown()

  let outcome: TurnOutcome
  let note = ''
  if (!apiKey.value) {
    outcome = rulesOnly(message, false)
    note = 'To get answers, add your OpenRouter key below. Help is always available with the red button.'
  } else {
    try {
      outcome = await runTurn({
        message, history, profile: props.profile, index: index.value, doseSession,
        models: openRouterModels(apiKey.value, meter),
      })
    } catch (e) {
      outcome = rulesOnly(message, true)
      note =
        e instanceof OpenRouterError && e.status === 401
          ? 'Your OpenRouter key was not accepted. Check it below.'
          : e instanceof OpenRouterError && e.status === 402
            ? 'The OpenRouter key is out of credit.'
            : "Answers aren't working right now. Help is still available."
    }
  }
  cost.value = meter.dollars
  doseSession = outcome.doseSession
  tier = outcome.tier
  if (outcome.cards.length) items.value.push({ who: 'assistant', cards: outcome.cards })
  if (note) items.value.push({ who: 'note', text: note })
  history = [...history, { role: 'user', content: message }, { role: 'assistant', content: cardsToText(outcome.cards) }]
  busy.value = false
  await scrollDown()

  log.record(message, outcome).catch(() => {
    saveProblem.value = "This conversation couldn't be saved. You can keep chatting."
  })

  // Background review (ADR-0007): it can only escalate, never take back what was shown.
  outcome.background?.then(async (v) => {
    cost.value = meter.dollars
    if (!v) return
    const turn = log.lastTurn
    if (TIER_RANK[v.raise_tier] > TIER_RANK[tier]) {
      tier = v.raise_tier
      items.value.push({ who: 'assistant', cards: [{ kind: 'escalation', tier: v.raise_tier, criteria: ['monitor_raised'] }] })
      await scrollDown()
    }
    if (v.veto) {
      doseSession = true
      items.value.push({ who: 'note', text: "Please don't use the last answer to decide on a dose. Your care team can help with doses." })
      await scrollDown()
    }
    if (v.veto || v.raise_tier !== 'none') log.recordMonitor(turn, v).catch(() => {})
  })
}

const SOURCE = { ADA: 'From the American Diabetes Association', care_team: 'From your care team' } as const
const ESCALATION = {
  emergency: { title: 'This may be an emergency', text: 'Call 911 now. If someone is with you, ask them to stay with you.' },
  urgent: { title: 'Please call the nurse line today', text: 'What you described needs a nurse to look at it today. If you feel worse, call 911.' },
  distress: { title: "You don't have to handle this alone", text: 'Please call the nurse line to talk to someone. If you might hurt yourself, call 911.' },
  checkin: { title: 'If this is happening to you now', text: 'Call the nurse line, or 911 if you feel very unwell.' },
} as const
const escalation = (t: Tier) => ESCALATION[t as Exclude<Tier, 'none'>]
</script>

<template>
  <section class="chat" aria-labelledby="chat-title">
    <h4 id="chat-title">Ask a question</h4>

    <ol ref="list" class="items" aria-live="polite">
      <li v-for="(item, i) in items" :key="i" :class="item.who">
        <p v-if="item.who === 'you'" class="you-text"><span class="sr">You said: </span>{{ item.text }}</p>
        <p v-else-if="item.who === 'note'" class="note-text" role="status">{{ item.text }}</p>
        <template v-else>
          <template v-for="(c, j) in item.cards" :key="j">
            <div v-if="c.kind === 'escalation'" :class="['card', 'esc', c.tier]" role="alert">
              <p class="esc-title">{{ escalation(c.tier).title }}</p>
              <p>{{ escalation(c.tier).text }}</p>
              <div class="esc-buttons">
                <a v-if="c.tier === 'emergency' || c.tier === 'distress'" class="call c911" href="#demo-911">Call 911</a>
                <a class="call nurse" href="#demo-nurse">Call the nurse line</a>
              </div>
            </div>
            <div v-else-if="c.kind === 'passage'" class="card passage">
              <p v-if="c.why === 'dose'" class="dose-head">Talk to your care team before changing any dose.</p>
              <p class="src">{{ SOURCE[c.passage.source_label] }} · {{ c.passage.doc_title }}</p>
              <p class="verbatim">{{ c.passage.body }}</p>
            </div>
            <div v-else-if="c.kind === 'dose_refusal'" class="card plain">
              <p>I can't give advice about insulin or medicine doses. Your care team can help with that. Call the nurse line if you need an answer today.</p>
            </div>
            <div v-else-if="c.kind === 'no_info'" class="card plain">
              <p>I don't have information on that. Your care team can help.</p>
            </div>
            <div v-else-if="c.kind === 'answer'" class="card answer">
              <p class="answer-text">{{ c.text }}</p>
              <p class="src">Based on: {{ [...new Set(c.sources.map((s) => s.doc_title))].join('; ') }}</p>
            </div>
          </template>
        </template>
      </li>
    </ol>
    <p v-if="busy" role="status" class="thinking">Thinking…</p>

    <form class="ask" @submit.prevent="send">
      <label for="ask">Your question</label>
      <textarea id="ask" v-model="draft" rows="3" :disabled="busy" @keydown.enter.exact.prevent="send" />
      <button class="primary" type="submit" :disabled="busy || !draft.trim()">Send</button>
    </form>

    <p v-if="saveProblem" class="note-text" role="status">{{ saveProblem }}</p>

    <details class="key">
      <summary>{{ apiKey ? 'OpenRouter key: saved in this browser' : 'Add your OpenRouter key to get answers' }}</summary>
      <p>Your key stays in this browser only. This conversation has used about ${{ cost.toFixed(4) }}.</p>
      <form v-if="!apiKey" @submit.prevent="saveKey">
        <label for="key">OpenRouter key</label>
        <input id="key" v-model="keyDraft" type="password" autocomplete="off" spellcheck="false" />
        <button type="submit" :disabled="!keyDraft.trim()">Save key</button>
      </form>
      <button v-else type="button" @click="forgetKey">Remove key from this browser</button>
    </details>
  </section>
</template>

<style scoped>
.chat {
  margin: 1.5rem 0 6rem;
}
h4 {
  font-size: 1.3rem;
}
.items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.you {
  align-self: flex-end;
  max-width: 85%;
}
.you-text {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-text);
}
.sr {
  position: absolute;
  left: -9999px;
}
.card {
  padding: 1rem 1.15rem;
  border-radius: var(--radius);
  border: 2px solid var(--border);
  background: var(--panel);
  margin-bottom: 0.5rem;
}
.card p {
  margin: 0.25rem 0;
}
.esc.emergency {
  border-color: var(--danger);
  background: var(--danger-bg);
}
.esc.urgent,
.esc.distress {
  border-color: var(--danger);
}
.esc.checkin {
  border-style: dashed;
}
.esc-title {
  font-weight: 700;
  font-size: 1.15rem;
}
.esc-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.call {
  display: inline-flex;
  align-items: center;
  min-height: 3rem;
  padding: 0 1.25rem;
  border-radius: var(--radius);
  font-weight: 700;
  text-decoration: none;
}
.c911 {
  background: var(--danger);
  color: #fff;
}
.nurse {
  border: 2px solid var(--accent);
  color: var(--accent);
}
.src {
  color: var(--muted);
  font-size: 0.9rem;
}
.verbatim {
  white-space: pre-line;
}
.dose-head {
  font-weight: 700;
}
.note-text {
  color: var(--muted);
  font-style: italic;
  margin: 0;
}
.thinking {
  color: var(--muted);
}
.ask {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 1rem;
}
label {
  font-weight: 600;
}
textarea,
input {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
button {
  min-height: 3rem;
  padding: 0 1.25rem;
  border-radius: var(--radius);
  border: 2px solid var(--border);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.primary {
  border: 0;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
}
.key {
  margin-top: 1.25rem;
}
.key summary {
  cursor: pointer;
  min-height: 2.5rem;
}
.key form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
</style>
