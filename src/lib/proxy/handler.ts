// The model proxy's request handling (ADR-0014, C): one shared OpenRouter key, held by a
// Neon Function, spent on behalf of signed-in members up to $1 per tester. Everything
// it talks to is passed in, so the flow is tested offline (handler.test.ts); the deployed
// function (functions/llm/index.ts) supplies the real database, OpenRouter, and keys.
//
//   OPTIONS *                  CORS preflight
//   GET  /allowance            { used, cap, percent } for the caller
//   POST /chat/completions     forwarded to OpenRouter if the caller is a member with
//                              allowance left; the reply streams back unchanged, and
//                              its cost is recorded against the caller

import { AuthError, verifyJwt, type Jwk } from './jwt'
import { allowance, checkChatRequest, corsHeaders, type ProxyConfig, type Role } from './policy'
import { StreamCost, costOfJson } from './cost'

export interface ProxyDeps {
  cfg: ProxyConfig
  issuer: string
  jwks(): Promise<Jwk[]>
  /** The caller's role from public.members, or null for a non-member. */
  role(userId: string): Promise<Role | null>
  /** Dollars spent so far by this user through the proxy. */
  spent(userId: string): Promise<number>
  record(entry: { userId: string; model: string; cost: number; tokens: number }): Promise<void>
  /** POST the checked body to OpenRouter with the shared key. */
  upstream(body: Record<string, unknown>): Promise<Response>
}

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

export async function handle(req: Request, deps: ProxyDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get('origin'), deps.cfg)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  // Who is calling: a valid Neon Auth token, and a member.
  const auth = req.headers.get('authorization') ?? ''
  if (!/^bearer /i.test(auth)) return json(401, { error: 'sign_in_required' }, cors)
  let userId: string
  try {
    userId = (await verifyJwt(auth.slice(7).trim(), await deps.jwks(), { issuer: deps.issuer })).sub
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? 'bad_token' : 'auth_unavailable' }, cors)
  }
  const role = await deps.role(userId)
  if (!role) return json(403, { error: 'not_a_member' }, cors)

  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  const left = allowance(role, await deps.spent(userId), deps.cfg)

  if (req.method === 'GET' && path.endsWith('/allowance')) {
    return json(200, { used: left.used, cap: left.cap, percent: left.percent }, cors)
  }

  if (req.method === 'POST' && path.endsWith('/chat/completions')) {
    if (!left.allowed) return json(402, { error: { message: 'allowance_used' }, used: left.used, cap: left.cap }, cors)
    const checked = checkChatRequest(await req.text())
    if (!checked.ok) return json(checked.status, { error: { message: checked.error } }, cors)
    const model = String(checked.body.model)
    const up = await deps.upstream(checked.body)
    const headers = { ...cors, 'Content-Type': up.headers.get('content-type') ?? 'application/json' }
    if (!up.ok || !up.body) return new Response(await up.text(), { status: up.status, headers })

    if (checked.body.stream !== true) {
      const body = (await up.json()) as unknown
      const { cost, tokens } = costOfJson(body)
      await deps.record({ userId, model, cost, tokens })
      return json(up.status, body, cors)
    }
    // Stream through unchanged; count the cost from the final usage chunk.
    const meter = new StreamCost()
    const decoder = new TextDecoder()
    const counted = up.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) {
          meter.push(decoder.decode(chunk, { stream: true }))
          ctl.enqueue(chunk)
        },
        async flush() {
          meter.flush()
          await deps.record({ userId, model, cost: meter.cost, tokens: meter.tokens })
        },
      }),
    )
    return new Response(counted, { status: up.status, headers })
  }

  return json(404, { error: 'not_found' }, cors)
}
