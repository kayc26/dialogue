// The app's own sign-in and data clients (src/lib/neon), run against a live Neon
// branch. Node's fetch has no cookie jar, so a tiny one stands in for the browser:
// it keeps Set-Cookie values and sends them back, and adds the Origin header a
// browser would send. Same environment variables as rls.test.ts:
//   RLS_AUTH_URL=... RLS_DATA_API_URL=... RLS_PASSWORD=... npm run test:db

import { describe, expect, it } from 'vitest'
import { AuthError, createAuthClient } from '../../src/lib/neon/auth.ts'
import { createDataClient, getMembership } from '../../src/lib/neon/data.ts'
import { ConversationLog } from '../../src/lib/chat/persist.ts'
import type { TurnOutcome } from '../../src/lib/chat/turn.ts'

const AUTH = process.env.RLS_AUTH_URL ?? ''
const API = process.env.RLS_DATA_API_URL ?? ''
const PASSWORD = process.env.RLS_PASSWORD ?? ''
const configured = Boolean(AUTH && API && PASSWORD)

/** A fetch with a per-instance cookie jar: one "browser" per test user. */
function browserFetch(): typeof fetch {
  const jar = new Map<string, string>()
  return async (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Origin', 'http://localhost:5173')
    if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    // Neon Auth rate-limits sign-in (429) when the two live suites run back to back.
    let res = await fetch(input, { ...init, headers })
    for (let attempt = 0; res.status === 429 && attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 2 ** attempt * 2) * 1000))
      res = await fetch(input, { ...init, headers })
    }
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
    return res
  }
}

describe.skipIf(!configured)("app sign-in client against a Neon branch", { timeout: 120_000 }, () => {
  it('signs in, keeps the session, gets a JWT, and reads its own membership', async () => {
    const f = browserFetch()
    const auth = createAuthClient(AUTH, f)
    const user = await auth.signIn('rls-a@example.com', PASSWORD)
    expect((await auth.getSession())?.id).toBe(user.id)
    const data = createDataClient(API, () => auth.getJwt(), f)
    expect((await getMembership(data, user.id))?.role).toBe('patient_tester')
  })

  it('shows a signed-in non-member as "not added yet", not as a member', async () => {
    const f = browserFetch()
    const auth = createAuthClient(AUTH, f)
    const user = await auth.signIn('rls-stranger@example.com', PASSWORD)
    const data = createDataClient(API, () => auth.getJwt(), f)
    expect(await getMembership(data, user.id)).toBeNull()
  })

  it('turns a wrong password into the plain-language message', async () => {
    const auth = createAuthClient(AUTH, browserFetch())
    const err = await auth.signIn('rls-a@example.com', 'definitely-wrong-1').catch((e) => e)
    expect(err).toBeInstanceOf(AuthError)
    expect((err as AuthError).code).toBe('INVALID_EMAIL_OR_PASSWORD')
    expect((err as AuthError).message).toMatch(/don't match/)
  })

  it('rejects a wrong reset code with the plain-language message', async () => {
    const auth = createAuthClient(AUTH, browserFetch())
    const err = await auth.resetPassword('rls-a@example.com', '000000', 'Never-Applied-9!').catch((e) => e)
    expect((err as AuthError).code).toBe('INVALID_OTP')
    expect((err as AuthError).message).toMatch(/code isn't right/)
  })

  it('saves a conversation turn through the app’s own log, within the real table constraints', async () => {
    const f = browserFetch()
    const auth = createAuthClient(AUTH, f)
    await auth.signIn('rls-a@example.com', PASSWORD)
    const data = createDataClient(API, () => auth.getJwt(), f)
    const log = new ConversationLog(data, 'rls-p1')
    const outcome = {
      triage: { tier: 'checkin', criteria: ['single_low', 'classifier_checkin'], doseIntent: false, softened: false, classifierFailed: false },
      tier: 'checkin',
      cards: [
        { kind: 'escalation', tier: 'checkin', criteria: ['single_low'] },
        { kind: 'answer', text: 'Use the Rule of 15.', sources: [{ id: 'rls-k1', doc_title: 'RLS fixture', source_label: 'care_team', section: null, body: '', tags: [] }] },
      ],
      doseSession: false, guard: null, monitor: 'background', monitorVerdict: null, background: null, modelCalls: 3,
    } as unknown as TurnOutcome
    await log.record("I'm at 62", outcome)
    await log.record('what should I eat', outcome)
    const msgs = await data.get<{ turn: number; role: string }[]>(`messages?session_id=eq.${log.id}&select=turn,role&order=turn,role`)
    expect(msgs).toEqual([
      { turn: 0, role: 'assistant' }, { turn: 0, role: 'user' },
      { turn: 1, role: 'assistant' }, { turn: 1, role: 'user' },
    ])
    const events = await data.get<{ tier: string; source: string }[]>(`triage_events?session_id=eq.${log.id}&select=tier,source`)
    expect(events).toEqual([{ tier: 'checkin', source: 'classifier' }, { tier: 'checkin', source: 'classifier' }])
  })

  it('after sign-out the session is gone', async () => {
    const f = browserFetch()
    const auth = createAuthClient(AUTH, f)
    await auth.signIn('rls-b@example.com', PASSWORD)
    await auth.signOut()
    expect(await auth.getSession()).toBeNull()
  })
})
