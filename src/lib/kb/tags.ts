// Knowledge-base passage tags (ADR-0005 iteration 6, ADR-0006).
//
//   dose_related  passage explains or tells the reader how to calculate, choose, or
//                 change an insulin/medication dose. Narrow boundary (QST-DIAB-DOSE-
//                 BOUNDARY: B) keeps these in the corpus, but the dose guard (QST-DIAB-
//                 DOSE-GUARD: D) shows them verbatim only and never feeds them to the
//                 model to rewrite. False positives are cheap (a passage shown verbatim);
//                 false negatives put dose arithmetic in the model's context. So these
//                 patterns lean broad, and every flagged passage gets human review.
//   medication    mentions a diabetes medication or device (attach care-team wording).
//   urgent        hypo/hyper/DKA/emergency content the escalation cards can draw on.

export type KbTag = 'dose_related' | 'medication' | 'urgent'

const DOSE: RegExp[] = [
  /\b\d+(?:\.\d+)?\s*units?\b/i, // "2 units", "10 unit"
  /\bunits? of (?:\w+ )?insulin\b/i,
  /\bdos(?:e|es|ed|ing|age)\b/i,
  /\bcorrection (?:insulin|factor|dose|bolus|scale)\b/i,
  /\binsulin[- ]to[- ]carb(?:ohydrate)?s?\b/i,
  /\bcarb(?:ohydrate)?s? ratio\b/i,
  /\bsliding scale\b/i,
  /\bbasal rates?\b/i,
  /\bbolus(?:es|ing)?\b/i,
  /\b(?:adjust|change|increase|decrease|lower|raise|skip)\w*\b[^.?!]{0,40}\b(?:insulin|medications?|medicines?)\b/i,
]

const MEDICATION =
  /\b(?:insulins?|metformin|medications?|medicines?|glucagon|pumps?|prescri\w+|injections?|pen needles?|sulfonylureas?|GLP-1|SGLT2)\b/i

const URGENT =
  /\b(?:hypoglycemia|low blood (?:glucose|sugar)|rule of 15|glucagon|ketones?|ketoacidosis|DKA|emergency|911|seek (?:medical|emergency) (?:attention|care)|unconscious|passe[sd] out|seizures?)\b/i

export function tagPassage(text: string): KbTag[] {
  const tags: KbTag[] = []
  if (DOSE.some((re) => re.test(text))) tags.push('dose_related')
  if (MEDICATION.test(text)) tags.push('medication')
  if (URGENT.test(text)) tags.push('urgent')
  return tags
}
