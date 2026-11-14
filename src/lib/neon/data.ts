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
}

export function createDataClient(
  baseUrl: string,
  getJwt: () => Promise<string>,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): DataClient {
  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetchImpl(`${baseUrl}/${path}`, {
        headers: { Authorization: `Bearer ${await getJwt()}`, Accept: 'application/json' },
      })
      if (!res.ok) throw new DataError(res.status, `Data API ${res.status}`)
      return (await res.json()) as T
    },
  }
}

/**
 * The caller's own membership row, or null for an account that exists but was never
 * added to the demo (RLS shows each member only their own row; a stranger sees none).
 */
export async function getMembership(data: DataClient, userId: string): Promise<Membership | null> {
  const rows = await data.get<Membership[]>(
    `members?user_id=eq.${encodeURIComponent(userId)}&select=user_id,role,display_name`,
  )
  return rows[0] ?? null
}

/** Which views a role may open (ADR-0011: admin sees both). */
export function viewsFor(role: Role): Array<'patient' | 'careteam'> {
  if (role === 'admin') return ['patient', 'careteam']
  return role === 'patient_tester' ? ['patient'] : ['careteam']
}
