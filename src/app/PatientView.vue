<script setup lang="ts">
// Patient view: pick a demo patient, then see their insulin (as recorded) and recent
// glucose. Read-back only (ADR-0005, ADR-0006 QST-TRIAGE-CGM: A); the chat is next.
import { computed, onMounted, ref } from 'vue'
import { getNonEmpty, type DataClient } from '../lib/neon/data'
import type { KbPassage } from '../lib/chat/retrieve'
import ChatPanel from './ChatPanel.vue'
import {
  minutesAgo,
  regimenLines,
  REGIMEN_DISCLAIMER,
  summarizeGlucose,
  type Reading,
  type Regimen,
} from '../lib/patients/readback'

interface Patient {
  id: string
  display_name: string
  age: number
  diabetes_type: 'type1' | 'type2'
  regimen: Regimen
  flags: { history_of_dka: boolean; pregnant: boolean; uses_pump: boolean }
}

const props = defineProps<{ data: Required<DataClient> }>()

const patients = ref<Patient[]>([])
const passages = ref<KbPassage[]>([])
const chosen = ref<Patient | null>(null)
const readings = ref<Reading[]>([])
const loading = ref(true)
const error = ref('')

const STORE = 'dea.patient'
const TYPE = { type1: 'Type 1', type2: 'Type 2' } as const

function remember(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(STORE, id)
    else sessionStorage.removeItem(STORE)
  } catch {
    /* private mode etc.: choosing again is fine */
  }
}

async function choose(p: Patient): Promise<void> {
  chosen.value = p
  remember(p.id)
  readings.value = []
  error.value = ''
  try {
    readings.value = await props.data.get<Reading[]>(
      `glucose_readings?patient_id=eq.${encodeURIComponent(p.id)}&minutes_before_load=lte.1440` +
        '&select=minutes_before_load,value_mgdl,source&order=minutes_before_load.asc',
    )
  } catch {
    error.value = "We couldn't load this patient's glucose readings. Please try again."
  }
}

function changePatient(): void {
  chosen.value = null
  remember(null)
}

const summary = computed(() => summarizeGlucose(readings.value))
const regimen = computed(() => (chosen.value ? regimenLines(chosen.value.regimen) : []))

function badges(p: Patient): string[] {
  const b: string[] = []
  if (p.flags.uses_pump) b.push('Insulin pump')
  if (p.flags.pregnant) b.push('Pregnant')
  if (p.flags.history_of_dka) b.push('Past DKA')
  return b
}

onMounted(async () => {
  try {
    // getNonEmpty: a just-woken Neon compute can briefly return [] (see data.ts).
    ;[patients.value, passages.value] = await Promise.all([
      getNonEmpty<Patient>(props.data, 'patients?select=id,display_name,age,diabetes_type,regimen,flags&order=display_name.asc'),
      // The knowledge base (ADR-0005): loaded once, searched in the browser.
      getNonEmpty<KbPassage>(props.data, 'kb_chunks?select=id,doc_title,source_label,section,body,tags'),
    ])
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(STORE)
    } catch {
      saved = null
    }
    const again = patients.value.find((p) => p.id === saved)
    if (again) await choose(again)
  } catch {
    error.value = "We couldn't load the demo patients. Please try again in a minute."
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <p v-if="loading" role="status">Loading demo patients…</p>
  <p v-else-if="error && !chosen" class="error" role="alert">{{ error }}</p>

  <section v-else-if="!chosen" aria-labelledby="pick">
    <h3 id="pick">Choose a demo patient</h3>
    <p>You'll use the assistant as this person. Their readings come from a public research dataset; their name and details are made up.</p>
    <ul class="cards">
      <li v-for="p in patients" :key="p.id">
        <button type="button" class="card" @click="choose(p)">
          <span class="name">{{ p.display_name }}</span>
          <span>{{ p.age }} years old · {{ TYPE[p.diabetes_type] }} diabetes</span>
          <span v-if="badges(p).length" class="badges">{{ badges(p).join(' · ') }}</span>
        </button>
      </li>
    </ul>
  </section>

  <section v-else aria-labelledby="who">
    <div class="row">
      <h3 id="who">{{ chosen.display_name }}</h3>
      <button type="button" class="secondary" @click="changePatient">Choose a different patient</button>
    </div>
    <p>{{ chosen.age }} years old · {{ TYPE[chosen.diabetes_type] }} diabetes</p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="panel">
      <h4>Latest glucose</h4>
      <template v-if="summary">
        <p class="big">{{ summary.latest.value_mgdl }} <span class="unit">mg/dL</span></p>
        <p>{{ minutesAgo(summary.latest.minutes_before_load) }}<span v-if="summary.latest.source === 'fingerstick'"> (finger stick)</span></p>
        <p>Past 24 hours: lowest {{ summary.lowest24h }}, highest {{ summary.highest24h }} mg/dL.</p>
      </template>
      <p v-else>No readings in the past 24 hours.</p>
    </div>

    <div class="panel">
      <h4>My insulin (as recorded)</h4>
      <ul>
        <li v-for="line in regimen" :key="line">{{ line }}</li>
      </ul>
      <p class="note">{{ REGIMEN_DISCLAIMER }}</p>
    </div>

    <ChatPanel :data="data" :patient-id="chosen.id" :profile="chosen.flags" :passages="passages" />
  </section>
</template>

<style scoped>
h3 {
  font-size: 1.5rem;
  margin: 0.5rem 0;
}
h4 {
  font-size: 1.2rem;
  margin: 0 0 0.5rem;
}
.cards {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.card {
  width: 100%;
  min-height: 4.5rem;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  text-align: left;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.card:hover {
  border-color: var(--accent);
}
.name {
  font-weight: 700;
  font-size: 1.2rem;
}
.badges {
  color: var(--accent);
  font-weight: 600;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.secondary {
  min-height: 3rem;
  padding: 0 1.25rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
.panel {
  margin: 1rem 0;
  padding: 1rem 1.25rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.panel p {
  margin: 0.25rem 0;
}
.big {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.1;
}
.unit {
  font-size: 1.2rem;
  font-weight: 400;
}
.note {
  color: var(--muted);
  font-style: italic;
}
.error {
  background: var(--danger-bg);
  color: var(--danger);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-weight: 600;
}
.next {
  color: var(--muted);
  margin-bottom: 5rem; /* room above the fixed help button */
}
</style>
