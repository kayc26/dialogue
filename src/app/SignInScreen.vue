<script setup lang="ts">
// Sign in, or set a password with an emailed code. Admin-created accounts have no
// password, so "set a password" is also how a new tester gets in (ADR-0011).
import { ref } from 'vue'
import { AuthError, newPasswordProblem, type AuthClient, type User } from '../lib/neon/auth'

const props = defineProps<{ auth: AuthClient }>()
const emit = defineEmits<{ signedIn: [user: User] }>()

type Mode = 'sign-in' | 'request-code' | 'reset'
const mode = ref<Mode>('sign-in')
const email = ref('')
const password = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')

function show(e: unknown): void {
  error.value = e instanceof AuthError ? e.message : 'Something went wrong. Please try again.'
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    show(e)
  } finally {
    busy.value = false
  }
}

function go(next: Mode): void {
  mode.value = next
  error.value = ''
  notice.value = ''
}

const signIn = () =>
  run(async () => {
    emit('signedIn', await props.auth.signIn(email.value, password.value))
  })

const sendCode = () =>
  run(async () => {
    if (!email.value.trim()) {
      error.value = 'Please type your email address.'
      return
    }
    await props.auth.sendResetCode(email.value)
    go('reset')
    // Neon answers "success" whether or not the address has an account (so nobody can
    // probe which emails exist). Word it so a mistyped address isn't left waiting.
    notice.value = `If ${email.value.trim()} has an account here, we've sent it a code from auth@mail.myneon.app. Nothing in a few minutes? Check your spam or junk folder, and check that the email is spelled right. Still nothing? Contact the project team.`
  })

const savePassword = () =>
  run(async () => {
    const problem = newPasswordProblem(newPassword.value, confirmPassword.value)
    if (problem) {
      error.value = problem
      return
    }
    await props.auth.resetPassword(email.value, code.value, newPassword.value)
    emit('signedIn', await props.auth.signIn(email.value, newPassword.value))
  })
</script>

<template>
  <main class="card">
    <h1>DIAlogue: Diabetes Education Assistant</h1>
    <p class="demo">Demo for testing. Please don't type real health information.</p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <form v-if="mode === 'sign-in'" @submit.prevent="signIn">
      <h2>Sign in</h2>
      <label for="email">Email</label>
      <input id="email" v-model="email" type="email" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      <button class="link" type="button" @click="go('request-code')">
        First time here, or forgot your password? Set a password
      </button>
    </form>

    <form v-else-if="mode === 'request-code'" @submit.prevent="sendCode">
      <h2>Set a password</h2>
      <p>We'll email you a code. Then you can choose a password.</p>
      <label for="email2">Your email</label>
      <input id="email2" v-model="email" type="email" autocomplete="username" required />
      <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Sending…' : 'Email me a code' }}</button>
      <button class="link" type="button" @click="go('sign-in')">Back to sign in</button>
    </form>

    <form v-else @submit.prevent="savePassword">
      <h2>Choose your password</h2>
      <label for="code">Code from the email</label>
      <input
        id="code"
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        required
      />
      <label for="new">New password <span class="hint">(at least 8 characters)</span></label>
      <input id="new" v-model="newPassword" type="password" autocomplete="new-password" required />
      <label for="confirm">Type the new password again</label>
      <input id="confirm" v-model="confirmPassword" type="password" autocomplete="new-password" required />
      <button class="primary" type="submit" :disabled="busy">
        {{ busy ? 'Saving…' : 'Save password and sign in' }}
      </button>
      <button class="link" type="button" :disabled="busy" @click="sendCode">Send a new code</button>
      <button class="link" type="button" @click="go('sign-in')">Back to sign in</button>
    </form>
  </main>
</template>

<style scoped>
.card {
  max-width: 34rem;
  margin: 2rem auto;
  padding: 1.5rem;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: var(--radius);
}
@media (max-width: 40rem) {
  .card {
    margin: 0;
    border: 0;
    border-radius: 0;
    padding: 1rem;
  }
}
h1 {
  font-size: 1.6rem;
  line-height: 1.2;
  margin: 0 0 0.5rem;
}
h2 {
  font-size: 1.3rem;
  margin: 1rem 0 0.5rem;
}
.demo {
  color: var(--muted);
  margin: 0 0 1rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
label {
  font-weight: 600;
  margin-top: 0.6rem;
}
.hint {
  font-weight: 400;
  color: var(--muted);
}
input {
  min-height: 3rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
button {
  min-height: 3rem;
  border-radius: var(--radius);
  cursor: pointer;
}
.primary {
  margin-top: 1rem;
  border: 0;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
}
.primary:disabled {
  opacity: 0.7;
}
.link {
  border: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
  text-align: left;
  padding: 0.25rem 0;
}
.error {
  background: var(--danger-bg);
  color: var(--danger);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-weight: 600;
}
.notice {
  background: var(--ok-bg);
  color: var(--ok);
  border-radius: var(--radius);
  padding: 0.75rem;
}
</style>
