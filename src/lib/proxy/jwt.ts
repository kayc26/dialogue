// Verify a Neon Auth (Managed Better Auth) JWT inside the model proxy (ADR-0014, C).
// The tokens are EdDSA-signed (Ed25519) and short-lived; the public keys come from the
// branch's JWKS (NEON_AUTH_JWKS_URL, injected into Neon Functions). Built on WebCrypto
// so the function needs no dependency for it.

export interface Jwk {
  kty: string
  crv?: string
  x?: string
  kid?: string
  alg?: string
}

export class AuthError extends Error {}

const b64urlBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const b64urlJson = (s: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>

/**
 * Returns the token's subject (the user id) when the signature checks out against one of
 * the keys, the issuer matches, and it hasn't expired. Throws AuthError otherwise.
 */
export async function verifyJwt(
  token: string,
  keys: Jwk[],
  opts: { issuer: string; now?: number; leewaySeconds?: number },
): Promise<{ sub: string }> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError('malformed token')
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = b64urlJson(parts[0])
    payload = b64urlJson(parts[1])
  } catch {
    throw new AuthError('malformed token')
  }
  if (header.alg !== 'EdDSA') throw new AuthError(`unsupported alg ${String(header.alg)}`)
  const candidates = keys.filter((k) => k.kty === 'OKP' && k.crv === 'Ed25519' && (header.kid === undefined || k.kid === header.kid))
  if (candidates.length === 0) throw new AuthError('no matching key')
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const sig = b64urlBytes(parts[2])
  let valid = false
  for (const jwk of candidates) {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, { name: 'Ed25519' }, false, ['verify'])
    if (await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, data)) {
      valid = true
      break
    }
  }
  if (!valid) throw new AuthError('bad signature')
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const leeway = opts.leewaySeconds ?? 30
  if (typeof payload.exp !== 'number' || payload.exp + leeway < now) throw new AuthError('expired')
  if (typeof payload.nbf === 'number' && payload.nbf - leeway > now) throw new AuthError('not yet valid')
  const iss = typeof payload.iss === 'string' ? new URL(payload.iss).origin : ''
  if (iss !== new URL(opts.issuer).origin) throw new AuthError('wrong issuer')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthError('no subject')
  return { sub: payload.sub }
}
