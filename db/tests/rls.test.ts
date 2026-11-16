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
//   - Roles (migration 0002, Kay's names): patient_tester sees only the patient view,
//     careteam_tester only the care-team view, admin both; consent still binds admin.
//
// Runs against a throwaway Neon branch (never production), outside the offline gate:
//   RLS_AUTH_URL=... RLS_DATA_API_URL=... RLS_PASSWORD=... npm run test:db
// Users (created once on that branch): rls-a, rls-b (patient_tester), rls-sponsor
// (careteam_tester; the email predates the rename), rls-admin (admin), rls-stranger
// (signed in, not a member). Seed: patient 'rls-p1', one reading, one chunk, and (after
// migration 0003) two topic cards: 'card-rls-approved' (approved) and 'card-rls-draft'.

import { beforeAll, describe, expect, it } from 'vitest'

const AUTH = process.env.RLS_AUTH_URL ?? ''
const API = process.env.RLS_DATA_API_URL ?? ''
const PASSWORD = process.env.RLS_PASSWORD ?? ''
const ORIGIN = 'http://localhost:5173' // allow_localhost is on for development branches

const configured = Boolean(AUTH && API && PASSWORD)

type Who = 'a' | 'b' | 'careteam' | 'admin' | 'stranger'
const EMAIL: Record<Who, string> = {
  a: 'rls-a@example.com',
  b: 'rls-b@example.com',
  careteam: 'rls-sponsor@example.com',
  admin: 'rls-admin@example.com',
  stranger: 'rls-stranger@example.com',
}
const token: Partial<Record<Who, string>> = {}
const userId: Partial<Record<Who, string>> = {}

// Neon Auth rate-limits sign-in (429 "Too many requests") when the suite is rerun
// back to back, e.g. during mutation checks. Retry with backoff, honoring Retry-After.
async function signInRequest(who: Who): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${AUTH}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: EMAIL[who], password: PASSWORD }),
    })
    if (res.status !== 429 || attempt >= 5) return res
    const wait = Number(res.headers.get('retry-after')) || 2 ** attempt * 2
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
}

