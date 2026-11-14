// Row-level security, tested the way the app will hit it: real sign-in through
// Neon's Managed Better Auth, a real JWT, real Data API requests. Nothing is mocked;
// SQL-side impersonation isn't possible because auth.user_id() only trusts a signed
// token (pg_session_jwt).
//
// Why each case matters (ADR-0010, ADR-0008):
//   - The site is public and anyone could hold an account, so being signed in must
//     grant nothing; membership in public.members is what grants access.
//   - Consent C: a summary the patient kept stays private, even from the sponsor;
//     a shared one reaches the sponsor's inbox together with its transcript.
//   - A shared summary can't be quietly pulled back once a nurse may be acting on it.
//
// Runs against a throwaway Neon branch (never production), outside the offline gate:
//   RLS_AUTH_URL=... RLS_DATA_API_URL=... RLS_PASSWORD=... npm run test:db
// Users (created once on that branch): rls-a, rls-b (testers), rls-sponsor (sponsor),
// rls-stranger (signed in, not a member). Seed: patient 'rls-p1', one reading, one chunk.

import { beforeAll, describe, expect, it } from 'vitest'

const AUTH = process.env.RLS_AUTH_URL ?? ''
const API = process.env.RLS_DATA_API_URL ?? ''
const PASSWORD = process.env.RLS_PASSWORD ?? ''
const ORIGIN = 'http://localhost:5173' // allow_localhost is on for development branches

const configured = Boolean(AUTH && API && PASSWORD)

type Who = 'a' | 'b' | 'sponsor' | 'stranger'
const EMAIL: Record<Who, string> = {
  a: 'rls-a@example.com',
  b: 'rls-b@example.com',
  sponsor: 'rls-sponsor@example.com',
  stranger: 'rls-stranger@example.com',
}
const token: Partial<Record<Who, string>> = {}
const userId: Partial<Record<Who, string>> = {}

async function signIn(who: Who): Promise<void> {
  const res = await fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL[who], password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`sign-in ${who}: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string } }
  userId[who] = body.user.id
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const t = await fetch(`${AUTH}/token`, { headers: { Cookie: cookie, Origin: ORIGIN } })
  if (!t.ok) throw new Error(`token ${who}: ${t.status} ${await t.text()}`)
  token[who] = ((await t.json()) as { token: string }).token
}

async function api(who: Who | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Prefer: 'return=representation' }
  if (who) headers.Authorization = `Bearer ${token[who]}`
  const res = await fetch(`${API}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}
const rows = (r: { data: unknown }) => (Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [])
const denied = (r: { status: number }) => r.status === 401 || r.status === 403

// State built up across the ordered cases below.
let sessionA = '' // tester A's session; its summary stays 'kept'
let sessionB = '' // tester B's session; its summary is shared ('auto')

