// When may the app read the patient's plan back in chat? (ADR-0020, QST-READ-WHEN: A)
//
// The classifier says whether the message asks what the plan says (`plan_question`).
// These fixed checks then veto the read-back whenever the message carries anything that
// turns "what does my plan say?" into "what should I do now?": a glucose number, a
// symptom, a change word, or a request for advice. A plan read back under "my sugar is
// 300, what's my dose?" would read as "take your usual dose anyway". The checks are
// rules, not a model, so they can't be argued out of a refusal; when one fires, the
// turn falls back to the dose refusal, exactly as before ADR-0020.

/** Words that ask to change, skip, or make up a dose. */
const CHANGE = /\b(?:more|less|extra|skip\w*|stop\w*|chang\w+|adjust\w*|increas\w+|decreas\w+|rais\w+|lower\w*|doubl\w+|cut|miss\w*|forg[eo]t\w*|instead|correct\w*|bolus|cover\w*|too (?:much|many|little|few))\b/i

/** Feeling unwell, a high or low, or not eating: the plan may no longer fit the day. */
const SYMPTOM = /\b(?:shak\w*|dizz\w*|sweat\w*|sick|ill|unwell|vomit\w*|throw\w* up|nause\w*|confus\w*|weak|faint\w*|pass(?:ed)? out|ketones?|high|low|hungry|feel\w*|pain|hurt\w*|(?:can'?t|cannot|didn'?t|not|won'?t) (?:eat|keep (?:food|anything) down))\b/i

/** Asking for a judgement rather than what the plan says. */
const ADVICE = /\b(?:should i|can i|could i|is it (?:ok|okay|safe|fine|alright)|am i allowed|do i need to|what if)\b/i

/**
 * A number that could be a reading: two or three digits, 40 or more, not part of an
 * insulin name like "70/30", and not a plan day ("day 9"). The triage rules only parse
 * numbers next to a glucose word; "it's 280, what's my dose?" has none.
 */
function readingLike(message: string): boolean {
  for (const m of message.matchAll(/(?<![\d/.])(\d{2,3})(?![\d/.])/g)) {
    const before = message.slice(Math.max(0, m.index! - 5), m.index!)
    if (/\/\s*$/.test(before) || /\bdays?\s*$/i.test(before)) continue
    if (Number(m[1]) >= 40) return true
  }
  return false
}

/**
 * Why the plan must not be read back for this message, or null when it may be.
 * `glucose` is the reading the triage rules parsed (triage.ts), if any.
 */
export function planBlocker(message: string, glucose: number | null): string | null {
  if (glucose !== null || readingLike(message)) return 'reading'
  if (SYMPTOM.test(message)) return 'symptom'
  if (CHANGE.test(message)) return 'change'
  if (ADVICE.test(message)) return 'advice'
  return null
}
