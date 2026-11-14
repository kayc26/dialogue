<script setup lang="ts">
// Root of the diabetes education assistant: who is signed in, and are they a member?
// Being signed in is not enough; access comes from public.members (ADR-0010/0011).
import { onMounted, ref } from 'vue'
import { NEON_AUTH_URL, NEON_DATA_API_URL } from '../config'
import { AuthError, createAuthClient, type User } from '../lib/neon/auth'
import { createDataClient, getMembership, type Membership } from '../lib/neon/data'
import HomeScreen from './HomeScreen.vue'
import SignInScreen from './SignInScreen.vue'

const auth = createAuthClient(NEON_AUTH_URL)
const data = createDataClient(NEON_DATA_API_URL, () => auth.getJwt())

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'notMember'; user: User }
  | { kind: 'signedIn'; user: User; membership: Membership }
  | { kind: 'error'; message: string }
const state = ref<State>({ kind: 'loading' })

async function enter(user: User): Promise<void> {
  try {
    const membership = await getMembership(data, user.id)
    state.value = membership ? { kind: 'signedIn', user, membership } : { kind: 'notMember', user }
  } catch {
    state.value = { kind: 'error', message: "We couldn't load your account. Please try again in a minute." }
  }
}

async function signOut(): Promise<void> {
  try {
    await auth.signOut()
  } finally {
    state.value = { kind: 'signedOut' }
  }
}

onMounted(async () => {
  try {
    const user = await auth.getSession()
    if (user) await enter(user)
    else state.value = { kind: 'signedOut' }
  } catch (e) {
    state.value =
      e instanceof AuthError && e.code === 'NETWORK'
        ? { kind: 'error', message: e.message }
        : { kind: 'signedOut' }
  }
})
</script>

<template>
  <p v-if="state.kind === 'loading'" class="center" role="status">Loading…</p>

  <SignInScreen v-else-if="state.kind === 'signedOut'" :auth="auth" @signed-in="enter" />

  <HomeScreen
    v-else-if="state.kind === 'signedIn'"
    :user="state.user"
    :membership="state.membership"
    :data="data"
    @sign-out="signOut"
  />

  <main v-else class="center">
    <p role="alert">
      {{
        state.kind === 'notMember'
          ? "You're signed in, but your account hasn't been added to this demo yet. Please contact the project team."
          : state.message
      }}
    </p>
    <button type="button" @click="signOut">Sign out</button>
  </main>
</template>

<style scoped>
.center {
  max-width: 34rem;
  margin: 3rem auto;
  padding: 1rem;
  text-align: center;
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
</style>