async function signIn(who: Who): Promise<void> {
  const res = await signInRequest(who)
  if (!res.ok) throw new Error(`sign-in ${who}: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string } }
  userId[who] = body.user.id
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const t = await fetch(`${AUTH}/token`, { headers: { Cookie: cookie, Origin: ORIGIN } })
  if (!t.ok) throw new Error(`token ${who}: ${t.status} ${await t.text()}`)
  token[who] = ((await t.json()) as { token: string }).token
}

async function api(who: Who | null, method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Prefer: prefer }
  if (who) headers.Authorization = `Bearer ${token[who]}`
  const res = await fetch(`${API}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}
const rows = (r: { data: unknown }) => (Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [])
const denied = (r: { status: number }) => r.status === 401 || r.status === 403

// Write-denial checks must ask for `return=minimal`. With `return=representation`,
// RETURNING also needs SELECT visibility, so an insert the caller can't read back
// fails even when the *insert* rule would have let it through. A mutation run showed
// exactly that: sessions_create widened to any member, and the "care team cannot
// start a session" test still passed, masked by the read rule. A real client can
// send return=minimal, so the write rule alone must stop it.
const tryInsert = (who: Who, table: string, body: unknown) => api(who, 'POST', table, body, 'return=minimal')

// State built up across the ordered cases below.
let sessionA = '' // tester A's session; its summary stays 'kept'
let sessionB = '' // tester B's session; its summary is shared ('auto')

describe.skipIf(!configured)('RLS against a Neon branch', () => {
  beforeAll(async () => {
    for (const who of ['a', 'b', 'careteam', 'admin', 'stranger'] as Who[]) await signIn(who)
  }, 180_000)

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
      const r = await tryInsert('stranger', 'sessions', { patient_id: 'rls-p1' })
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
      const r = await tryInsert('a', 'replies', { session_id: sessionA, body: 'self-reply' })
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
      const r = await tryInsert('b', 'messages', { session_id: sessionA, turn: 1, role: 'user', content: 'intrusion' })
      expect(denied(r)).toBe(true)
    })
    it('cannot create a session in someone else’s name', async () => {
      const r = await tryInsert('b', 'sessions', { patient_id: 'rls-p1', user_id: userId.a })
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
      const seen = rows(await api('careteam', 'GET', `summaries?session_id=eq.${sessionB}&select=fields`))
      expect(seen[0]?.fields).toEqual({ reading: { value: 380, turn: 0 } })
    })
  })

  describe('care-team tester', () => {
    it('sees the shared summary and its transcript', async () => {
      expect(rows(await api('careteam', 'GET', `summaries?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect(rows(await api('careteam', 'GET', `messages?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect(rows(await api('careteam', 'GET', `sessions?id=eq.${sessionB}`))).toHaveLength(1)
    })
    it('does not see the summary or transcript a patient kept private', async () => {
      expect(rows(await api('careteam', 'GET', `summaries?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('careteam', 'GET', `messages?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('careteam', 'GET', `sessions?id=eq.${sessionA}`))).toHaveLength(0)
    })
    it('replies on a shared summary, and the patient sees it', async () => {
      expect((await api('careteam', 'POST', 'replies', { session_id: sessionB, body: 'A nurse will call you today.' })).status).toBe(201)
      expect(rows(await api('b', 'GET', `replies?session_id=eq.${sessionB}`)).length).toBeGreaterThanOrEqual(1)
      expect(rows(await api('a', 'GET', `replies?session_id=eq.${sessionB}`))).toHaveLength(0)
    })
    it('cannot reply on a summary the patient kept private', async () => {
      const r = await tryInsert('careteam', 'replies', { session_id: sessionA, body: 'should not land' })
      expect(denied(r)).toBe(true)
    })
    it('cannot start a patient session (care-team view only)', async () => {
      const r = await tryInsert('careteam', 'sessions', { patient_id: 'rls-p1' })
      expect(denied(r)).toBe(true)
    })
    it('sees every member (names for the inbox)', async () => {
      const ids = rows(await api('careteam', 'GET', 'members?select=user_id')).map((m) => m.user_id)
      expect(ids).toEqual(expect.arrayContaining([userId.a, userId.b, userId.careteam, userId.admin]))
      expect(ids).not.toContain(userId.stranger)
    })
  })

  describe('admin (both views)', () => {
    it('uses the patient view: starts and reads its own session', async () => {
      const s = await api('admin', 'POST', 'sessions', { patient_id: 'rls-p1' })
      expect(s.status).toBe(201)
      const id = rows(s)[0].id as string
      expect((await api('admin', 'POST', 'messages', { session_id: id, turn: 0, role: 'user', content: 'admin check' })).status).toBe(201)
      expect(rows(await api('admin', 'GET', `messages?session_id=eq.${id}`))).toHaveLength(1)
    })
    it('uses the care-team view: reads and replies on a shared summary', async () => {
      expect(rows(await api('admin', 'GET', `summaries?session_id=eq.${sessionB}`))).toHaveLength(1)
      expect((await api('admin', 'POST', 'replies', { session_id: sessionB, body: 'admin reply' })).status).toBe(201)
    })
    it('plays both sides alone: shares its own summary, then replies to it from the inbox', async () => {
      // Kay's solo demo loop: one admin account acts as patient, then as care team.
      const s = await api('admin', 'POST', 'sessions', { patient_id: 'rls-p1' })
      const id = rows(s)[0].id as string
      expect((await api('admin', 'POST', 'summaries', { session_id: id, fields: { reason: { value: 'demo', turn: 0 } }, shared: 'patient_sent' })).status).toBe(201)
      expect((await tryInsert('admin', 'replies', { session_id: id, body: 'Care team reply to my own demo' })).status).toBe(201)
      expect(rows(await api('admin', 'GET', `replies?session_id=eq.${id}`))).toHaveLength(1)
      // ...while other people's shares stay readable only because they were shared:
      expect(rows(await api('careteam', 'GET', `summaries?session_id=eq.${id}`))).toHaveLength(1)
    })
    it('is still bound by consent: a kept summary stays private', async () => {
      expect(rows(await api('admin', 'GET', `summaries?session_id=eq.${sessionA}`))).toHaveLength(0)
      expect(rows(await api('admin', 'GET', `messages?session_id=eq.${sessionA}`))).toHaveLength(0)
    })
  })

  // Migration 0003 (ADR-0013): patients see a topic card word for word, so only cards
  // the sponsor approved may leave the database. Seed: 'card-rls-approved' (approved)
  // and 'card-rls-draft' (draft).
  describe('topic cards', () => {
    it('nobody signed in, and a stranger with an account, see no cards', async () => {
      const anon = await api(null, 'GET', 'kb_cards?select=id')
      expect(denied(anon) || rows(anon).length === 0).toBe(true)
      expect(rows(await api('stranger', 'GET', 'kb_cards?select=id'))).toHaveLength(0)
    })
    it('every member role sees approved cards only, never a draft', async () => {
      for (const who of ['a', 'careteam', 'admin'] as Who[]) {
        const seen = rows(await api(who, 'GET', 'kb_cards?select=id,status'))
        expect(seen.map((r) => r.id), who).toContain('card-rls-approved')
        expect(seen.map((r) => r.id), who).not.toContain('card-rls-draft')
        expect(seen.every((r) => r.status === 'approved'), who).toBe(true)
      }
    })
    it('no one can write a card or approve one through the Data API, admin included', async () => {
      for (const who of ['a', 'admin'] as Who[]) {
        expect(denied(await tryInsert(who, 'kb_cards', { id: 'card-rls-intruder', topic: 't', body: 'b', source_ids: ['x'] })), who).toBe(true)
        await api(who, 'PATCH', 'kb_cards?id=eq.card-rls-draft', { status: 'approved', approved_by: 'self', approved_at: new Date().toISOString() }, 'return=minimal')
      }
      expect(rows(await api('a', 'GET', 'kb_cards?id=eq.card-rls-draft&select=id'))).toHaveLength(0) // still a draft
    })
  })
})
