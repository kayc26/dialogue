// What the model proxy lets through (ADR-0014, C: one shared OpenRouter key in a Neon
// Function, $1 per tester). The browser never holds the key, so these checks are the
// only thing between a signed-in member and the shared account:
//   - only the models the assistant uses, each with its output cap (ADR-0012);
//   - a request size limit;
//   - a spending cap per role: testers stop at $1, Kay (admin) is metered but not capped;
//   - only the site's own origins may call it from a browser.

import { MODELS } from '../chat/prompts'

/** Model id → largest max_tokens allowed (the caps in prompts.ts). */
export const ALLOWED_MODELS: Record<string, number> = Object.values(MODELS).reduce<Record<string, number>>((m, x) => {
  m[x.id] = Math.max(m[x.id] ?? 0, x.maxTokens)
  return m
}, {})

export const MAX_BODY_BYTES = 200_000

export type Role = 'patient_tester' | 'careteam_tester' | 'admin'

export interface ProxyConfig {
  capDollars: number
  uncappedRoles: Role[]
  allowedOrigins: string[]
}

export function proxyConfig(env: Record<string, string | undefined>): ProxyConfig {
  return {
    capDollars: Number(env.CAP_DOLLARS ?? '1'),
    uncappedRoles: (env.UNCAPPED_ROLES ?? 'admin').split(',').map((s) => s.trim()).filter(Boolean) as Role[],
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'https://kayc26.github.io,http://localhost:5173').split(',').map((s) => s.trim()),
  }
}

export interface Allowance {
  used: number
  /** Null when the role is uncapped. */
  cap: number | null
  /** 0–100, rounded down; null when uncapped. */
  percent: number | null
  allowed: boolean
}

export function allowance(role: Role, used: number, cfg: ProxyConfig): Allowance {
  if (cfg.uncappedRoles.includes(role)) return { used, cap: null, percent: null, allowed: true }
  const percent = Math.min(100, Math.floor((used / cfg.capDollars) * 100))
  return { used, cap: cfg.capDollars, percent, allowed: used < cfg.capDollars }
}

export type Checked = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }

/**
 * Check a chat-completions request body and return the one to forward: the model must be
 * allowed, max_tokens is clamped to its cap (and set if missing), and usage accounting is
 * always on, because the cap is counted from it.
 */
export function checkChatRequest(raw: string): Checked {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'request_too_large' }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false, status: 400, error: 'bad_json' }
  }
  const model = typeof body.model === 'string' ? body.model : ''
  const cap = ALLOWED_MODELS[model]
  if (!cap) return { ok: false, status: 400, error: `model_not_allowed:${model}` }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, status: 400, error: 'no_messages' }
  const asked = typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : cap
  return { ok: true, body: { ...body, max_tokens: Math.min(asked, cap), usage: { include: true } } }
}

export function corsHeaders(origin: string | null, cfg: ProxyConfig): Record<string, string> {
  const h: Record<string, string> = {
    // Every header the chat's requests carry (completeChat sends X-Title). A browser asks
    // first and sends nothing if one is missing here: "Failed to fetch" (2026-11-16).
    'Access-Control-Allow-Headers': 'authorization, content-type, x-title',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && cfg.allowedOrigins.includes(origin)) h['Access-Control-Allow-Origin'] = origin
  return h
}
