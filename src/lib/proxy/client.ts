// The chat's view of the tester's allowance (ADR-0014, C: $1 per tester, shown as a
// percentage, never in dollars). Asked of the model proxy, which counts the spending.

export interface AllowanceView {
  used: number
  /** Null for an uncapped role (the admin). */
  cap: number | null
  /** 0–100; null when uncapped. */
  percent: number | null
}

/** The caller's allowance, or null if the proxy can't be reached (the chat just omits the line). */
export async function fetchAllowance(
  baseUrl: string,
  getJwt: () => Promise<string>,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<AllowanceView | null> {
  try {
    const res = await fetchImpl(`${baseUrl}/allowance`, { headers: { Authorization: `Bearer ${await getJwt()}` } })
    if (!res.ok) return null
    return (await res.json()) as AllowanceView
  } catch {
    return null
  }
}

/** What the chat shows under the Ask box. */
export function allowanceText(a: AllowanceView | null): string {
  if (!a) return ''
  if (a.percent === null) return 'Test allowance: not capped (admin)'
  if (a.percent >= 100) return "You've used all of your test allowance"
  return `You've used ${a.percent}% of your test allowance`
}
