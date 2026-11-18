// Plan read-back test (ADR-0020): with the live classifier, does each question in
// kb/plan-questions.txt get the plan, the refusal, or the normal answer path? Runs the
// app's classifier, combineTriage and planBlocker exactly as turn.ts step 3-plan does;
// no answer model is called. Cheap: one classifier call per question.
//
// Run: npm run kb:eval-plan -- --yes   (dry run without --yes)
// Writes kb/out/eval-plan.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { combineTriage, parseClassifier } from '../src/lib/chat/combine'
import { openRouterModels, type CostMeter } from '../src/lib/chat/models'
import { planBlocker } from '../src/lib/chat/plan'
import { triageRules } from '../src/lib/chat/triage'

const MAX_DOLLARS = 0.05
const NONE = { history_of_dka: false, pregnant: false, uses_pump: false }
type Want = 'show' | 'refuse' | 'answer'
const tests = readFileSync('kb/plan-questions.txt', 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [want, ...q] = l.split('|')
    return { want: want.trim() as Want, question: q.join('|').trim() }
  })

const key = process.env.OPENROUTER_API_KEY ?? ''
console.log(`${tests.length} questions · OpenRouter key: ${key ? 'set' : 'NOT SET (OPENROUTER_API_KEY)'} · stop above $${MAX_DOLLARS}`)
if (!process.argv.includes('--yes') || !key) {
  console.log('Dry run: no model calls. Re-run with --yes.')
  process.exit(0)
}

const meter: CostMeter = { dollars: 0, calls: 0 }
const models = openRouterModels(key, meter)
const rows: string[] = []
let passed = 0
let dangerous = 0
for (const [i, t] of tests.entries()) {
  if (meter.dollars > MAX_DOLLARS) break
  const rules = triageRules(t.question, NONE)
  const c = parseClassifier(await models.classify(t.question, []))
  const triage = combineTriage(rules, c)
  // The same decision as turn.ts (step 3-plan), for a patient who has a regimen.
  const blocker = c?.plan_question ? (triage.tier !== 'none' ? `tier_${triage.tier}` : planBlocker(t.question, rules.glucose)) : null
  const got: Want = c?.plan_question && blocker === null ? 'show' : triage.doseIntent ? 'refuse' : 'answer'
  const ok = got === t.want
  if (ok) passed++
  if (got === 'show' && t.want !== 'show') dangerous++
  rows.push(`| ${i + 1} | ${ok ? 'PASS' : got === 'show' ? '**FAIL (plan shown)**' : '**FAIL**'} | ${t.question} | ${t.want} | ${got} | ${c ? `plan_question ${c.plan_question}, dose ${c.dose_intent}` : 'no reply'} | ${blocker ?? '-'} | ${triage.tier} |`)
  process.stdout.write(ok ? '.' : 'F')
}
const summary = `Plan read-back passed ${passed}/${tests.length}; plan shown when it shouldn't be: ${dangerous} · $${meter.dollars.toFixed(4)} over ${meter.calls} calls`
writeFileSync(
  'kb/out/eval-plan.md',
  `# Plan read-back test (${new Date().toISOString().slice(0, 10)})\n\n**${summary}**\n\n| # | Result | Question | Expected | Got | Classifier | Fixed check | Tier |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
)
console.log(`\n${summary}\nwrote kb/out/eval-plan.md`)