describe.skipIf(!configured)('RLS against a Neon branch', () => {
  beforeAll(async () => {
    await Promise.all((['a', 'b', 'sponsor', 'stranger'] as Who[]).map(signIn))
  }, 30_000)

  describe('nobody signed in', () => {
    it('cannot read any table', async () => {
      for (const t of ['patients', 'glucose_readings', 'kb_chunks', 'members', 'sessions', 'summaries']) {
        const r = await api(null, 'GET', `${t}?select=*`)
        expect(denied(r) || rows(r).length === 0, `${t} -> ${r.status}`).toBe(true)
      }
    })
  })

  describe('signed in but not a member (a stranger with an account)', () => {
    // Every table, including conversation data: a mutation run (summaries_read
    // weakened to `using (true)`) showed that checking only reference tables let a
    // stranger read every summary without a failing test.
    it('sees nothing in any table', async () => {
      for (const t of ['patients', 'glucose_readings', 'kb_chunks', 'members', 'sessions', 'messages', 'triage_events', 'summaries', 'replies']) {
        const r = await api('stranger', 'GET', `${t}?select=*`)
        expect(rows(r), t).toHaveLength(0)
      }
    })
    it('cannot start a session', async () => {
      const r = await api('stranger', 'POST', 'sessions', { patient_id: 'rls-p1' })
      expect(denied(r)).toBe(true)
    })
  })

  describe('auth tables', () => {
    it('are not reachable through the Data API, even signed in', async () => {
      const r = await api('a', 'GET', 'user?select=*')
      expect(r.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('tester A', () => {
    it('reads the reference data', async () => {
      expect(rows(await api('a', 'GET', 'patients?select=id'))).toEqual([{ id: 'rls-p1' }])
      expect(rows(await api('a', 'GET', 'glucose_readings?select=patient_id')).length).toBeGreaterThan(0)
      expect(rows(await api('a', 'GET', 'kb_chunks?select=id')).length).toBeGreaterThan(0)
    })
    it('sees only their own membership row', async () => {
      const r = rows(await api('a', 'GET', 'members?select=user_id'))
      expect(r).toEqual([{ user_id: userId.a }])
    })
    it('starts a session, writes a turn, and keeps the summary private', async () => {
      const s = await api('a', 'POST', 'sessions', { patient_id: 'rls-p1' })
      expect(s.status).toBe(201)
      sessionA = rows(s)[0].id as string
      expect((await api('a', 'POST', 'messages', { session_id: sessionA, turn: 0, role: 'user', content: 'what can I snack on?' })).status).toBe(201)
      expect((await api('a', 'POST', 'summaries', { session_id: sessionA, fields: { reason: { value: 'snacks', turn: 0 } }, shared: 'kept' })).status).toBe(201)
    })
    it('cannot change demo patients', async () => {
      const r = await api('a', 'PATCH', 'patients?id=eq.rls-p1', { age: 1 })
      expect(denied(r)).toBe(true)
    })
    it('cannot write a nurse reply', async () => {
      const r = await api('a', 'POST', 'replies', { session_id: sessionA, body: 'self-reply' })
      expect(denied(r)).toBe(true)
    })
  })

  describe('tester B', () => {
    it('cannot see tester A’s session, transcript, or summary', async () => {
      expect(rows(await api('b', 'GET', `sessions?id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('b', 'GET', `messages?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('b', 'GET', `summaries?session_id=eq.${sessionA}`))).toHaveLength(0)
    })
    it('cannot write into tester A’s session', async () => {
      const r = await api('b', 'POST', 'messages', { session_id: sessionA, turn: 1, role: 'user', content: 'intrusion' })
      expect(denied(r)).toBe(true)
    })
    it('cannot create a session in someone else’s name', async () => {
      const r = await api('b', 'POST', 'sessions', { patient_id: 'rls-p1', user_id: userId.a })
      expect(denied(r)).toBe(true)
    })
    it('shares a flagged summary with the care team', async () => {
      const s = await api('b', 'POST', 'sessions', { patient_id: 'rls-p1' })
      expect(s.status).toBe(201)
      sessionB = rows(s)[0].id as string
      expect((await api('b', 'POST', 'messages', { session_id: sessionB, turn: 0, role: 'user', content: 'my sugar is 380' })).status).toBe(201)
      expect((await api('b', 'POST', 'summaries', { session_id: sessionB, fields: { reading: { value: 380, turn: 0 } }, shared: 'auto' })).status).toBe(201)
    })
    it('cannot pull a shared summary back to private', async () => {
      const r = await api('b', 'PATCH', `summaries?session_id=eq.${sessionB}`, { shared: 'kept' })
      expect(r.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('tester A tampering with B', () => {
    it('cannot modify tester B’s summary', async () => {
      await api('a', 'PATCH', `summaries?session_id=eq.${sessionB}`, { fields: { tampered: true } })
      const seen = rows(await api('sponsor', 'GET', `summaries?session_id=eq.${sessionB}&select=fields`))
      expect(seen[0]?.fields).toEqual({ reading: { value: 380, turn: 0 } })
    })
  })

  describe('sponsor (care team)', () => {
    it('sees the shared summary and its transcript', async () => {
      expect(rows(await api('sponsor', 'GET', `summaries?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect(rows(await api('sponsor', 'GET', `messages?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect(rows(await api('sponsor', 'GET', `sessions?id=eq.${sessionB}`))).toHaveLength(1)
    })
    it('does not see the summary or transcript a patient kept private', async () => {
      expect(rows(await api('sponsor', 'GET', `summaries?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('sponsor', 'GET', `messages?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('sponsor', 'GET', `sessions?id=eq.${sessionA}`))).toHaveLength(0)
    })
    it('replies on a shared summary, and the patient sees it', async () => {
      expect((await api('sponsor', 'POST', 'replies', { session_id: sessionB, body: 'A nurse will call you today.' })).status).toBe(201)
      expect(rows(await api('b', 'GET', `replies?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect(rows(await api('a', 'GET', `replies?session_id=eq.${sessionB}`))).toHaveLength(0)
    })
    it('cannot reply on a summary the patient kept private', async () => {
      const r = await api('sponsor', 'POST', 'replies', { session_id: sessionA, body: 'should not land' })
      expect(denied(r)).toBe(true)
    })
    it('sees every member (names for the inbox)', async () => {
      const ids = rows(await api('sponsor', 'GET', 'members?select=user_id')).map((m) => m.user_id)
      expect(ids).toEqual(expect.arrayContaining([userId.a, userId.b, userId.sponsor]))
      expect(ids).not.toContain(userId.stranger)
    })
  })
})
