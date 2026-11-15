<script setup lang="ts">
// The patient chat (ADR-0005..0008), laid out as the mockup's chat window
// (docs/mockups/portal-assistant.html): a scrolling message area on the soft background,
// white assistant bubbles with source chips, the patient's bubbles in Penn Blue, and the
// "Ask" composer pinned at the bottom. Each message runs one turn (src/lib/chat/turn.ts)
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

/** Starter questions, like the mockup's suggestion chips. Plain, common, safe topics. */
const SUGGESTIONS = [
  'What fruit can I eat?',
  'What should I do if my sugar is low?',
  'Are sugar substitutes safe?',
  'What is a healthy snack?',
]

const msgs = ref<HTMLElement | null>(null)
async function scrollDown(): Promise<void> {
  await nextTick()
  const el = msgs.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
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

function ask(q: string): void {
  draft.value = q
  void send()
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
    note = 'To get answers, add your OpenRouter key (below the Ask box). Help is always available with the red button.'
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
          ? 'Your OpenRouter key was not accepted. Check it below the Ask box.'
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

const SOURCE = { ADA: 'American Diabetes Association', care_team: 'Your care team' } as const
const ESCALATION = {
  emergency: { title: 'This may be an emergency', text: 'Call 911 now. If someone is with you, ask them to stay with you.' },
  urgent: { title: 'Please call the nurse line today', text: 'What you described needs a nurse to look at it today. If you feel worse, call 911.' },
  distress: { title: "You don't have to handle this alone", text: 'Please call the nurse line to talk to someone. If you might hurt yourself, call 911.' },
  checkin: { title: 'If this is happening to you now', text: 'Call the nurse line, or 911 if you feel very unwell.' },
} as const
const escalation = (t: Tier) => ESCALATION[t as Exclude<Tier, 'none'>]
const uniqueDocs = (sources: KbPassage[]) => [...new Map(sources.map((s) => [s.doc_title, s])).values()]
</script>

<template>
  <section class="chat" aria-labelledby="chat-title">
    <h4 id="chat-title" class="sr">Chat with the Diabetes Assistant</h4>

    <div ref="msgs" class="msgs">
      <div class="bubble bot">
        <p>Hi! I can answer questions about diabetes from approved education material.</p>
        <p>I can't give insulin or medicine doses. In an emergency, use <strong>Get help now</strong>.</p>
      </div>
      <div v-if="items.length === 0" class="chips" aria-label="Suggested questions">
        <button v-for="q in SUGGESTIONS" :key="q" type="button" class="chip" :disabled="busy" @click="ask(q)">{{ q }}</button>
      </div>

      <ol class="items" aria-live="polite">
        <li v-for="(item, i) in items" :key="i" :class="item.who">
          <p v-if="item.who === 'you'" class="bubble me"><span class="sr">You said: </span>{{ item.text }}</p>
          <p v-else-if="item.who === 'note'" class="note-text" role="status">{{ item.text }}</p>
          <template v-else>
            <template v-for="(c, j) in item.cards" :key="j">
              <div v-if="c.kind === 'escalation'" :class="['bubble', 'esc', c.tier]" role="alert">
                <p class="esc-title">{{ escalation(c.tier).title }}</p>
                <p>{{ escalation(c.tier).text }}</p>
                <div class="esc-buttons">
                  <a v-if="c.tier === 'emergency' || c.tier === 'distress'" class="call c911" href="#demo-911">Call 911</a>
                  <a class="call nurse" href="#demo-nurse">Call the nurse line</a>
                </div>
              </div>
              <div v-else-if="c.kind === 'passage'" class="bubble bot">
                <p v-if="c.why === 'dose'" class="dose-head">Talk to your care team before changing any dose.</p>
                <p class="verbatim">{{ c.passage.body }}</p>
                <span class="cite">📄 {{ c.passage.doc_title }} · {{ SOURCE[c.passage.source_label] }}</span>
                <p class="meta">Shown word for word from approved material</p>
              </div>
              <div v-else-if="c.kind === 'dose_refusal'" class="bubble bot">
                <p>I can't give advice about insulin or medicine doses. Your care team can help with that. Call the nurse line if you need an answer today.</p>
              </div>
              <div v-else-if="c.kind === 'no_info'" class="bubble bot">
                <p>I don't have information on that. Your care team can help.</p>
              </div>
              <div v-else-if="c.kind === 'answer'" class="bubble bot">
                <p class="answer-text">{{ c.text }}</p>
                <span v-for="s in uniqueDocs(c.sources)" :key="s.id" class="cite">📄 {{ s.doc_title }} · {{ SOURCE[s.source_label] }}</span>
                <p class="meta">
                  Answered from {{ c.sources.length }} approved passage{{ c.sources.length === 1 ? '' : 's' }}
                </p>
              </div>
            </template>
          </template>
        </li>
      </ol>
      <p v-if="busy" role="status" class="thinking">Thinking…</p>
    </div>

    <div class="composer">
      <form class="ask" @submit.prevent="send">
        <label for="ask" class="sr">Your question</label>
        <div class="row">
          <textarea
            id="ask"
            v-model="draft"
            rows="2"
            placeholder="Ask about food, low or high sugar, or your diabetes…"
            :disabled="busy"
            @keydown.enter.exact.prevent="send"
          />
          <button class="primary" type="submit" :disabled="busy || !draft.trim()">Ask</button>
        </div>
      </form>
      <p class="fine">
        The assistant answers from approved diabetes education material. It can't see your health records, send
        messages, or advise on doses.
      </p>
      <p v-if="saveProblem" class="note-text" role="status">{{ saveProblem }}</p>
      <details class="key">
        <summary>
          {{ apiKey ? 'OpenRouter key saved in this browser' : 'Add your OpenRouter key to get answers' }}
          · this chat has used about ${{ cost.toFixed(4) }}
        </summary>
        <form v-if="!apiKey" class="keyform" @submit.prevent="saveKey">
          <label for="key">OpenRouter key (stays in this browser only)</label>
          <input id="key" v-model="keyDraft" type="password" autocomplete="off" spellcheck="false" />
          <button type="submit" :disabled="!keyDraft.trim()">Save key</button>
        </form>
        <button v-else type="button" @click="forgetKey">Remove key from this browser</button>
      </details>
    </div>
  </section>
</template>

<style scoped>
/* fills the thread: messages scroll, the composer stays at the bottom */
.chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.msgs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  background: var(--soft);
}
.items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.you {
  align-self: flex-end;
  max-width: 85%;
}
/* the mockup's bubbles */
.bubble {
  max-width: 42rem;
  margin: 0 0 0.6rem;
  padding: 0.75rem 1rem;
}
.bubble p {
  margin: 0 0 0.4rem;
}
.bubble p:last-child {
  margin-bottom: 0;
}
.me {
  margin: 0;
  border-radius: 14px 14px 4px 14px;
  background: var(--accent);
  color: var(--accent-text);
}
.bot {
  border-radius: 14px 14px 14px 4px;
  border: 1px solid var(--border);
  background: var(--panel);
}
.esc {
  border-radius: 14px 14px 14px 4px;
  border: 2px solid var(--danger);
  background: var(--panel);
}
.esc.emergency {
  background: var(--danger-bg);
}
.esc.checkin {
  border-style: dashed;
  border-color: var(--border);
}
.esc-title {
  font-weight: 700;
  font-size: 1.1rem;
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
  border-radius: 8px;
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
  background: var(--panel);
}
.cite {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0.4rem 0.4rem 0 0;
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  border: 1px solid #cfd8ee;
  background: #eef2fb;
  color: var(--accent);
  font-size: 0.8rem;
}
.meta {
  margin-top: 0.4rem !important;
  color: var(--muted);
  font-size: 0.75rem;
}
.verbatim {
  white-space: pre-line;
}
.dose-head {
  font-weight: 700;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.25rem 0 0.75rem;
}
.chip {
  min-height: 2.75rem;
  padding: 0.3rem 0.9rem;
  border-radius: 999px;
  border: 1px solid #c9d3ea;
  background: var(--panel);
  color: var(--accent);
  cursor: pointer;
}
.note-text {
  color: var(--muted);
  font-style: italic;
  margin: 0;
}
.thinking {
  color: var(--muted);
}
/* the mockup composer, pinned at the bottom of the docked window (which itself sits
   above the fixed "Get help now" button, so nothing here needs to dodge it) */
.composer {
  border-top: 1px solid var(--border);
  background: var(--panel);
  padding: 0.75rem 1.25rem 0.5rem;
}
.row {
  display: flex;
  gap: 0.6rem;
  align-items: stretch;
  padding-right: 0;
}
textarea,
input {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
}
.row textarea {
  flex: 1;
  resize: none;
}
button {
  min-height: 3rem;
  padding: 0 1.25rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.primary {
  min-width: 5.5rem;
  border: 0;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
}
.fine {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.75rem;
}
.key {
  margin-top: 0.3rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.key summary {
  cursor: pointer;
  min-height: 2.25rem;
  display: flex;
  align-items: center;
}
.keyform {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: 28rem;
}
@media (max-width: 700px) {
  .msgs {
    padding: 0.75rem;
  }
  .composer {
    padding: 0.5rem 0.75rem;
  }
  .row {
    padding-right: 0;
  }
  .fine {
    display: none; /* the yellow AI bar above already says it */
  }
}
</style>
