// 2026-11-16-rule2-match-probe.ts
// Context: ADR-0013, fourth FAQ run (rules 1-3 paused in tests). The run marked answer
// #9 ("Why is my blood sugar high?") as one rule 2 would have blocked, though it reads
// as a correct, dose-free answer. This prints exactly which text each rule-2 pattern
// matches, so a false positive can be told from a real catch. $0, no model calls.
//
// Usage: node scripts/ephemeral/2026-11-16-rule2-match-probe.ts
//
// Outcome (2026-11-16): reading answers one line at a time found nothing to flag,
// which revealed that answers span several paragraphs and that Nibble's earlier
// listings (grep) had shown only first paragraphs. In full, #9 matched "Don't skip a
// dose" (ADA's adherence advice): a rule-2 false positive (ADR-0013, QST-KB-RUN4-NEXT B).
// Scores of the earlier runs were corrected in ADR-0013.

import { readFileSync } from 'node:fs'
import { doseAdviceIn } from '../../src/lib/chat/guard.ts'

// Every AI-written answer in the latest run, exactly as stored (kb/out/eval-faq.md).
const answers = readFileSync('kb/out/eval-faq.md', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('**[AI-written answer'))
  .map((l) => l.replace(/^\*\*\[[^\]]*\]\*\*\s*/, ''))
const VERB = /\b(?:increase|decrease|raise|lower|reduce|adjust|change|double|halve|skip|stop|cut)\b[^.]{0,30}\b(?:your\s+)?(?:insulin|dose|doses|basal|bolus|units?)\b/i
for (const a of answers.filter((x) => doseAdviceIn(x))) {
  console.log('\nanswer:', a.slice(0, 120))
  console.log('rule 2 says:', doseAdviceIn(a))
  console.log('verb pattern matched:', JSON.stringify(a.match(VERB)?.[0] ?? null))
}
