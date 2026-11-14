// The app's own sign-in and data clients (src/lib/neon), run against a live Neon
// branch. Node's fetch has no cookie jar, so a tiny one stands in for the browser:
// it keeps Set-Cookie values and sends them back, and adds the Origin header a
// browser would send. Same environment variables as rls.test.ts:
//   RLS_AUTH_URL=... RLS_DATA_API_URL=... RLS_PASSWORD=... npm run test:db

import { describe, expect, it } from 'vitest'
import { AuthError, createAuthClient } from '../../src/lib/neon/auth.ts'
import { createDataClient, getMembership } from '../../src/lib/neon/data.ts'

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
    const res = await fetch(input, { ...init, headers })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
    return res
  }
}

describe.skipIf(!configured)('app sign-in client against a Neon branch', () => {
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

  it('after sign-out the session is gone', async () => {
    const f = browserFetch()
    const auth = createAuthClient(AUTH, f)
    await auth.signIn('rls-b@example.com', PASSWORD)
    await auth.signOut()
    expect(await auth.getSession()).toBeNull()
  })
})
