// Offline checks of the sign-in client's decisions. Live behavior against Neon is in
// db/tests/auth-client.test.ts (`npm run test:db`).

import { describe, expect, it } from 'vitest'
import { friendlyAuthMessage, jwtExpiry, needsRefresh, newPasswordProblem } from './auth'
import { viewsFor } from './data'

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwtWithExp = (exp: number) => `${b64url({ alg: 'EdDSA' })}.${b64url({ sub: 'u1', exp })}.sig`

describe('messages an older user sees', () => {
  // Codes observed from Neon Auth on 2026-11-14 (INVALID_OTP, HTTP 429) plus Better
  // Auth's documented sign-in and password codes. None may surface as raw jargon.
  it.each([
    ['INVALID_EMAIL_OR_PASSWORD', 401, /don't match/],
    ['INVALID_OTP', 400, /code isn't right/],
    ['OTP_EXPIRED', 400, /expired/],
    ['TOO_MANY_ATTEMPTS', 403, /new code/],
    ['PASSWORD_TOO_SHORT', 400, /8 characters/],
    ['NETWORK', 0, /internet connection/],
  ])('%s reads as plain language', (code, status, re) => {
    const msg = friendlyAuthMessage(code, status)
    expect(msg).toMatch(re)
    expect(msg).not.toMatch(/[A-Z]{2,}_[A-Z]/) // no error codes leak into the text
  })

  it('treats any rate limit (429) as "wait a minute", whatever the code', () => {
    expect(friendlyAuthMessage('HTTP_429', 429)).toMatch(/wait a minute/)
  })
})

describe('new password checks', () => {
  it('rejects passwords under 8 characters before calling the server', () => {
    expect(newPasswordProblem('short', 'short')).toMatch(/8 characters/)
  })
  it('catches a mistyped confirmation', () => {
    expect(newPasswordProblem('long-enough-1', 'long-enough-2')).toMatch(/don't match/)
  })
  it('accepts a matching password of 8+ characters', () => {
    expect(newPasswordProblem('long-enough-1', 'long-enough-1')).toBeNull()
  })
})

describe('Data API token refresh', () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0)
  it('reuses a token with more than a minute left', () => {
    expect(needsRefresh(jwtWithExp(now / 1000 + 600), now)).toBe(false)
  })
  it('refreshes a token about to expire, so a request does not fail mid-conversation', () => {
    expect(needsRefresh(jwtWithExp(now / 1000 + 30), now)).toBe(true)
  })
  it('refreshes when there is no token or it cannot be read', () => {
    expect(needsRefresh(null, now)).toBe(true)
    expect(needsRefresh('not-a-jwt', now)).toBe(true)
    expect(jwtExpiry('not-a-jwt')).toBeNull()
  })
})

describe('views per role (ADR-0011)', () => {
  it('gives admin both views and each tester role exactly one', () => {
    expect(viewsFor('admin')).toEqual(['patient', 'careteam'])
    expect(viewsFor('patient_tester')).toEqual(['patient'])
    expect(viewsFor('careteam_tester')).toEqual(['careteam'])
  })
})
