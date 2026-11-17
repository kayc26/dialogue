// Neon Function "llm": the model proxy (ADR-0014, C). Holds the shared OpenRouter key
// (OPENROUTER_API_KEY, set at deploy from .env.local through neon.ts; never in the site)
// and spends it for signed-in members, up to $1 per tester. The logic lives in
// src/lib/proxy/ and is tested offline; this file supplies the real dependencies:
//   - Neon Auth's signing keys (NEON_AUTH_JWKS_URL, NEON_AUTH_BASE_URL: injected by Neon);
//   - the branch database (DATABASE_URL: injected), for membership and public.llm_spend;
//   - OpenRouter.

import { neon } from '@neondatabase/serverless'
import { handle, type ProxyDeps } from '../../src/lib/proxy/handler'
import type { Jwk } from '../../src/lib/proxy/jwt'
import { proxyConfig, type Role } from '../../src/lib/proxy/policy'

const sql = neon(process.env.DATABASE_URL!)
const cfg = proxyConfig(process.env)

let keys: { at: number; list: Jwk[] } | null = null
async function jwks(): Promise<Jwk[]> {
  if (keys && Date.now() - keys.at < 10 * 60_000) return keys.list
  const res = await fetch(process.env.NEON_AUTH_JWKS_URL!)
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  keys = { at: Date.now(), list: ((await res.json()) as { keys: Jwk[] }).keys }
  return keys.list
}

const deps: ProxyDeps = {
  cfg,
  issuer: process.env.NEON_AUTH_BASE_URL!,
  jwks,
  async role(userId) {
    const rows = await sql`select role from public.members where user_id = ${userId}`
    return (rows[0]?.role as Role | undefined) ?? null
  },
  async spent(userId) {
    const rows = await sql`select coalesce(sum(cost), 0)::float8 as used from public.llm_spend where user_id = ${userId}`
    return Number(rows[0]?.used ?? 0)
  },
  async record({ userId, model, cost, tokens }) {
    await sql`insert into public.llm_spend (user_id, model, cost, tokens) values (${userId}, ${model}, ${cost}, ${tokens})`
  },
  upstream(body) {
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Diabetes Education Assistant (demo)',
      },
      body: JSON.stringify(body),
    })
  },
}

export default {
  fetch: (request: Request) => handle(request, deps),
}
