<script setup lang="ts">
// Signed-in home, in the portal layout of docs/mockups/portal-assistant.html.
// ADR-0005 QST-DIAB-PORTAL-SHELL: A (and ADR-0004: A): the portal is a STATIC shell;
// the diabetes assistant is the one working part. Static parts say so when clicked
// instead of pretending to work. On narrow screens only the assistant shows (the
// mockup's single-column layout), keeping the large-type single-screen view.
// Admins open the care-team inbox from the Message Center (ADR-0011: both views).
import { computed, ref } from 'vue'
import type { User } from '../lib/neon/auth'
import { viewsFor, type DataClient, type Membership } from '../lib/neon/data'
import PatientView from './PatientView.vue'

const props = defineProps<{ user: User; membership: Membership; data: Required<DataClient> }>()
const emit = defineEmits<{ signOut: [] }>()

const ROLE_LABEL = {
  patient_tester: 'Patient tester',
  careteam_tester: 'Care team tester',
  admin: 'Admin (patient and care team)',
} as const

const views = computed(() => viewsFor(props.membership.role))
const view = ref(views.value[0])
const initial = computed(() => props.membership.display_name.trim().charAt(0).toUpperCase() || '?')

const notice = ref('')
function staticPart(name: string): void {
  notice.value = `“${name}” is part of the portal's look, but it isn't included in this demo. The Diabetes Assistant is the part that works.`
}
</script>

<template>
  <div class="portal">
    <header class="top">
      <div class="logo">Patient Portal<small>placeholder brand · demo</small></div>
      <span class="spacer" />
      <div class="me">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <span class="me-text">
          <strong>{{ membership.display_name }}</strong>
          <small>{{ ROLE_LABEL[membership.role] }}</small>
        </span>
        <button class="signout" type="button" @click="emit('signOut')">Sign out</button>
      </div>
    </header>

    <nav v-if="views.length > 1" class="mobile-tabs" aria-label="Choose a view">
      <button type="button" :aria-pressed="view === 'patient'" :class="{ on: view === 'patient' }" @click="view = 'patient'">
        Diabetes Assistant
      </button>
      <button type="button" :aria-pressed="view === 'careteam'" :class="{ on: view === 'careteam' }" @click="view = 'careteam'">
        Care team inbox
      </button>
    </nav>

    <div class="page">
      <aside class="nav" aria-label="Message Center">
        <h1>Message Center</h1>
        <button class="send" type="button" @click="staticPart('Send a message')">Send a message</button>
        <button v-if="views.includes('patient')" class="ask" type="button" @click="view = 'patient'">✦ Ask the assistant</button>
        <ul>
          <li>
            <button type="button" :class="{ on: view === 'patient' && views.includes('patient') }" @click="views.includes('patient') ? (view = 'patient') : staticPart('Conversations')">
              <span class="ico" aria-hidden="true">💬</span>Conversations
            </button>
          </li>
          <li v-if="views.includes('careteam')">
            <button type="button" :class="{ on: view === 'careteam' }" @click="view = 'careteam'">
              <span class="ico" aria-hidden="true">🩺</span>Care team inbox
            </button>
          </li>
          <li><button type="button" @click="staticPart('Bookmarked')"><span class="ico" aria-hidden="true">🔖</span>Bookmarked</button></li>
          <li><button type="button" @click="staticPart('Automated messages')"><span class="ico" aria-hidden="true">🗂</span>Automated messages</button></li>
          <li><button type="button" @click="staticPart('Archive')"><span class="ico" aria-hidden="true">🗄</span>Archive</button></li>
        </ul>
      </aside>

      <section class="list" aria-label="Conversations">
        <h2>Conversations</h2>
        <button v-if="views.includes('patient')" type="button" :class="['conv', { on: view === 'patient' }]" @click="view = 'patient'">
          <span class="ic ai" aria-hidden="true">✦</span>
          <span>
            <span class="t">Diabetes Assistant <span class="tag">AI</span></span>
            <span class="who">Ask about diabetes · always on top</span>
          </span>
        </button>
        <button type="button" class="conv static" @click="staticPart('Appointment Reminder')">
          <span class="ic" aria-hidden="true">👥</span>
          <span>
            <span class="t">Appointment Reminder <time>example</time></span>
            <span class="who">Clinic Scheduling</span>
          </span>
        </button>
        <button type="button" class="conv static" @click="staticPart('Lab results are ready')">
          <span class="ic" aria-hidden="true">👥</span>
          <span>
            <span class="t">Lab results are ready <time>example</time></span>
            <span class="who">Care Team</span>
          </span>
        </button>
      </section>

      <main class="thread">
        <p v-if="notice" class="notice" role="status">
          {{ notice }} <button type="button" class="link" @click="notice = ''">OK</button>
        </p>

        <template v-if="view === 'patient'">
          <div class="th-head">
            <span class="ic ai" aria-hidden="true">✦</span>
            <div>
              <h2>Diabetes Assistant</h2>
              <p>AI · answers from approved diabetes education material</p>
            </div>
          </div>
          <div class="disclaimer">
            This assistant is AI and can be wrong. It does not give medical advice or insulin doses. In an emergency, use
            <strong>Get help now</strong> or call 911.
          </div>
          <div class="th-body">
            <PatientView :data="data" />
          </div>
        </template>

        <template v-else>
          <div class="th-head">
            <span class="ic" aria-hidden="true">🩺</span>
            <div>
              <h2>Care team inbox</h2>
              <p>Summaries patients shared with the care team</p>
            </div>
          </div>
          <div class="th-body">
            <p>Coming next: the inbox of conversation summaries that patients shared, with replies.</p>
          </div>
        </template>
      </main>
    </div>

    <footer>
      <button type="button" class="link" @click="staticPart('Frequently Asked Questions')">Frequently Asked Questions</button>
      <button type="button" class="link" @click="staticPart('Contact Us')">Contact Us</button>
      <button type="button" class="link" @click="staticPart('About the AI assistant')">About the AI assistant</button>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  --navy: #13275e;
  --ai: #5b3fd6;
  --ai-soft: #efebff;
  --soft: #f4f6fa;
  --warn-bg: #fff6df;
  --warn-ink: #6b4e00;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
