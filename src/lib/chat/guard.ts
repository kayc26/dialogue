// Checks on every model-written answer, before display (ADR-0005, QST-DIAB-DOSE-GUARD:
// D, part 1: the fixed-rule output gate, outside the agent loop). Any failure blocks
// the answer; the turn then falls back to showing an approved passage verbatim.
//
//   1. no dose advice: amounts of insulin, instructions to take/change/skip doses,
//      ratio or correction arithmetic;
//   2. every number in the answer appears in a cited passage or the user's own message
//      (paraphrase drift hits numbers first: "15 grams" becoming "15–20 grams");
//   3. citations name passages the model was actually shown, and there is at least one.

export type GuardResult = { ok: true; citations: string[] } | { ok: false; reason: string }

const DOSE_ADVICE: RegExp[] = [
  /\b\d+(?:\.\d+)?\s*(?:units?|u)\b(?!\s*(?:of|per)\s+(?:measure|carb))/i,
  /\b(?:take|inject|give|use|bolus|dose)\s+(?:yourself\s+)?(?:about\s+|around\s+)?\d/i,
  /\b(?:increase|decrease|raise|lower|reduce|adjust|change|double|halve|skip|stop|cut)\b[^.]{0,30}\b(?:your\s+)?(?:insulin|dose|doses|basal|bolus|units?)\b/i,
  /\bcorrection (?:factor|dose|bolus)\b[^.]{0,60}\d/i,
  /\b(?:insulin[- ]to[- ]carb(?:ohydrate)?|carb(?:ohydrate)?) ratio\b[^.]{0,60}\d/i,
  /\b1 unit (?:for|per)\b/i,
]

const CITE = /\[kb:([a-z0-9-]+)\]/gi

export function citationsIn(text: string): string[] {
  return [...new Set([...text.matchAll(CITE)].map((m) => m[1].toLowerCase()))]
}

/** Numbers as written, ignoring citation ids. "70–180" yields 70 and 180. */
function numbersIn(text: string): string[] {
  return (text.replace(CITE, ' ').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
}

export function checkAnswer(
  answer: string,
  shown: { id: string; body: string }[],
  userMessage: string,
): GuardResult {
  for (const re of DOSE_ADVICE) if (re.test(answer)) return { ok: false, reason: `dose_advice:${re.source.slice(0, 40)}` }

  const citations = citationsIn(answer)
  if (citations.length === 0) return { ok: false, reason: 'no_citation' }
  const shownIds = new Set(shown.map((p) => p.id.toLowerCase()))
  const unknown = citations.filter((c) => !shownIds.has(c))
  if (unknown.length) return { ok: false, reason: `unknown_citation:${unknown.join(',')}` }

  const allowed = new Set([
    ...shown.filter((p) => citations.includes(p.id.toLowerCase())).flatMap((p) => numbersIn(p.body)),
    ...numbersIn(userMessage),
  ])
  const unsupported = numbersIn(answer).filter((n) => !allowed.has(n))
  if (unsupported.length) return { ok: false, reason: `unsupported_number:${[...new Set(unsupported)].join(',')}` }

  return { ok: true, citations }
}

/** The text a patient sees: citations removed (they are shown as source chips). */
export function stripCitations(text: string): string {
  return text.replace(CITE, '').replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim()
}
