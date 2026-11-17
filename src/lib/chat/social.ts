// Small talk in a cited assistant (ADR-0016, Kay 2026-11-17: QST-SOCIAL-PATH A).
//
// The guard requires every model-written answer to cite a passage (ADR-0005). A
// greeting has nothing to cite, so "hi" used to reach the answer model, get blocked
// (`no_citation`), and show "I don't have information on that". Messages that are
// ONLY small talk now get a fixed, approved reply instead, with no answer model.
//
// Matching is a closed list on purpose: the whole message must be made of the
// phrases below. Anything else ("hi, what should I eat?", "hi, I feel dizzy") takes
// the normal path. A missed phrasing therefore falls back to the old behaviour, never
// to an unguarded model reply. The turn calls this only after triage says `none`, so
// a greeting with a red flag still escalates.

export type SocialIntent = 'greeting' | 'thanks' | 'goodbye' | 'about'

/** The fixed replies (QST-SOCIAL-TEXT: A, "computer assistant" → "AI assistant").
 *  Kay-approved for testing; the clinical sponsor confirms them with the card review. */
export const SOCIAL_REPLY: Record<SocialIntent, string> = {
  greeting: 'Hello! I can answer general questions about diabetes, like eating, blood sugar, and everyday care. What would you like to know?',
  thanks: "You're welcome. Is there anything else you'd like to ask?",
  goodbye: 'Take care. If you feel unwell, use the red Get help now button or call your care team.',
  about:
    "I'm an AI assistant, not a nurse or doctor. I can answer general questions about diabetes from material your care team approved. I can't give advice about your medicine doses. For that, please call your care team.",
}

/** Shown when nothing approved answers the question (QST-NO-INFO-TEXT: B). */
export const NO_INFO_REPLY =
  "I don't have information on that. I can answer general questions about eating, blood sugar, and everyday diabetes care. For anything else, your care team can help."

// Each phrase must match a whole run of words. `null` intent = filler that may sit
// beside small talk ("ok thanks", "hi dear") but is not small talk on its own.
const PHRASES: [RegExp, SocialIntent | null][] = [
  [/^(?:hi+|hello+|hey+|hiya|howdy|greetings|good (?:morning|afternoon|evening|day))(?: there| again| everyone)?/, 'greeting'],
  [/^(?:how are you(?: doing)?(?: today)?|hope you(?: are|'re) (?:well|doing well))/, 'greeting'],
  [/^(?:thank you|thanks|thank u|ty|thx)(?: (?:so|very) much| a lot| again)?|^much appreciated/, 'thanks'],
  [/^(?:bye(?: bye)?|goodbye|good night|see you(?: later| soon)?|take care|talk (?:to you )?later|that(?:'s| is) (?:all|it)(?: for now)?|have a (?:good|nice|great) (?:day|night|evening|one))/, 'goodbye'],
  [/^(?:who are you|what are you|what do you do|what can you do(?: for me)?|(?:what|how) can you help(?: me)?(?: with)?|(?:are you|is this)(?: a)?(?: real)? (?:person|human|nurse|doctor|robot|bot|computer|ai|machine))/, 'about'],
  [/^(?:ok(?:ay)?|oh|well|so|um+|dear|friend|assistant|bot)/, null],
]
// When a message mixes kinds, the more useful reply wins: "hi, what can you do" is
// answered as `about`, "thanks, bye" as `goodbye`.
const PRIORITY: SocialIntent[] = ['about', 'goodbye', 'thanks', 'greeting']

export function socialIntent(message: string): SocialIntent | null {
  if (message.length > 80) return null
  let rest = message
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const found = new Set<SocialIntent>()
  while (rest) {
    let matched = false
    for (const [re, intent] of PHRASES) {
      const m = re.exec(rest)
      // whole words only: "hi" must not match the start of "high"
      if (m && (rest.length === m[0].length || rest[m[0].length] === ' ')) {
        if (intent) found.add(intent)
        rest = rest.slice(m[0].length).trim()
        matched = true
        break
      }
    }
    if (!matched) return null
  }
  return PRIORITY.find((i) => found.has(i)) ?? null
}