@media (prefers-color-scheme: dark) {
  .portal {
    --navy: #9fb5f5;
    --ai: #b8a8ff;
    --ai-soft: #2a2347;
    --soft: #181a20;
    --warn-bg: #3a3220;
    --warn-ink: #f5dc9a;
  }
}
button {
  font: inherit;
  cursor: pointer;
}

/* top bar */
.top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.logo {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--navy);
  line-height: 1.1;
}
.logo small {
  display: block;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.spacer {
  flex: 1;
}
.me {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.avatar {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: var(--navy);
  color: var(--panel);
  display: grid;
  place-items: center;
  font-weight: 700;
}
.me-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.me-text small {
  color: var(--muted);
  font-size: 0.75rem;
}
.signout {
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
}

/* layout: Message Center | Conversations | assistant thread */
.page {
  flex: 1;
  display: grid;
  grid-template-columns: 15rem 16rem 1fr;
  min-height: 0;
}
.nav {
  border-right: 1px solid var(--border);
  padding: 1rem;
}
.nav h1 {
  font-size: 1.4rem;
  font-weight: 400;
  margin: 0 0 0.75rem;
}
.send {
  display: block;
  width: 100%;
  min-height: 2.75rem;
  margin-bottom: 0.5rem;
  border: 0;
  border-radius: 6px;
  background: var(--navy);
  color: var(--panel);
  font-weight: 600;
}
.ask {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid #d4caff;
  border-radius: 6px;
  background: var(--ai-soft);
  color: var(--ai);
  font-weight: 700;
}
.nav ul {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}
.nav li button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.4rem 0.5rem;
  border: 0;
  border-left: 4px solid transparent;
  background: none;
  color: var(--text);
  text-align: left;
}
.nav li button.on {
  border-left-color: var(--navy);
  background: var(--soft);
  color: var(--navy);
  font-weight: 600;
}
.list {
  border-right: 1px solid var(--border);
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.list h2 {
  font-size: 1.3rem;
  font-weight: 400;
  margin: 0 0 0.25rem 0.25rem;
}
.conv {
  display: grid;
  grid-template-columns: 2.4rem 1fr;
  gap: 0.6rem;
  text-align: left;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
}
.conv.on {
  border-color: var(--ai);
  box-shadow: 0 0 0 2px #e2dbff;
}
.conv.static {
  opacity: 0.75;
}
.conv > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ic {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--navy);
  color: var(--panel);
}
.ic.ai {
  background: var(--ai);
}
.t {
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.4rem;
}
.t time {
  font-weight: 400;
  color: var(--muted);
  font-size: 0.75rem;
}
.who {
  color: var(--muted);
  font-size: 0.85rem;
}
.tag {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--ai);
  background: var(--ai-soft);
  border-radius: 4px;
  padding: 0 0.3rem;
  align-self: flex-start;
  white-space: nowrap;
}

/* assistant thread: the working part, in the app's large type */
.thread {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.th-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
.th-head h2 {
  margin: 0;
  font-size: 1.3rem;
}
.th-head p {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.disclaimer {
  background: var(--warn-bg);
  color: var(--warn-ink);
  padding: 0.6rem 1.25rem;
  font-size: 0.95rem;
}
.th-body {
  padding: 1rem 1.25rem;
  max-width: 50rem;
}
.notice {
  margin: 0;
  padding: 0.6rem 1.25rem;
  background: var(--soft);
  border-bottom: 1px solid var(--border);
}
.link {
  border: 0;
  background: none;
  color: var(--navy);
  text-decoration: underline;
  padding: 0.25rem;
  min-height: 2.5rem;
}
footer {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.5rem 1rem 5rem; /* room for the fixed help button */
  border-top: 1px solid var(--border);
}

/* narrow screens: the assistant alone (mockup's single column); admins get two tabs */
.mobile-tabs {
  display: none;
}
@media (max-width: 1100px) {
  .page {
    grid-template-columns: 1fr;
  }
  .nav,
  .list {
    display: none;
  }
  .mobile-tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .mobile-tabs button {
    flex: 1;
    min-height: 3rem;
    border: 2px solid var(--navy);
    border-radius: 8px;
    background: var(--panel);
    color: var(--navy);
    font-weight: 700;
  }
  .mobile-tabs button.on {
    background: var(--navy);
    color: var(--panel);
  }
  .me-text small {
    display: none;
  }
}
</style>
