// Data API client (PostgREST over Neon). Every request carries the signed-in user's
// JWT; what comes back is decided by row-level security (ADR-0011), not by this code.

export type Role = 'patient_tester' | 'careteam_tester' | 'admin'

export interface Membership {
  user_id: string
  role: Role
  display_name: string
}

export class DataError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface DataClient {
  get<T>(path: string): Promise<T>
  /** Insert; returns the inserted rows. */
  post?<T>(table: string, body: unknown): Promise<T[]>
}

const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createDataClient(
  baseUrl: string,
  getJwt: () => Promise<string>,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  wait: (ms: number) => Promise<void> = realWait,
): Required<DataClient> {
  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetchImpl(`${baseUrl}/${path}`, {
        headers: { Authorization: `Bearer ${await getJwt()}`, Accept: 'application/json' },
      })
      if (!res.ok) throw new DataError(res.status, `Data API ${res.status}`)
      return (await res.json()) as T
    },
    async post<T>(table: string, body: unknown): Promise<T[]> {
      // TD-3: right after a compute wakes, RLS can briefly see no user, so a write a
      // member is allowed to make comes back 401/403. Retry once after a short wait.
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(`${baseUrl}/${table}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await getJwt()}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(body),
        })
        if (res.ok) return (await res.json()) as T[]
        if ((res.status === 401 || res.status === 403) && attempt === 0) {
          await wait(700)
          continue
        }
        throw new DataError(res.status, `Data API ${res.status}`)
      }
    },
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Read rows that should exist, retrying briefly when the answer is empty.
 *
 * Observed 2026-11-14 on the rls-dev branch: right after a suspended Neon compute
 * wakes, the first Data API read can return `200 []` for a signed-in member, as if
 * RLS saw no user, and the next read is correct. It fails closed (no data leaks), but
 * a member could be told "not added to this demo" or see no demo patients. An empty
 * result is only believed after the retries.
 */
export async function getNonEmpty<T>(
  data: DataClient,
  path: string,
  opts: { retries?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T[]> {
  const { retries = 2, waitMs = 500, sleep = realSleep } = opts
  for (let attempt = 0; ; attempt++) {
    const rows = await data.get<T[]>(path)
    if (rows.length > 0 || attempt >= retries) return rows
    await sleep(waitMs * (attempt + 1))
  }
}

/**
 * The caller's own membership row, or null for an account that exists but was never
 * added to the demo (RLS shows each member only their own row; a stranger sees none).
 */
export async function getMembership(
  data: DataClient,
  userId: string,
  sleep?: (ms: number) => Promise<void>,
): Promise<Membership | null> {
  const rows = await getNonEmpty<Membership>(
    data,
    `members?user_id=eq.${encodeURIComponent(userId)}&select=user_id,role,display_name`,
    { sleep },
  )
  return rows[0] ?? null
}

/** Which views a role may open (ADR-0011: admin sees both). */
export function viewsFor(role: Role): Array<'patient' | 'careteam'> {
  if (role === 'admin') return ['patient', 'careteam']
  return role === 'patient_tester' ? ['patient'] : ['careteam']
}
