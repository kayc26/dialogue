// The model proxy holds the shared OpenRouter key (ADR-0014, C), so these are the checks
// that stand between a browser and the shared account: a forged or expired sign-in token
// is refused, a non-member is refused, a tester stops at $1, only the assistant's models
// at their output caps go through, and each reply's cost is counted even when the usage
// chunk arrives split across network chunks.

import { beforeAll, describe, expect, it } from 'vitest'
import { verifyJwt, type Jwk } from './jwt'
import { handle, type ProxyDeps } from './handler'
import { ALLOWED_MODELS, proxyConfig, type Role } from './policy'
import { MODELS } from '../chat/prompts'

const ISSUER = 'https://ep-test.neonauth.example.com/neondb/auth'
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let keys: CryptoKeyPair
let jwk: Jwk

async function token(payload: Record<string, unknown>, signWith: CryptoKey = keys.privateKey): Promise<string> {
  const head = enc({ alg: 'EdDSA', kid: 'k1' })
  const body = enc(payload)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signWith, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}
const now = () => Math.floor(Date.now() / 1000)
const claims = (sub: string, extra: Record<string, unknown> = {}) => ({ sub, iss: ISSUER, exp: now() + 600, ...extra })

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  jwk = { ...((await crypto.subtle.exportKey('jwk', keys.publicKey)) as Jwk), kid: 'k1' }
})

describe('sign-in token check', () => {
  it('accepts a token signed by the branch key, and returns the user id', async () => {
    expect(await verifyJwt(await token(claims('user-1')), [jwk], { issuer: ISSUER })).toEqual({ sub: 'user-1' })
  })
  it('refuses a forged signature, an edited payload, an expired token, and another issuer', async () => {
    const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    await expect(verifyJwt(await token(claims('user-1'), other.privateKey), [jwk], { issuer: ISSUER })).rejects.toThrow('bad signature')
    const good = await token(claims('user-1'))
    const [h, , s] = good.split('.')
    await expect(verifyJwt(`${h}.${enc(claims('admin-user'))}.${s}`, [jwk], { issuer: ISSUER })).rejects.toThrow('bad signature')
    await expect(verifyJwt(await token(claims('user-1', { exp: now() - 3600 })), [jwk], { issuer: ISSUER })).rejects.toThrow('expired')
    await expect(verifyJwt(await token(claims('user-1', { iss: 'https://evil.example.com' })), [jwk], { issuer: ISSUER })).rejects.toThrow('wrong issuer')
  })
  it('refuses an unsigned ("alg: none") token', async () => {
    const unsigned = `${enc({ alg: 'none' })}.${enc(claims('user-1'))}.`
    await expect(verifyJwt(unsigned, [jwk], { issuer: ISSUER })).rejects.toThrow('unsupported alg')
  })
})

describe('the proxy', () => {
  const ORIGIN = 'https://kayc26.github.io'
  const cfg = proxyConfig({})
  const HAIKU = MODELS.answer.id

  function setup(o: { role?: Role | null; spent?: number; upstream?: (body: Record<string, unknown>) => Response } = {}) {
    const sent: Record<string, unknown>[] = []
    const recorded: { userId: string; model: string; cost: number; tokens: number }[] = []
    const deps: ProxyDeps = {
      cfg, issuer: ISSUER,
      jwks: async () => [jwk],
      role: async () => (o.role === undefined ? 'patient_tester' : o.role),
      spent: async () => o.spent ?? 0,
      record: async (e) => void recorded.push(e),
      upstream: async (body) => {
        sent.push(body)
        return o.upstream ? o.upstream(body) : Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { cost: 0.002, completion_tokens: 40 } })
      },
    }
    return { deps, sent, recorded }
  }
  const call = async (deps: ProxyDeps, init: { method?: string; path?: string; body?: unknown; auth?: string | null; origin?: string }) =>
    handle(
      new Request(`https://fn.example.com${init.path ?? '/chat/completions'}`, {
        method: init.method ?? 'POST',
        headers: {
          origin: init.origin ?? ORIGIN,
          ...(init.auth === null ? {} : { authorization: `Bearer ${init.auth ?? (await token(claims('user-1')))}` }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
      deps,
    )
  const chat = (extra: Record<string, unknown> = {}) => ({ model: HAIKU, messages: [{ role: 'user', content: 'hi' }], ...extra })

  it('refuses a call with no sign-in, and a signed-in non-member, without spending anything', async () => {
    const a = setup()
    expect((await call(a.deps, { body: chat(), auth: null })).status).toBe(401)
    const b = setup({ role: null })
    expect((await call(b.deps, { body: chat() })).status).toBe(403)
    expect([...a.sent, ...b.sent]).toEqual([])
  })

  it('a tester who has used the $1 allowance gets 402, and OpenRouter is never called', async () => {
    const { deps, sent } = setup({ spent: 1.0004 })
    const res = await call(deps, { body: chat() })
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ error: { message: 'allowance_used' } })
    expect(sent).toEqual([])
  })

  it('reports the allowance as a percentage; admin is metered but not capped', async () => {
    const t = setup({ spent: 0.257 })
    expect(await (await call(t.deps, { method: 'GET', path: '/allowance' })).json()).toEqual({ used: 0.257, cap: 1, percent: 25 })
    const a = setup({ role: 'admin', spent: 3.5 })
    expect(await (await call(a.deps, { method: 'GET', path: '/allowance' })).json()).toEqual({ used: 3.5, cap: null, percent: null })
    expect((await call(a.deps, { body: chat() })).status).toBe(200)
  })

  it('only the assistant\'s models get through, and max_tokens is clamped to that model\'s cap', async () => {
    const { deps, sent } = setup()
    expect((await call(deps, { body: chat({ model: 'openai/gpt-5-pro' }) })).status).toBe(400)
    expect(sent).toEqual([])
    await call(deps, { body: chat({ max_tokens: 100_000 }) })
    expect(sent[0]).toMatchObject({ model: HAIKU, max_tokens: ALLOWED_MODELS[HAIKU], usage: { include: true } })
  })

  it('records the cost of a non-streamed reply against the caller', async () => {
    const { deps, recorded } = setup()
    await call(deps, { body: chat() })
    expect(recorded).toEqual([{ userId: 'user-1', model: HAIKU, cost: 0.002, tokens: 40 }])
  })

  it('streams the reply through unchanged and counts its cost, even with the usage chunk split mid-JSON', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[],"usage":{"cost":0.0031,"completion_tokens":12}}\n\ndata: [DONE]\n\n'
    const cut = sse.indexOf('"cost"') + 4
    const pieces = [sse.slice(0, 30), sse.slice(30, cut), sse.slice(cut)].map((s) => new TextEncoder().encode(s))
    const { deps, recorded } = setup({
      upstream: () => new Response(new ReadableStream({ start(c) { pieces.forEach((p) => c.enqueue(p)); c.close() } }), { headers: { 'content-type': 'text/event-stream' } }),
    })
    const res = await call(deps, { body: chat({ stream: true }) })
    expect(await res.text()).toBe(sse) // byte for byte
    expect(recorded).toEqual([{ userId: 'user-1', model: HAIKU, cost: 0.0031, tokens: 12 }])
  })

  it('answers browsers only from the site\'s own origins', async () => {
    const { deps } = setup()
    const ok = await call(deps, { method: 'OPTIONS', auth: null })
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const other = await call(deps, { method: 'OPTIONS', auth: null, origin: 'https://evil.example.com' })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
})
