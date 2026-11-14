// Sign-in client for Neon Managed Better Auth (ADR-0010, ADR-0011).
//
// Plain fetch instead of Neon's 0.x SDKs. Facts checked live against the project
// (2026-11-14):
//   - the session is an HttpOnly cookie marked `Partitioned` (CHIPS), so cross-site
//     requests from github.io work with `credentials: 'include'`;
//   - a Bearer session token is NOT accepted, so there is no token to keep in
//     localStorage (nothing for injected script to steal);
//   - GET /token turns the session into a short-lived JWT for the Data API;
//   - password reset works by emailed code: POST /forget-password/email-otp, then
//     POST /email-otp/reset-password (a wrong code returns code INVALID_OTP).
// Public sign-up is off: accounts are created by an admin, and a new user sets the
// first password through the same emailed-code reset.

export interface User {
  id: string
  email: string
  name: string
}

export class AuthError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Plain-language messages for older, low-tech-literacy users (ADR-0005). */
export function friendlyAuthMessage(code: string, status: number): string {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return "That email and password don't match. Check them and try again, or set a new password."
    case 'INVALID_OTP':
      return "That code isn't right. Check the email we sent and type the code again."
    case 'OTP_EXPIRED':
      return 'That code has expired. Ask for a new code.'
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many tries with that code. Ask for a new code.'
    case 'PASSWORD_TOO_SHORT':
      return 'Your new password needs at least 8 characters.'
    case 'PASSWORD_TOO_LONG':
      return 'Your new password is too long. Please use a shorter one.'
    case 'NETWORK':
      return "We can't reach the sign-in service. Check your internet connection and try again."
  }
  if (status === 429) return 'Too many attempts. Please wait a minute, then try again.'
  return 'Something went wrong. Please try again.'
}

/** Checks a new password before sending it. Returns a message, or null if it's fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Your new password needs at least 8 characters.'
  if (password !== confirm) return "The two passwords don't match. Type the same password in both boxes."
  return null
}

/** Seconds-since-epoch `exp` from a JWT, or null if unreadable. */
export function jwtExpiry(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

/** Refresh when the cached JWT has under a minute left (or can't be read). */
export function needsRefresh(jwt: string | null, nowMs: number): boolean {
  if (!jwt) return true
  const exp = jwtExpiry(jwt)
  return exp === null || exp * 1000 - nowMs < 60_000
}

export interface AuthClient {
  getSession(): Promise<User | null>
  signIn(email: string, password: string): Promise<User>
  signOut(): Promise<void>
  getJwt(): Promise<string>
  sendResetCode(email: string): Promise<void>
  resetPassword(email: string, code: string, password: string): Promise<void>
}

export function createAuthClient(
  baseUrl: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  now: () => number = () => Date.now(),
): AuthClient {
  let jwt: string | null = null

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new AuthError('NETWORK', 0, friendlyAuthMessage('NETWORK', 0))
    }
    const text = await res.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!res.ok) {
      const code = (data as { code?: string } | null)?.code ?? `HTTP_${res.status}`
      throw new AuthError(code, res.status, friendlyAuthMessage(code, res.status))
    }
    return data as T
  }

  return {
    async getSession() {
      const s = await call<{ user: User } | null>('GET', '/get-session')
      return s?.user ?? null
    },
    async signIn(email, password) {
      jwt = null
      const r = await call<{ user: User }>('POST', '/sign-in/email', { email: email.trim(), password })
      return r.user
    },
    async signOut() {
      jwt = null
      await call('POST', '/sign-out', {})
    },
    async getJwt() {
      if (needsRefresh(jwt, now())) jwt = (await call<{ token: string }>('GET', '/token')).token
      return jwt as string
    },
    async sendResetCode(email) {
      await call('POST', '/forget-password/email-otp', { email: email.trim() })
    },
    async resetPassword(email, code, password) {
      await call('POST', '/email-otp/reset-password', { email: email.trim(), otp: code.trim(), password })
    },
  }
}
