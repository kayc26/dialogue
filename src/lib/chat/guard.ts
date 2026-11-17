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

// A citation group: "[kb:a]", and the shapes models actually write besides it —
// "[kb: a]", "[kb:a, kb:b]", "[kb:a; b]", "(kb:a)", "【kb:a】". Every id inside counts.
const CITE = /[[(【]\s*kb:\s*([a-z0-9-]+(?:\s*[,;]\s*(?:kb:\s*)?[a-z0-9-]+)*)\s*[\])】]/gi

export function citationsIn(text: string): string[] {
  const ids = [...text.matchAll(CITE)].flatMap((m) => m[1].split(/\s*[,;]\s*/).map((s) => s.replace(/^kb:\s*/i, '').toLowerCase()))
  return [...new Set(ids)]
}

/** Numbers as written, ignoring citation ids. "70–180" yields 70 and 180. */
function numbersIn(text: string): string[] {
  return (text.replace(CITE, ' ').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
}

/** Rule 2's patterns: the reason an answer would be blocked as dose advice, or null.
 *  Exported so a test run with rule 2 paused can still mark what it would have blocked. */
export function doseAdviceIn(answer: string): string | null {
  for (const re of DOSE_ADVICE) if (re.test(answer)) return `dose_advice:${re.source.slice(0, 40)}`
  return null
}

/**
 * The number check's authority clause (ADR-0013, QST-KB-BOOK-ROLE: A): a 'book'
 * passage can be cited for explanation, but its numbers don't count. The book's
 * personal targets (70–140 mg/dL, under 30 g of carbohydrate per meal) differ from
 * ADA's for older adults, and an answer citing both would otherwise pass with the
 * book's number.
 */
export function checkAnswer(
  answer: string,
  shown: { id: string; body: string; source_label?: string }[],
  userMessage: string,
  /** Rule 2. Only test runs turn it off (ADR-0013, Kay 2026-11-16); the live app never does. */
  opts: { doseAdvice?: boolean } = {},
): GuardResult {
  if (!answer.trim()) return { ok: false, reason: 'empty_answer' }
  const dose = doseAdviceIn(answer)
  if (dose && (opts.doseAdvice ?? true)) return { ok: false, reason: dose }

  const citations = citationsIn(answer)
  if (citations.length === 0) return { ok: false, reason: 'no_citation' }
  const shownIds = new Set(shown.map((p) => p.id.toLowerCase()))
  const unknown = citations.filter((c) => !shownIds.has(c))
  if (unknown.length) return { ok: false, reason: `unknown_citation:${unknown.join(',')}` }

  const allowed = new Set([
    ...shown
      .filter((p) => citations.includes(p.id.toLowerCase()) && p.source_label !== 'book')
      .flatMap((p) => numbersIn(p.body)),
    ...numbersIn(userMessage),
  ])
  const unsupported = numbersIn(answer).filter((n) => !allowed.has(n))
  if (unsupported.length) return { ok: false, reason: `unsupported_number:${[...new Set(unsupported)].join(',')}` }

  return { ok: true, citations }
}

/** Sentences, each keeping the citations written right after it ("…too. [kb:x]"). */
function sentencesOf(text: string): string[] {
  const cite = String.raw`\s*[[(【]\s*kb:[^\])】]*[\])】]`
  return text.match(new RegExp(String.raw`[^.!?]+(?:[.!?]+|$)(?:${cite})*`, 'g'))?.map((s) => s.trim()).filter(Boolean) ?? []
}

/**
 * Trim, don't block, on a book number (ADR-0013, QST-KB-RAG-ROUND3: B, Kay 2026-11-16).
 * When every number the guard rejected appears in a cited book passage, the sentences
 * carrying those numbers are dropped and the rest is checked again from scratch. The
 * trimmed answer is returned if it passes every check, whatever it cites (QST-KB-TRIM-ADA:
 * B, Kay 2026-11-16: the same as a number-free answer, which may cite only the book).
 * An invented number or dose advice returns null, and the whole answer stays blocked.
 */
export function trimBookNumbers(
  answer: string,
  shown: { id: string; body: string; source_label?: string }[],
  userMessage: string,
  opts: { doseAdvice?: boolean } = {},
): { text: string; dropped: string[]; citations: string[] } | null {
  const first = checkAnswer(answer, shown, userMessage, opts)
  if (first.ok || !first.reason.startsWith('unsupported_number:')) return null
  const rejected = first.reason.slice('unsupported_number:'.length).split(',')
  const cited = new Set(citationsIn(answer))
  const bookNumbers = new Set(shown.filter((p) => cited.has(p.id.toLowerCase()) && p.source_label === 'book').flatMap((p) => numbersIn(p.body)))
  if (!rejected.every((n) => bookNumbers.has(n))) return null // an invented number blocks the whole answer
  const sentences = sentencesOf(answer)
  const dropped = sentences.filter((s) => numbersIn(s).some((n) => rejected.includes(n)))
  const text = sentences.filter((s) => !dropped.includes(s)).join(' ')
  const again = checkAnswer(text, shown, userMessage, opts)
  if (!again.ok) return null
  return { text, dropped, citations: again.citations }
}

/** The text a patient sees: citations removed (they are shown as source chips). */
/**
 * A short clarifying question may go out without a citation (ADR-0018 iteration 5,
 * Kay 2026-11-17: "clarifying questions are fine if not sure"). Everything else the
 * model writes must still cite. Narrow on purpose, and checked here, not trusted to the
 * prompt: one sentence ending in "?", at most 30 words, no citation, no dose advice,
 * and no number the patient didn't write ("Is your sugar above 250?" reads as a
 * threshold). Returns the question to show, or null.
 */
export function clarifyingQuestion(draft: string, userMessage: string, opts: { doseAdvice?: boolean } = {}): string | null {
  const text = draft.trim()
  if (!text || citationsIn(text).length > 0) return null
  if (!text.endsWith('?') || (text.match(/\?/g) ?? []).length !== 1 || /[.!]\s/.test(text)) return null
  if (text.split(/\s+/).length > 30) return null
  if ((opts.doseAdvice ?? true) && doseAdviceIn(text)) return null
  const allowed = new Set(numbersIn(userMessage))
  if (numbersIn(text).some((n) => !allowed.has(n))) return null
  return text
}

export function stripCitations(text: string): string {
  return text.replace(CITE, '').replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim()
}
