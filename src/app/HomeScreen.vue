<script setup lang="ts">
// Signed-in home. Admins switch between the patient view and the care-team view
// (ADR-0011: admin sees both); other roles get their one view. The views themselves
// are the next build steps.
import { computed, ref } from 'vue'
import type { User } from '../lib/neon/auth'
import { viewsFor, type DataClient, type Membership } from '../lib/neon/data'
import PatientView from './PatientView.vue'

const props = defineProps<{ user: User; membership: Membership; data: DataClient }>()
const emit = defineEmits<{ signOut: [] }>()

const ROLE_LABEL = {
  patient_tester: 'Patient tester',
  careteam_tester: 'Care team tester',
  admin: 'Admin (patient and care team)',
} as const

const views = computed(() => viewsFor(props.membership.role))
const view = ref(views.value[0])
</script>

<template>
  <div class="page">
    <header class="top">
      <div>
        <p class="who">Signed in as <strong>{{ membership.display_name }}</strong></p>
        <p class="role">{{ ROLE_LABEL[membership.role] }}</p>
      </div>
      <button class="secondary" type="button" @click="emit('signOut')">Sign out</button>
    </header>

    <nav v-if="views.length > 1" class="switch" aria-label="Choose a view">
      <button
        type="button"
        :aria-pressed="view === 'patient'"
        :class="{ on: view === 'patient' }"
        @click="view = 'patient'"
      >
        Patient view
      </button>
      <button
        type="button"
        :aria-pressed="view === 'careteam'"
        :class="{ on: view === 'careteam' }"
        @click="view = 'careteam'"
      >
        Care team view
      </button>
    </nav>

    <main class="body">
      <section v-if="view === 'patient'" aria-labelledby="pv">
        <h1 id="pv">Patient view</h1>
        <PatientView :data="data" />
      </section>
      <section v-else aria-labelledby="cv">
        <h1 id="cv">Care team view</h1>
        <p>Coming next: the inbox of conversation summaries that patients shared.</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1rem;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.who,
.role {
  margin: 0;
}
.role {
  color: var(--muted);
}
button {
  min-height: 3rem;
  padding: 0 1.25rem;
  border-radius: var(--radius);
  cursor: pointer;
}
.secondary {
  border: 2px solid var(--border);
  background: var(--panel);
  color: var(--text);
}
.switch {
  display: flex;
  gap: 0.5rem;
  margin: 1.25rem 0;
  flex-wrap: wrap;
}
.switch button {
  flex: 1 1 12rem;
  border: 2px solid var(--accent);
  background: var(--panel);
  color: var(--accent);
  font-weight: 700;
}
.switch button.on {
  background: var(--accent);
  color: var(--accent-text);
}
.body h1 {
  font-size: 1.5rem;
}
</style>
